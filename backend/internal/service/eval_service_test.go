package service_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/engine"
	"feature-flag-platform/internal/repository"
	"feature-flag-platform/internal/service"
)

func setupEvalTestDB(t *testing.T) (service.FlagService, service.RuleService, service.EvaluationService) {
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

	return flagService, ruleService, evalService
}

func TestEvaluationService_ValidationErrors(t *testing.T) {
	_, _, evalService := setupEvalTestDB(t)
	ctx := context.Background()

	tests := []struct {
		name        string
		req         *domain.EvaluationRequest
		errCode     string
		errContains string
	}{
		{
			name:        "nil request",
			req:         nil,
			errCode:     domain.ErrCodeValidation,
			errContains: "request body is required",
		},
		{
			name: "missing flag_key",
			req: &domain.EvaluationRequest{
				FlagKey:     "",
				Environment: domain.EnvProduction,
				Context:     map[string]interface{}{},
			},
			errCode:     domain.ErrCodeValidation,
			errContains: "flag_key",
		},
		{
			name: "missing environment",
			req: &domain.EvaluationRequest{
				FlagKey:     "some_flag",
				Environment: "",
				Context:     map[string]interface{}{},
			},
			errCode:     domain.ErrCodeValidation,
			errContains: "environment",
		},
		{
			name: "invalid environment",
			req: &domain.EvaluationRequest{
				FlagKey:     "some_flag",
				Environment: "invalid_env",
				Context:     map[string]interface{}{},
			},
			errCode:     domain.ErrCodeValidation,
			errContains: "must be development, staging, or production",
		},
		{
			name: "missing context (nil)",
			req: &domain.EvaluationRequest{
				FlagKey:     "some_flag",
				Environment: domain.EnvProduction,
				Context:     nil,
			},
			errCode:     domain.ErrCodeValidation,
			errContains: "context",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res, err := evalService.Evaluate(ctx, tc.req)
			require.Error(t, err)
			assert.Nil(t, res)
			var appErr *domain.AppError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tc.errCode, appErr.Code)
			assert.Contains(t, appErr.Message, tc.errContains)
		})
	}
}

func TestEvaluationService_FlagNotFound(t *testing.T) {
	_, _, evalService := setupEvalTestDB(t)
	ctx := context.Background()

	req := &domain.EvaluationRequest{
		FlagKey:     "non_existent_flag_xyz",
		Environment: domain.EnvProduction,
		Context:     map[string]interface{}{},
	}

	res, err := evalService.Evaluate(ctx, req)
	require.Error(t, err)
	assert.Nil(t, res)

	var appErr *domain.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, domain.ErrCodeFlagNotFound, appErr.Code)
}

func TestEvaluationService_FullLifecycleEvaluation(t *testing.T) {
	flagService, ruleService, evalService := setupEvalTestDB(t)
	ctx := context.Background()

	flagKey := fmt.Sprintf("eval_test_%d", time.Now().UnixNano())

	// 1. Create flag (defaults to disabled, default_value = false)
	createdFlag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:          flagKey,
		Name:         "Eval Test Flag",
		Environment:  domain.EnvStaging,
		DefaultValue: true,
	})
	require.NoError(t, err)

	// Add rules:
	// Rule 1: priority 1, country equals CN -> return false
	// Rule 2: priority 2, vip in [1, 2, 3] -> return true
	_, err = ruleService.SyncRules(ctx, createdFlag.ID, &domain.SyncRulesRequest{
		Rules: &[]domain.RuleItemPayload{
			{
				Priority:      1,
				AttributeName: "country",
				Operator:      "equals",
				ExpectedValue: json.RawMessage(`"CN"`),
				ReturnValue:   false,
			},
			{
				Priority:      2,
				AttributeName: "vip",
				Operator:      "in",
				ExpectedValue: json.RawMessage(`[1, 2, 3]`),
				ReturnValue:   true,
			},
		},
	})
	require.NoError(t, err)

	// Case A: Flag is disabled -> returns false, FLAG_DISABLED
	resDisabled, err := evalService.Evaluate(ctx, &domain.EvaluationRequest{
		FlagKey:     flagKey,
		Environment: domain.EnvStaging,
		Context:     map[string]interface{}{"vip": json.Number("1")},
	})
	require.NoError(t, err)
	assert.False(t, resDisabled.Enabled)
	assert.False(t, resDisabled.Result)
	assert.Equal(t, domain.ReasonFlagDisabled, resDisabled.Reason)
	assert.Nil(t, resDisabled.MatchedRule)

	// Now enable flag
	enabled := true
	_, err = flagService.ToggleFlag(ctx, createdFlag.ID, &domain.ToggleFlagRequest{Enabled: &enabled})
	require.NoError(t, err)

	// Case B: Flag enabled, matches Rule 1 (country = CN) -> returns false, RULE_MATCH
	resRule1, err := evalService.Evaluate(ctx, &domain.EvaluationRequest{
		FlagKey:     flagKey,
		Environment: domain.EnvStaging,
		Context: map[string]interface{}{
			"country": "CN",
			"vip":     json.Number("1"),
		},
	})
	require.NoError(t, err)
	assert.True(t, resRule1.Enabled)
	assert.False(t, resRule1.Result)
	assert.Equal(t, domain.ReasonRuleMatch, resRule1.Reason)
	require.NotNil(t, resRule1.MatchedRule)
	assert.Equal(t, 1, resRule1.MatchedRule.Priority)
	assert.Equal(t, "country", resRule1.MatchedRule.AttributeName)

	// Case C: Flag enabled, skips Rule 1, matches Rule 2 (vip = 2) -> returns true, RULE_MATCH
	resRule2, err := evalService.Evaluate(ctx, &domain.EvaluationRequest{
		FlagKey:     flagKey,
		Environment: domain.EnvStaging,
		Context: map[string]interface{}{
			"vip": json.Number("2.0"), // Exact number match with 2
		},
	})
	require.NoError(t, err)
	assert.True(t, resRule2.Enabled)
	assert.True(t, resRule2.Result)
	assert.Equal(t, domain.ReasonRuleMatch, resRule2.Reason)
	require.NotNil(t, resRule2.MatchedRule)
	assert.Equal(t, 2, resRule2.MatchedRule.Priority)

	// Case D: Flag enabled, none match -> returns default_value (true), DEFAULT_FALLBACK
	resFallback, err := evalService.Evaluate(ctx, &domain.EvaluationRequest{
		FlagKey:     flagKey,
		Environment: domain.EnvStaging,
		Context: map[string]interface{}{
			"vip": json.Number("99"),
		},
	})
	require.NoError(t, err)
	assert.True(t, resFallback.Enabled)
	assert.True(t, resFallback.Result)
	assert.Equal(t, domain.ReasonDefaultFallback, resFallback.Reason)
	assert.Nil(t, resFallback.MatchedRule)
}
