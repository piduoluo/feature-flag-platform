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
	"feature-flag-platform/internal/repository"
	"feature-flag-platform/internal/service"
)

func setupRuleTestDB(t *testing.T) (service.FlagService, service.RuleService) {
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

	return flagService, ruleService
}

func int64Ptr(v int64) *int64 {
	return &v
}

func TestRuleService_SyncRules_CreateAndOrder(t *testing.T) {
	flagService, ruleService := setupRuleTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("rules_order_%d", time.Now().UnixNano())
	flag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         key,
		Name:        "Rules Order Flag",
		Environment: domain.EnvDevelopment,
	})
	require.NoError(t, err)

	// Sync 2 rules: intentionally provide priority 2 first, then priority 1
	ruleList := []domain.RuleItemPayload{
		{
			AttributeName: "age",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`25`),
			ReturnValue:   false,
			Priority:      2,
		},
		{
			AttributeName: "country",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"CN"`),
			ReturnValue:   true,
			Priority:      1,
		},
	}

	rules, err := ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &ruleList})
	require.NoError(t, err)
	require.Len(t, rules, 2)
	assert.Equal(t, 1, rules[0].Priority)
	assert.Equal(t, "country", rules[0].AttributeName)
	assert.Equal(t, 2, rules[1].Priority)
	assert.Equal(t, "age", rules[1].AttributeName)

	// Check audit log
	logs, err := flagService.GetAuditLogs(ctx, flag.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ActionRulesSynced, logs[0].ActionType)
}

func TestRuleService_SyncRules_PrioritySwap(t *testing.T) {
	flagService, ruleService := setupRuleTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("rules_swap_%d", time.Now().UnixNano())
	flag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         key,
		Name:        "Rules Swap Flag",
		Environment: domain.EnvStaging,
	})
	require.NoError(t, err)

	initialRules := []domain.RuleItemPayload{
		{
			AttributeName: "role",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"admin"`),
			ReturnValue:   true,
			Priority:      1,
		},
		{
			AttributeName: "role",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"user"`),
			ReturnValue:   false,
			Priority:      2,
		},
	}
	saved, err := ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &initialRules})
	require.NoError(t, err)
	require.Len(t, saved, 2)
	rule1ID := saved[0].ID
	rule2ID := saved[1].ID

	// Swap priorities: Rule1 -> 2, Rule2 -> 1
	swappedList := []domain.RuleItemPayload{
		{
			ID:            int64Ptr(rule1ID),
			AttributeName: "role",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"admin"`),
			ReturnValue:   true,
			Priority:      2,
		},
		{
			ID:            int64Ptr(rule2ID),
			AttributeName: "role",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"user"`),
			ReturnValue:   false,
			Priority:      1,
		},
	}

	swapped, err := ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &swappedList})
	require.NoError(t, err)
	require.Len(t, swapped, 2)

	// Returned list must be ordered by priority ASC (Priority 1 first, then 2)
	assert.Equal(t, 1, swapped[0].Priority)
	assert.Equal(t, rule2ID, swapped[0].ID)
	assert.Equal(t, 2, swapped[1].Priority)
	assert.Equal(t, rule1ID, swapped[1].ID)
}

func TestRuleService_SyncRules_DuplicatePriority_Fails(t *testing.T) {
	flagService, ruleService := setupRuleTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("rules_dup_%d", time.Now().UnixNano())
	flag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         key,
		Name:        "Rules Dup Flag",
		Environment: domain.EnvDevelopment,
	})
	require.NoError(t, err)

	dupList := []domain.RuleItemPayload{
		{
			AttributeName: "plan",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"pro"`),
			ReturnValue:   true,
			Priority:      1,
		},
		{
			AttributeName: "region",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"US"`),
			ReturnValue:   false,
			Priority:      1, // Duplicate priority
		},
	}

	_, err = ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &dupList})
	require.Error(t, err)
	appErr, ok := err.(*domain.AppError)
	require.True(t, ok)
	assert.Equal(t, domain.ErrCodePriorityConf, appErr.Code)
}

func TestRuleService_SyncRules_ClearRules(t *testing.T) {
	flagService, ruleService := setupRuleTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("rules_clear_%d", time.Now().UnixNano())
	flag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         key,
		Name:        "Rules Clear Flag",
		Environment: domain.EnvProduction,
	})
	require.NoError(t, err)

	ruleList := []domain.RuleItemPayload{
		{
			AttributeName: "tier",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"gold"`),
			ReturnValue:   true,
			Priority:      1,
		},
	}
	_, err = ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &ruleList})
	require.NoError(t, err)

	// Clear rules: pass empty array {"rules": []}
	emptyList := []domain.RuleItemPayload{}
	cleared, err := ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &emptyList})
	require.NoError(t, err)
	assert.Empty(t, cleared)

	// Verify deleted audit log
	logs, err := flagService.GetAuditLogs(ctx, flag.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ActionRulesSynced, logs[0].ActionType)
}

func TestRuleService_SyncRules_AuditSuppression_NoOp(t *testing.T) {
	flagService, ruleService := setupRuleTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("rules_noop_%d", time.Now().UnixNano())
	flag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         key,
		Name:        "Rules Noop Flag",
		Environment: domain.EnvDevelopment,
	})
	require.NoError(t, err)

	ruleList := []domain.RuleItemPayload{
		{
			AttributeName: "tag",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"vip"`),
			ReturnValue:   true,
			Priority:      1,
		},
	}
	saved, err := ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &ruleList})
	require.NoError(t, err)

	logsBefore, err := flagService.GetAuditLogs(ctx, flag.ID)
	require.NoError(t, err)
	countBefore := len(logsBefore)

	// Submit identical rules again with existing ID
	identicalList := []domain.RuleItemPayload{
		{
			ID:            int64Ptr(saved[0].ID),
			AttributeName: "tag",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"vip"`),
			ReturnValue:   true,
			Priority:      1,
		},
	}
	_, err = ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &identicalList})
	require.NoError(t, err)

	// Audit count must NOT increase
	logsAfter, err := flagService.GetAuditLogs(ctx, flag.ID)
	require.NoError(t, err)
	assert.Equal(t, countBefore, len(logsAfter), "No-op rule sync must suppress empty audit log")
}

func TestRuleService_SyncRules_OwnershipAndValidation(t *testing.T) {
	flagService, ruleService := setupRuleTestDB(t)
	ctx := context.Background()

	// Create Flag 1 and Flag 2
	flag1, _ := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         fmt.Sprintf("flag1_%d", time.Now().UnixNano()),
		Name:        "Flag 1",
		Environment: domain.EnvDevelopment,
	})
	flag2, _ := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         fmt.Sprintf("flag2_%d", time.Now().UnixNano()),
		Name:        "Flag 2",
		Environment: domain.EnvDevelopment,
	})

	// Create rule in Flag 1
	rule1List := []domain.RuleItemPayload{
		{
			AttributeName: "country",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"US"`),
			ReturnValue:   true,
			Priority:      1,
		},
	}
	f1Rules, _ := ruleService.SyncRules(ctx, flag1.ID, &domain.SyncRulesRequest{Rules: &rule1List})
	f1RuleID := f1Rules[0].ID

	// Attempt to hijack Flag 1's rule into Flag 2
	hijackList := []domain.RuleItemPayload{
		{
			ID:            int64Ptr(f1RuleID), // belongs to Flag 1
			AttributeName: "country",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"US"`),
			ReturnValue:   true,
			Priority:      1,
		},
	}
	_, err := ruleService.SyncRules(ctx, flag2.ID, &domain.SyncRulesRequest{Rules: &hijackList})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeValidation, err.(*domain.AppError).Code)

	// Validation: operator 'in' cannot be empty array
	inEmpty := []domain.RuleItemPayload{
		{
			AttributeName: "tags",
			Operator:      "in",
			ExpectedValue: json.RawMessage(`[]`),
			ReturnValue:   true,
			Priority:      1,
		},
	}
	_, err = ruleService.SyncRules(ctx, flag2.ID, &domain.SyncRulesRequest{Rules: &inEmpty})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeValidation, err.(*domain.AppError).Code)

	// Validation: missing rules field
	_, err = ruleService.SyncRules(ctx, flag2.ID, &domain.SyncRulesRequest{Rules: nil})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeValidation, err.(*domain.AppError).Code)
}

func TestRuleService_SyncRules_UnchangedRulesPreservePriority(t *testing.T) {
	flagService, ruleService := setupRuleTestDB(t)
	ctx := context.Background()

	flag, _ := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         fmt.Sprintf("rules_preserve_%d", time.Now().UnixNano()),
		Name:        "Preserve Priority Target",
		Environment: domain.EnvDevelopment,
	})

	// Initial sync: 2 rules
	initialRules := []domain.RuleItemPayload{
		{
			AttributeName: "country",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"CN"`),
			ReturnValue:   true,
			Priority:      1,
		},
		{
			AttributeName: "plan",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"vip"`),
			ReturnValue:   false,
			Priority:      2,
		},
	}
	synced1, err := ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &initialRules})
	require.NoError(t, err)
	require.Len(t, synced1, 2)
	r1ID := synced1[0].ID
	r2ID := synced1[1].ID

	// Next sync: Add 3rd rule, keeping r1 and r2 unchanged
	nextRules := []domain.RuleItemPayload{
		{
			ID:            &r1ID,
			AttributeName: "country",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"CN"`),
			ReturnValue:   true,
			Priority:      1,
		},
		{
			ID:            &r2ID,
			AttributeName: "plan",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"vip"`),
			ReturnValue:   false,
			Priority:      2,
		},
		{
			AttributeName: "device",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"iOS"`),
			ReturnValue:   true,
			Priority:      3,
		},
	}
	synced2, err := ruleService.SyncRules(ctx, flag.ID, &domain.SyncRulesRequest{Rules: &nextRules})
	require.NoError(t, err)
	require.Len(t, synced2, 3)

	// Verify priorities are strictly 1, 2, 3 (not 1000001, 1000002)
	assert.Equal(t, 1, synced2[0].Priority)
	assert.Equal(t, 2, synced2[1].Priority)
	assert.Equal(t, 3, synced2[2].Priority)

	// Check audit log: exactly 1 added, 0 updated, 0 deleted
	logs, err := flagService.GetAuditLogs(ctx, flag.ID)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(logs), 2)
	latestLog := logs[0]
	assert.Equal(t, domain.ActionRulesSynced, latestLog.ActionType)

	var diff map[string]interface{}
	_ = json.Unmarshal(latestLog.DiffSummary, &diff)
	added := diff["added"].([]interface{})
	updated := diff["updated"].([]interface{})
	deleted := diff["deleted"].([]interface{})
	assert.Len(t, added, 1)
	assert.Len(t, updated, 0)
	assert.Len(t, deleted, 0)
}
