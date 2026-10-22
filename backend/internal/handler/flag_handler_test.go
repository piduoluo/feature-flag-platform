package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/handler"
	"feature-flag-platform/internal/repository"
	"feature-flag-platform/internal/service"
)

func setupTestServer(t *testing.T) *gin.Engine {
	gin.SetMode(gin.TestMode)

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=" + os.Getenv("USER") + " dbname=feature_flag_test sslmode=disable"
	}

	db, err := repository.InitDB(dsn)
	require.NoError(t, err)

	flagRepo := repository.NewFlagRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	ruleRepo := repository.NewRuleRepository(db)
	flagService := service.NewFlagService(flagRepo, auditRepo)
	ruleService := service.NewRuleService(flagRepo, ruleRepo, auditRepo)
	flagHandler := handler.NewFlagHandler(flagService, ruleService)

	router := gin.New()
	router.Use(gin.Recovery())

	v1 := router.Group("/api/v1")
	flagHandler.RegisterRoutes(v1)

	return router
}

func boolPtr(b bool) *bool {
	return &b
}

func TestFlagHandler_CreateFlag_Success(t *testing.T) {
	router := setupTestServer(t)

	key := fmt.Sprintf("handler_flag_%d", time.Now().UnixNano())
	payload := domain.CreateFlagRequest{
		Key:          key,
		Name:         "Handler Test Flag",
		Description:  "Created via handler test",
		Environment:  domain.EnvProduction,
		DefaultValue: false,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp handler.Response
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", resp.Code)

	dataMap, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, key, dataMap["key"])
	assert.Equal(t, string(domain.EnvProduction), dataMap["environment"])
	assert.Equal(t, false, dataMap["enabled"])
}

func TestFlagHandler_CreateFlag_Conflict_SameEnv(t *testing.T) {
	router := setupTestServer(t)

	key := fmt.Sprintf("conflict_flag_%d", time.Now().UnixNano())
	payload := domain.CreateFlagRequest{
		Key:         key,
		Name:        "Conflict Test Flag",
		Environment: domain.EnvDevelopment,
	}
	body, _ := json.Marshal(payload)

	// First request succeeds
	req1, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(body))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusCreated, w1.Code)

	// Second request with same key and env fails with 409 and FLAG_KEY_CONFLICT
	req2, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(body))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusConflict, w2.Code)

	var resp handler.Response
	err := json.Unmarshal(w2.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, domain.ErrCodeKeyConflict, resp.Code)
}

func TestFlagHandler_CreateFlag_ValidationError(t *testing.T) {
	router := setupTestServer(t)

	// Missing key
	payload := domain.CreateFlagRequest{
		Key:         "",
		Name:        "No Key Flag",
		Environment: domain.EnvDevelopment,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp handler.Response
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, domain.ErrCodeValidation, resp.Code)
}

func TestFlagHandler_ListFlags(t *testing.T) {
	router := setupTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/flags?page=1&page_size=10", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp handler.Response
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", resp.Code)

	dataMap, ok := resp.Data.(map[string]interface{})
	require.True(t, ok)
	assert.Contains(t, dataMap, "items")
	assert.Contains(t, dataMap, "total")
}

func TestFlagHandler_GetFlag_NotFound(t *testing.T) {
	router := setupTestServer(t)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/flags/99999999", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var resp handler.Response
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, domain.ErrCodeFlagNotFound, resp.Code)
}

func TestFlagHandler_UpdateFlag(t *testing.T) {
	router := setupTestServer(t)

	// Create a flag first
	key := fmt.Sprintf("h_upd_flag_%d", time.Now().UnixNano())
	createBody, _ := json.Marshal(domain.CreateFlagRequest{
		Key:         key,
		Name:        "Before Update",
		Environment: domain.EnvDevelopment,
	})
	createReq, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)
	assert.Equal(t, http.StatusCreated, createW.Code)

	var createResp handler.Response
	_ = json.Unmarshal(createW.Body.Bytes(), &createResp)
	flagData := createResp.Data.(map[string]interface{})
	id := int64(flagData["id"].(float64))

	// Update the flag
	updBody, _ := json.Marshal(domain.UpdateFlagRequest{
		Name:         "After Update",
		Description:  "Updated description",
		DefaultValue: true,
	})
	updReq, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/flags/%d", id), bytes.NewBuffer(updBody))
	updReq.Header.Set("Content-Type", "application/json")
	updW := httptest.NewRecorder()
	router.ServeHTTP(updW, updReq)

	assert.Equal(t, http.StatusOK, updW.Code)
	var updResp handler.Response
	_ = json.Unmarshal(updW.Body.Bytes(), &updResp)
	updData := updResp.Data.(map[string]interface{})
	assert.Equal(t, "After Update", updData["name"])
	assert.Equal(t, "Updated description", updData["description"])
	assert.Equal(t, true, updData["default_value"])
}

func TestFlagHandler_ToggleFlag(t *testing.T) {
	router := setupTestServer(t)

	key := fmt.Sprintf("h_toggle_flag_%d", time.Now().UnixNano())
	createBody, _ := json.Marshal(domain.CreateFlagRequest{
		Key:         key,
		Name:        "Toggle Target",
		Environment: domain.EnvStaging,
	})
	createReq, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)
	assert.Equal(t, http.StatusCreated, createW.Code)

	var createResp handler.Response
	_ = json.Unmarshal(createW.Body.Bytes(), &createResp)
	flagData := createResp.Data.(map[string]interface{})
	id := int64(flagData["id"].(float64))

	// Toggle ON
	toggleBody, _ := json.Marshal(domain.ToggleFlagRequest{Enabled: boolPtr(true)})
	toggleReq, _ := http.NewRequest(http.MethodPatch, fmt.Sprintf("/api/v1/flags/%d/toggle", id), bytes.NewBuffer(toggleBody))
	toggleReq.Header.Set("Content-Type", "application/json")
	toggleW := httptest.NewRecorder()
	router.ServeHTTP(toggleW, toggleReq)

	assert.Equal(t, http.StatusOK, toggleW.Code)
	var toggleResp handler.Response
	_ = json.Unmarshal(toggleW.Body.Bytes(), &toggleResp)
	toggledData := toggleResp.Data.(map[string]interface{})
	assert.Equal(t, true, toggledData["enabled"])
}

func TestFlagHandler_GetAuditLogs(t *testing.T) {
	router := setupTestServer(t)

	key := fmt.Sprintf("h_audit_flag_%d", time.Now().UnixNano())
	createBody, _ := json.Marshal(domain.CreateFlagRequest{
		Key:         key,
		Name:        "Audit Target",
		Environment: domain.EnvProduction,
	})
	createReq, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	var createResp handler.Response
	_ = json.Unmarshal(createW.Body.Bytes(), &createResp)
	flagData := createResp.Data.(map[string]interface{})
	id := int64(flagData["id"].(float64))

	// Fetch audit logs
	auditReq, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/flags/%d/audit-logs", id), nil)
	auditW := httptest.NewRecorder()
	router.ServeHTTP(auditW, auditReq)

	assert.Equal(t, http.StatusOK, auditW.Code)
	var auditResp handler.Response
	_ = json.Unmarshal(auditW.Body.Bytes(), &auditResp)
	logs := auditResp.Data.([]interface{})
	assert.GreaterOrEqual(t, len(logs), 1)
	firstLog := logs[0].(map[string]interface{})
	assert.Equal(t, domain.ActionFlagCreated, firstLog["action_type"])
}

func TestFlagHandler_SyncRules(t *testing.T) {
	router := setupTestServer(t)

	key := fmt.Sprintf("h_rule_flag_%d", time.Now().UnixNano())
	createBody, _ := json.Marshal(domain.CreateFlagRequest{
		Key:         key,
		Name:        "Rules Target",
		Environment: domain.EnvDevelopment,
	})
	createReq, _ := http.NewRequest(http.MethodPost, "/api/v1/flags", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	var createResp handler.Response
	_ = json.Unmarshal(createW.Body.Bytes(), &createResp)
	flagData := createResp.Data.(map[string]interface{})
	id := int64(flagData["id"].(float64))

	// 1. Valid Sync
	syncBody := `{"rules":[{"attribute_name":"country","operator":"equals","expected_value":"CN","return_value":true,"priority":1},{"attribute_name":"plan","operator":"in","expected_value":["vip","pro"],"return_value":false,"priority":2}]}`
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/flags/%d/rules", id), bytes.NewBufferString(syncBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var syncResp handler.Response
	_ = json.Unmarshal(w.Body.Bytes(), &syncResp)
	rules := syncResp.Data.([]interface{})
	assert.Len(t, rules, 2)

	// 2. Priority Conflict (duplicate priority)
	dupBody := `{"rules":[{"attribute_name":"country","operator":"equals","expected_value":"CN","return_value":true,"priority":1},{"attribute_name":"plan","operator":"equals","expected_value":"pro","return_value":false,"priority":1}]}`
	reqDup, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/flags/%d/rules", id), bytes.NewBufferString(dupBody))
	reqDup.Header.Set("Content-Type", "application/json")
	wDup := httptest.NewRecorder()
	router.ServeHTTP(wDup, reqDup)

	assert.Equal(t, http.StatusConflict, wDup.Code)
	var dupResp handler.Response
	_ = json.Unmarshal(wDup.Body.Bytes(), &dupResp)
	assert.Equal(t, "PRIORITY_CONFLICT", dupResp.Code)

	// 3. Validation Error (missing rules field)
	badBody := `{}`
	reqBad, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/flags/%d/rules", id), bytes.NewBufferString(badBody))
	reqBad.Header.Set("Content-Type", "application/json")
	wBad := httptest.NewRecorder()
	router.ServeHTTP(wBad, reqBad)

	assert.Equal(t, http.StatusBadRequest, wBad.Code)
	var badResp handler.Response
	_ = json.Unmarshal(wBad.Body.Bytes(), &badResp)
	assert.Equal(t, "VALIDATION_ERROR", badResp.Code)

	// 4. Clear Rules with empty array
	clearBody := `{"rules":[]}`
	reqClear, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/flags/%d/rules", id), bytes.NewBufferString(clearBody))
	reqClear.Header.Set("Content-Type", "application/json")
	wClear := httptest.NewRecorder()
	router.ServeHTTP(wClear, reqClear)

	assert.Equal(t, http.StatusOK, wClear.Code)
	var clearResp handler.Response
	_ = json.Unmarshal(wClear.Body.Bytes(), &clearResp)
	clearedRules := clearResp.Data.([]interface{})
	assert.Len(t, clearedRules, 0)
}
