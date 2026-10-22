package handler_test

import (
	"bytes"
	"context"
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
	"feature-flag-platform/internal/engine"
	"feature-flag-platform/internal/handler"
	"feature-flag-platform/internal/repository"
	"feature-flag-platform/internal/service"
)

func setupTestServerWithEval(t *testing.T) (*gin.Engine, service.FlagService, service.RuleService) {
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
	evalEngine := engine.NewEvaluationEngine()
	evalService := service.NewEvaluationService(flagRepo, evalEngine)

	flagHandler := handler.NewFlagHandler(flagService, ruleService)
	evalHandler := handler.NewEvaluationHandler(evalService)

	router := gin.New()
	router.Use(gin.Recovery())

	v1 := router.Group("/api/v1")
	flagHandler.RegisterRoutes(v1)
	evalHandler.RegisterRoutes(v1)

	return router, flagService, ruleService
}

func TestEvaluationHandler_InvalidJSON(t *testing.T) {
	router, _, _ := setupTestServerWithEval(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/evaluations", bytes.NewBufferString(`{ invalid json `))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp handler.Response
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, domain.ErrCodeValidation, resp.Code)
}

func TestEvaluationHandler_MissingFields(t *testing.T) {
	router, _, _ := setupTestServerWithEval(t)

	// Missing flag_key
	body, _ := json.Marshal(map[string]interface{}{
		"environment": "production",
		"context":     map[string]interface{}{},
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/evaluations", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp handler.Response
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, domain.ErrCodeValidation, resp.Code)
}

func TestEvaluationHandler_FlagNotFound(t *testing.T) {
	router, _, _ := setupTestServerWithEval(t)

	body, _ := json.Marshal(map[string]interface{}{
		"flag_key":    "non_existent_handler_flag",
		"environment": "production",
		"context":     map[string]interface{}{},
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/evaluations", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp handler.Response
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, domain.ErrCodeFlagNotFound, resp.Code)
}

func TestEvaluationHandler_SuccessfulEvaluationFlow(t *testing.T) {
	router, flagService, ruleService := setupTestServerWithEval(t)
	ctx := context.Background()

	key := fmt.Sprintf("eval_http_%d", time.Now().UnixNano())

	// 1. Create flag with enabled = true, default_value = false
	flag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:          key,
		Name:         "HTTP Eval Flag",
		Environment:  domain.EnvProduction,
		DefaultValue: false,
	})
	require.NoError(t, err)

	enabled := true
	_, err = flagService.ToggleFlag(ctx, flag.ID, &domain.ToggleFlagRequest{Enabled: &enabled})
	require.NoError(t, err)

	// 2. Add rule with big integer expected_value: 9007199254740993
	_, err = ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{
		Rules: &[]domain.RuleItemPayload{
			{
				Priority:      1,
				AttributeName: "account_id",
				Operator:      "equals",
				ExpectedValue: json.RawMessage(`9007199254740993`),
				ReturnValue:   true,
			},
		},
	})
	require.NoError(t, err)

	// 3. Test HTTP evaluation with matching big integer in JSON body
	evalJSON := fmt.Sprintf(`{
		"flag_key": "%s",
		"environment": "production",
		"context": {
			"account_id": 9007199254740993
		}
	}`, key)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/evaluations", bytes.NewBufferString(evalJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Code    string                    `json:"code"`
		Message string                    `json:"message"`
		Data    domain.EvaluationResponse `json:"data"`
	}
	err = json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", resp.Code)
	assert.True(t, resp.Data.Enabled)
	assert.True(t, resp.Data.Result)
	assert.Equal(t, domain.ReasonRuleMatch, resp.Data.Reason)
	require.NotNil(t, resp.Data.MatchedRule)
	assert.Equal(t, 1, resp.Data.MatchedRule.Priority)
	assert.Equal(t, "account_id", resp.Data.MatchedRule.AttributeName)

	// 4. Test off-by-one big integer (9007199254740992) -> should NOT match, fallback to default false
	evalNonMatchJSON := fmt.Sprintf(`{
		"flag_key": "%s",
		"environment": "production",
		"context": {
			"account_id": 9007199254740992
		}
	}`, key)

	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, "/api/v1/evaluations", bytes.NewBufferString(evalNonMatchJSON))
	req2.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusOK, w2.Code)
	var resp2 struct {
		Code    string                    `json:"code"`
		Message string                    `json:"message"`
		Data    domain.EvaluationResponse `json:"data"`
	}
	err = json.Unmarshal(w2.Body.Bytes(), &resp2)
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", resp2.Code)
	assert.True(t, resp2.Data.Enabled)
	assert.False(t, resp2.Data.Result)
	assert.Equal(t, domain.ReasonDefaultFallback, resp2.Data.Reason)
	assert.Nil(t, resp2.Data.MatchedRule)
}
