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

	// Clean up existing demo flags if any to test fresh seeding
	demoKeys := []string{"checkout_v2", "ai_copilot_assistant", "dark_mode_theme"}
	ctx := context.Background()
	db.WithContext(ctx).Where("key IN ?", demoKeys).Delete(&domain.Flag{})
	db.WithContext(ctx).Where("flag_key IN ?", demoKeys).Delete(&domain.AuditLog{})

	// 1. First run: should seed all demo flags
	err = repository.SeedDemoData(db)
	require.NoError(t, err)

	var count1 int64
	db.WithContext(ctx).Model(&domain.Flag{}).Where("key IN ?", demoKeys).Count(&count1)
	assert.Equal(t, int64(4), count1, "Expected 4 demo flags (checkout_v2 in prod and dev, ai_copilot, dark_mode)")

	var ruleCount1 int64
	db.WithContext(ctx).Model(&domain.Rule{}).Count(&ruleCount1)
	assert.GreaterOrEqual(t, ruleCount1, int64(6), "Expected at least 6 rules across demo flags")

	var auditCount1 int64
	db.WithContext(ctx).Model(&domain.AuditLog{}).Where("flag_key IN ?", demoKeys).Count(&auditCount1)
	assert.Equal(t, int64(4), auditCount1, "Expected 4 initial audit logs")

	// 2. Second run: MUST be completely idempotent without adding duplicates or errors
	err = repository.SeedDemoData(db)
	require.NoError(t, err)

	var count2 int64
	db.WithContext(ctx).Model(&domain.Flag{}).Where("key IN ?", demoKeys).Count(&count2)
	assert.Equal(t, count1, count2, "Count should not change on second seed run")

	var ruleCount2 int64
	db.WithContext(ctx).Model(&domain.Rule{}).Count(&ruleCount2)
	assert.Equal(t, ruleCount1, ruleCount2, "Rules count should not change on second seed run")

	var auditCount2 int64
	db.WithContext(ctx).Model(&domain.AuditLog{}).Where("flag_key IN ?", demoKeys).Count(&auditCount2)
	assert.Equal(t, auditCount1, auditCount2, "Audit log count should not change on second seed run")
}
