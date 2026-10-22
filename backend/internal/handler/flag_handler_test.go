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
	flagService := service.NewFlagService(flagRepo, auditRepo)
	flagHandler := handler.NewFlagHandler(flagService)

	router := gin.New()
	router.Use(gin.Recovery())

	v1 := router.Group("/api/v1")
	flagHandler.RegisterRoutes(v1)

	return router
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
