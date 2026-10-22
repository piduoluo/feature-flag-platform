package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/handler"
)

// createFlagForAuditTest creates a flag through the public API and returns its id.
func createFlagForAuditTest(t *testing.T, router *gin.Engine, key string, env domain.Environment) int64 {
	t.Helper()

	body, err := json.Marshal(domain.CreateFlagRequest{
		Key:         key,
		Name:        "Audit Handler Test Flag",
		Environment: env,
	})
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var resp handler.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	return int64(data["id"].(float64))
}

func getAuditLogsRaw(t *testing.T, router *gin.Engine, query string) (*httptest.ResponseRecorder, handler.Response) {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, "/api/v1/audit-logs"+query, nil)
	require.NoError(t, err)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var resp handler.Response
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	return w, resp
}

func auditListData(t *testing.T, resp handler.Response) (items []interface{}, total float64, page float64, pageSize float64) {
	t.Helper()

	dataMap, ok := resp.Data.(map[string]interface{})
	require.True(t, ok, "data must be an object")

	items, ok = dataMap["items"].([]interface{})
	require.True(t, ok, "data.items must be an array")

	total, ok = dataMap["total"].(float64)
	require.True(t, ok, "data.total must be a number")

	page, ok = dataMap["page"].(float64)
	require.True(t, ok, "data.page must be a number")

	pageSize, ok = dataMap["page_size"].(float64)
	require.True(t, ok, "data.page_size must be a number")

	return items, total, page, pageSize
}

func TestAuditHandler_ListAuditLogs_ReturnsEnvelopeWithFlagID(t *testing.T) {
	router := setupTestServer(t)

	key := fmt.Sprintf("h_audit_list_%d", time.Now().UnixNano())
	flagID := createFlagForAuditTest(t, router, key, domain.EnvProduction)

	w, resp := getAuditLogsRaw(t, router, "?page=1&page_size=20")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "SUCCESS", resp.Code)

	items, total, page, pageSize := auditListData(t, resp)
	assert.Equal(t, float64(1), page)
	assert.Equal(t, float64(20), pageSize)
	assert.GreaterOrEqual(t, total, float64(1))
	require.NotEmpty(t, items)

	// Newest audit log must be first (created_at DESC, id DESC).
	newest, ok := items[0].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, key, newest["flag_key"])
	assert.Equal(t, float64(flagID), newest["flag_id"])
	assert.Equal(t, string(domain.EnvProduction), newest["environment"])
	assert.Equal(t, domain.ActionFlagCreated, newest["action_type"])
	assert.Equal(t, domain.DefaultOperator, newest["operator"])
	assert.Contains(t, newest, "diff_summary")
	assert.Contains(t, newest, "created_at")

	// Omitted pagination parameters fall back to page=1, page_size=20.
	_, defaultResp := getAuditLogsRaw(t, router, "?flag_key="+key)
	_, defaultTotal, defaultPage, defaultPageSize := auditListData(t, defaultResp)
	assert.Equal(t, float64(1), defaultTotal)
	assert.Equal(t, float64(1), defaultPage)
	assert.Equal(t, float64(20), defaultPageSize)
}

func TestAuditHandler_ListAuditLogs_FiltersByEnvironment(t *testing.T) {
	router := setupTestServer(t)

	stagingKey := fmt.Sprintf("h_audit_env_staging_%d", time.Now().UnixNano())
	prodKey := fmt.Sprintf("h_audit_env_prod_%d", time.Now().UnixNano())
	createFlagForAuditTest(t, router, stagingKey, domain.EnvStaging)
	createFlagForAuditTest(t, router, prodKey, domain.EnvProduction)

	w, resp := getAuditLogsRaw(t, router, "?environment=staging&page_size=100")
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "SUCCESS", resp.Code)

	items, _, _, _ := auditListData(t, resp)
	require.NotEmpty(t, items)

	newest, ok := items[0].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, stagingKey, newest["flag_key"], "only staging logs should be returned, newest first")

	for _, raw := range items {
		item, ok := raw.(map[string]interface{})
		require.True(t, ok)
		assert.Equal(t, string(domain.EnvStaging), item["environment"])
		assert.NotEqual(t, prodKey, item["flag_key"])
	}
}

func TestAuditHandler_ListAuditLogs_FuzzyMatchesFlagKey(t *testing.T) {
	router := setupTestServer(t)

	prefix := fmt.Sprintf("h_audit_search_%d", time.Now().UnixNano())
	alphaKey := prefix + "_alpha"
	betaKey := prefix + "_beta"
	createFlagForAuditTest(t, router, alphaKey, domain.EnvDevelopment)
	createFlagForAuditTest(t, router, betaKey, domain.EnvDevelopment)

	// Case-insensitive substring match, mirroring the flag list search behaviour.
	w, resp := getAuditLogsRaw(t, router, "?flag_key="+strings.ToUpper(prefix)+"&page_size=100")
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "SUCCESS", resp.Code)

	items, total, _, _ := auditListData(t, resp)
	assert.Equal(t, float64(2), total)
	require.Len(t, items, 2)

	seen := map[string]bool{}
	for _, raw := range items {
		item, ok := raw.(map[string]interface{})
		require.True(t, ok)
		flagKey, _ := item["flag_key"].(string)
		assert.Contains(t, flagKey, prefix)
		seen[flagKey] = true
	}
	assert.True(t, seen[alphaKey] && seen[betaKey])

	// LIKE wildcards in user input must be treated literally, not as a match-all.
	_, wildcardResp := getAuditLogsRaw(t, router, "?flag_key=%25")
	_, wildcardTotal, _, _ := auditListData(t, wildcardResp)
	assert.Equal(t, float64(0), wildcardTotal)
}

func TestAuditHandler_ListAuditLogs_FiltersByActionType(t *testing.T) {
	router := setupTestServer(t)

	key := fmt.Sprintf("h_audit_action_%d", time.Now().UnixNano())
	flagID := createFlagForAuditTest(t, router, key, domain.EnvDevelopment)

	toggleBody, err := json.Marshal(domain.ToggleFlagRequest{Enabled: boolPtr(true)})
	require.NoError(t, err)
	toggleReq, err := http.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/flags/%d/toggle", flagID), bytes.NewBuffer(toggleBody))
	require.NoError(t, err)
	toggleReq.Header.Set("Content-Type", "application/json")
	toggleW := httptest.NewRecorder()
	router.ServeHTTP(toggleW, toggleReq)
	require.Equal(t, http.StatusOK, toggleW.Code, toggleW.Body.String())

	toggledOnly, resp := getAuditLogsRaw(t, router, "?flag_key="+key+"&action_type=FLAG_TOGGLED")
	assert.Equal(t, http.StatusOK, toggledOnly.Code)
	assert.Equal(t, "SUCCESS", resp.Code)

	items, total, _, _ := auditListData(t, resp)
	assert.Equal(t, float64(1), total)
	require.Len(t, items, 1)
	item, ok := items[0].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, domain.ActionFlagToggled, item["action_type"])
	assert.Equal(t, key, item["flag_key"])

	createdOnly, createdResp := getAuditLogsRaw(t, router, "?flag_key="+key+"&action_type=FLAG_CREATED")
	assert.Equal(t, http.StatusOK, createdOnly.Code)
	createdItems, createdTotal, _, _ := auditListData(t, createdResp)
	assert.Equal(t, float64(1), createdTotal)
	require.Len(t, createdItems, 1)
	createdItem, ok := createdItems[0].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, domain.ActionFlagCreated, createdItem["action_type"])
}

func TestAuditHandler_ListAuditLogs_Paginates(t *testing.T) {
	router := setupTestServer(t)

	prefix := fmt.Sprintf("h_audit_page_%d", time.Now().UnixNano())
	for i := 1; i <= 3; i++ {
		createFlagForAuditTest(t, router, fmt.Sprintf("%s_%d", prefix, i), domain.EnvStaging)
	}

	page1W, page1Resp := getAuditLogsRaw(t, router, "?flag_key="+prefix+"&page=1&page_size=2")
	assert.Equal(t, http.StatusOK, page1W.Code)
	page1Items, page1Total, page1, page1Size := auditListData(t, page1Resp)
	assert.Equal(t, float64(3), page1Total)
	assert.Equal(t, float64(1), page1)
	assert.Equal(t, float64(2), page1Size)
	require.Len(t, page1Items, 2)

	page2W, page2Resp := getAuditLogsRaw(t, router, "?flag_key="+prefix+"&page=2&page_size=2")
	assert.Equal(t, http.StatusOK, page2W.Code)
	page2Items, page2Total, page2, _ := auditListData(t, page2Resp)
	assert.Equal(t, float64(3), page2Total)
	assert.Equal(t, float64(2), page2)
	require.Len(t, page2Items, 1)

	// Pages must not overlap and the newest key must land on page 1.
	firstID := page1Items[0].(map[string]interface{})["id"]
	secondPageID := page2Items[0].(map[string]interface{})["id"]
	assert.NotEqual(t, firstID, secondPageID)
	assert.Equal(t, prefix+"_3", page1Items[0].(map[string]interface{})["flag_key"])

	// Out-of-range page still reports the true total with an empty page.
	emptyW, emptyResp := getAuditLogsRaw(t, router, "?flag_key="+prefix+"&page=9&page_size=2")
	assert.Equal(t, http.StatusOK, emptyW.Code)
	emptyItems, emptyTotal, emptyPage, _ := auditListData(t, emptyResp)
	assert.Equal(t, float64(3), emptyTotal)
	assert.Equal(t, float64(9), emptyPage)
	assert.Empty(t, emptyItems)
}

func TestAuditHandler_ListAuditLogs_RejectsInvalidParams(t *testing.T) {
	router := setupTestServer(t)

	cases := []struct {
		name  string
		query string
	}{
		{"unknown action_type", "?action_type=FLAG_DELETED"},
		{"lowercase action_type", "?action_type=flag_created"},
		{"unknown environment", "?environment=moon"},
		{"page below one", "?page=0"},
		{"negative page", "?page=-3"},
		{"page not an integer", "?page=abc"},
		{"page_size below one", "?page_size=0"},
		{"page_size above maximum", "?page_size=101"},
		{"page_size not an integer", "?page_size=lots"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w, resp := getAuditLogsRaw(t, router, tc.query)
			assert.Equal(t, http.StatusBadRequest, w.Code)
			assert.Equal(t, domain.ErrCodeValidation, resp.Code)
			assert.Nil(t, resp.Data)
			assert.NotEmpty(t, resp.Message)
		})
	}
}
