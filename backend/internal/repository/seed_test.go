package repository_test

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/repository"
)

func TestSeedDemoData_Idempotency(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=" + os.Getenv("USER") + " dbname=feature_flag_test sslmode=disable"
	}

	db, err := repository.InitDB(dsn)
	require.NoError(t, err)

	// Keep the test independent of earlier seed versions while leaving unrelated flags alone.
	demoKeys := []string{
		"ai_ride_assistant_enabled",
		"robotaxi_r2_trial_enabled",
		"safety_ai_upgrade_enabled",
		"robotaxi_uae_pilot_enabled",
	}
	ctx := context.Background()
	require.NoError(t, db.WithContext(ctx).Where("key IN ?", demoKeys).Delete(&domain.Flag{}).Error)
	require.NoError(t, db.WithContext(ctx).Where("flag_key IN ?", demoKeys).Delete(&domain.AuditLog{}).Error)

	// 1. First run: should seed all demo flags
	err = repository.SeedDemoData(db)
	require.NoError(t, err)

	var count1 int64
	require.NoError(t, db.WithContext(ctx).Model(&domain.Flag{}).Where("key IN ?", demoKeys).Count(&count1).Error)
	assert.Equal(t, int64(5), count1, "four demo keys should produce five flags across environments")

	var ruleCount1 int64
	require.NoError(t, db.WithContext(ctx).Model(&domain.Rule{}).
		Where("flag_id IN (SELECT id FROM flags WHERE key IN ?)", demoKeys).Count(&ruleCount1).Error)
	assert.Equal(t, int64(5), ruleCount1, "demo flags should carry five targeted rules")

	var auditCount1 int64
	require.NoError(t, db.WithContext(ctx).Model(&domain.AuditLog{}).Where("flag_key IN ?", demoKeys).Count(&auditCount1).Error)
	assert.Equal(t, int64(5), auditCount1, "each seeded flag should have one creation audit log")

	var aiProduction domain.Flag
	require.NoError(t, db.WithContext(ctx).Preload("Rules").
		Where("key = ? AND environment = ?", "ai_ride_assistant_enabled", domain.EnvProduction).
		First(&aiProduction).Error)
	assert.True(t, aiProduction.Enabled)
	assert.False(t, aiProduction.DefaultValue)
	require.Len(t, aiProduction.Rules, 1)
	assert.Equal(t, "user_id", aiProduction.Rules[0].AttributeName)
	assert.JSONEq(t, `[10001, 10002]`, string(aiProduction.Rules[0].ExpectedValue))

	var aiDevelopment domain.Flag
	require.NoError(t, db.WithContext(ctx).Preload("Rules").
		Where("key = ? AND environment = ?", "ai_ride_assistant_enabled", domain.EnvDevelopment).
		First(&aiDevelopment).Error)
	assert.True(t, aiDevelopment.DefaultValue)
	assert.Empty(t, aiDevelopment.Rules)

	var robotaxiR2 domain.Flag
	require.NoError(t, db.WithContext(ctx).Preload("Rules").
		Where("key = ? AND environment = ?", "robotaxi_r2_trial_enabled", domain.EnvStaging).
		First(&robotaxiR2).Error)
	require.Len(t, robotaxiR2.Rules, 2)
	for _, rule := range robotaxiR2.Rules {
		switch rule.Priority {
		case 1:
			assert.Equal(t, "pilot_paused", rule.AttributeName)
			assert.False(t, rule.ReturnValue)
		case 2:
			assert.Equal(t, "user_id", rule.AttributeName)
			assert.True(t, rule.ReturnValue)
		default:
			t.Errorf("unexpected Robotaxi R2 rule priority %d", rule.Priority)
		}
	}

	var safety domain.Flag
	require.NoError(t, db.WithContext(ctx).Where("key = ?", "safety_ai_upgrade_enabled").First(&safety).Error)
	assert.False(t, safety.Enabled, "disabled safety demo must exercise FLAG_DISABLED")

	var uae domain.Flag
	require.NoError(t, db.WithContext(ctx).Preload("Rules").Where("key = ?", "robotaxi_uae_pilot_enabled").First(&uae).Error)
	assert.Equal(t, domain.EnvStaging, uae.Environment)
	require.Len(t, uae.Rules, 1)
	assert.Equal(t, "pilot_cohort", uae.Rules[0].AttributeName)
	assert.JSONEq(t, `"uae_preview"`, string(uae.Rules[0].ExpectedValue))

	// 2. Second run: MUST be completely idempotent without adding duplicates or errors
	err = repository.SeedDemoData(db)
	require.NoError(t, err)

	var count2 int64
	require.NoError(t, db.WithContext(ctx).Model(&domain.Flag{}).Where("key IN ?", demoKeys).Count(&count2).Error)
	assert.Equal(t, count1, count2, "Count should not change on second seed run")

	var ruleCount2 int64
	require.NoError(t, db.WithContext(ctx).Model(&domain.Rule{}).
		Where("flag_id IN (SELECT id FROM flags WHERE key IN ?)", demoKeys).Count(&ruleCount2).Error)
	assert.Equal(t, ruleCount1, ruleCount2, "Rules count should not change on second seed run")

	var auditCount2 int64
	require.NoError(t, db.WithContext(ctx).Model(&domain.AuditLog{}).Where("flag_key IN ?", demoKeys).Count(&auditCount2).Error)
	assert.Equal(t, auditCount1, auditCount2, "Audit log count should not change on second seed run")
}
