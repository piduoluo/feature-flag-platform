package repository_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/repository"
)

func setupAuditRepoTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=" + os.Getenv("USER") + " dbname=feature_flag_test sslmode=disable"
	}

	db, err := repository.InitDB(dsn)
	require.NoError(t, err)
	return db
}

func TestAuditRepository_ListAll_FiltersOrderAndPagination(t *testing.T) {
	db := setupAuditRepoTestDB(t)
	repo := repository.NewAuditRepository(db)
	ctx := context.Background()

	prefix := fmt.Sprintf("repo_audit_%d", time.Now().UnixNano())
	t.Cleanup(func() {
		db.WithContext(ctx).Where("flag_key LIKE ?", prefix+"%").Delete(&domain.AuditLog{})
	})

	now := time.Now().UTC().Truncate(time.Second)
	seed := []*domain.AuditLog{
		{
			FlagID:      101,
			FlagKey:     prefix + "_alpha",
			Environment: domain.EnvDevelopment,
			ActionType:  domain.ActionFlagCreated,
			Operator:    domain.DefaultOperator,
			DiffSummary: json.RawMessage(`{"action":"created"}`),
			CreatedAt:   now.Add(-2 * time.Hour),
		},
		{
			FlagID:      102,
			FlagKey:     prefix + "_beta",
			Environment: domain.EnvProduction,
			ActionType:  domain.ActionFlagToggled,
			Operator:    domain.DefaultOperator,
			DiffSummary: json.RawMessage(`{"action":"toggled","new_enabled":true}`),
			CreatedAt:   now,
		},
		{
			FlagID:      103,
			FlagKey:     prefix + "_gamma",
			Environment: domain.EnvDevelopment,
			ActionType:  domain.ActionRulesSynced,
			Operator:    domain.DefaultOperator,
			DiffSummary: json.RawMessage(`{"action":"rules_synced"}`),
			CreatedAt:   now.Add(-1 * time.Hour),
		},
	}
	for _, log := range seed {
		require.NoError(t, db.WithContext(ctx).Create(log).Error)
	}

	t.Run("flag_key fuzzy match orders by created_at desc", func(t *testing.T) {
		logs, total, err := repo.ListAll(ctx, domain.AuditLogListQuery{
			FlagKey: prefix, Page: 1, PageSize: 10,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(3), total)
		require.Len(t, logs, 3)
		assert.Equal(t, prefix+"_beta", logs[0].FlagKey)
		assert.Equal(t, prefix+"_gamma", logs[1].FlagKey)
		assert.Equal(t, prefix+"_alpha", logs[2].FlagKey)
		assert.Equal(t, int64(102), logs[0].FlagID, "flag_id must be populated for detail navigation")
		assert.NotEmpty(t, logs[0].DiffSummary)
	})

	t.Run("flag_key match is case-insensitive and partial", func(t *testing.T) {
		logs, total, err := repo.ListAll(ctx, domain.AuditLogListQuery{
			FlagKey: fmt.Sprintf("%s_BE", prefix), Page: 1, PageSize: 10,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(1), total)
		require.Len(t, logs, 1)
		assert.Equal(t, prefix+"_beta", logs[0].FlagKey)
	})

	t.Run("environment filter", func(t *testing.T) {
		logs, total, err := repo.ListAll(ctx, domain.AuditLogListQuery{
			FlagKey: prefix, Environment: domain.EnvDevelopment, Page: 1, PageSize: 10,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(2), total)
		require.Len(t, logs, 2)
		for _, log := range logs {
			assert.Equal(t, domain.EnvDevelopment, log.Environment)
		}
	})

	t.Run("action_type filter", func(t *testing.T) {
		logs, total, err := repo.ListAll(ctx, domain.AuditLogListQuery{
			FlagKey: prefix, ActionType: domain.ActionFlagToggled, Page: 1, PageSize: 10,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(1), total)
		require.Len(t, logs, 1)
		assert.Equal(t, domain.ActionFlagToggled, logs[0].ActionType)
		assert.Equal(t, int64(102), logs[0].FlagID)
	})

	t.Run("page two returns remaining row with true total", func(t *testing.T) {
		logs, total, err := repo.ListAll(ctx, domain.AuditLogListQuery{
			FlagKey: prefix, Page: 2, PageSize: 2,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(3), total)
		require.Len(t, logs, 1)
		assert.Equal(t, prefix+"_alpha", logs[0].FlagKey)
	})

	t.Run("LIKE wildcards in search input are literal", func(t *testing.T) {
		_, total, err := repo.ListAll(ctx, domain.AuditLogListQuery{
			FlagKey: "%", Page: 1, PageSize: 10,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(0), total)
	})

	t.Run("no match returns empty slice and zero total", func(t *testing.T) {
		logs, total, err := repo.ListAll(ctx, domain.AuditLogListQuery{
			FlagKey: fmt.Sprintf("absent_%d", time.Now().UnixNano()), Page: 1, PageSize: 10,
		})
		require.NoError(t, err)
		assert.Equal(t, int64(0), total)
		assert.NotNil(t, logs)
		assert.Empty(t, logs)
	})
}
