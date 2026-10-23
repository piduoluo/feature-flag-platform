package service_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/repository"
	"feature-flag-platform/internal/service"
)

func setupTestDB(t *testing.T) (*repository.FlagRepository, *repository.AuditRepository, service.FlagService) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=" + os.Getenv("USER") + " dbname=feature_flag_test sslmode=disable"
	}

	db, err := repository.InitDB(dsn)
	require.NoError(t, err)

	flagRepo := repository.NewFlagRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	flagService := service.NewFlagService(flagRepo, auditRepo)

	return &flagRepo, &auditRepo, flagService
}

func TestFlagService_CreateFlag_Success(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	uniqueKey := fmt.Sprintf("test_flag_%d", time.Now().UnixNano())
	req := &domain.CreateFlagRequest{
		Key:          uniqueKey,
		Name:         "Test Flag Name",
		Description:  "Optional description for test",
		Environment:  domain.EnvDevelopment,
		DefaultValue: true,
	}

	created, err := flagService.CreateFlag(ctx, req)
	require.NoError(t, err)
	assert.NotZero(t, created.ID)
	assert.Equal(t, uniqueKey, created.Key)
	assert.Equal(t, "Test Flag Name", created.Name)
	assert.Equal(t, "Optional description for test", created.Description)
	assert.Equal(t, domain.EnvDevelopment, created.Environment)
	assert.False(t, created.Enabled, "New flags should default to disabled")
	assert.True(t, created.DefaultValue)

	logs, err := flagService.GetAuditLogs(ctx, created.ID)
	require.NoError(t, err)
	require.Len(t, logs, 1)
	assert.Equal(t, domain.ActionFlagCreated, logs[0].ActionType)
	require.NotNil(t, logs[0].DefaultValue, "audit log must snapshot the flag default value")
	assert.True(t, *logs[0].DefaultValue)
	assert.JSONEq(t, fmt.Sprintf(`{
		"action": "created",
		"key": %q,
		"name": "Test Flag Name",
		"description": "Optional description for test",
		"environment": "development",
		"default_value": true,
		"enabled": false,
		"rule_count": 0
	}`, uniqueKey), string(logs[0].DiffSummary))
}

func TestFlagService_CreateFlag_SameKeyDifferentEnv_Success(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	sharedKey := fmt.Sprintf("multi_env_%d", time.Now().UnixNano())

	// Create in development
	devFlag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         sharedKey,
		Name:        "Multi Env Dev",
		Environment: domain.EnvDevelopment,
	})
	require.NoError(t, err)
	assert.Equal(t, domain.EnvDevelopment, devFlag.Environment)

	// Create with same key in production
	prodFlag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         sharedKey,
		Name:        "Multi Env Prod",
		Environment: domain.EnvProduction,
	})
	require.NoError(t, err)
	assert.Equal(t, domain.EnvProduction, prodFlag.Environment)
	assert.NotEqual(t, devFlag.ID, prodFlag.ID)
}

func TestFlagService_CreateFlag_ConflictSameEnv(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	dupKey := fmt.Sprintf("dup_key_%d", time.Now().UnixNano())

	_, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         dupKey,
		Name:        "First Creation",
		Environment: domain.EnvStaging,
	})
	require.NoError(t, err)

	// Second creation in same staging env must fail with key conflict
	_, err = flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         dupKey,
		Name:        "Second Creation",
		Environment: domain.EnvStaging,
	})
	require.Error(t, err)
	appErr, ok := err.(*domain.AppError)
	require.True(t, ok, "Expected AppError")
	assert.Equal(t, domain.ErrCodeKeyConflict, appErr.Code)
}

func TestFlagService_CreateFlag_ValidationErrors(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	// Empty key
	_, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         "",
		Name:        "No Key",
		Environment: domain.EnvDevelopment,
	})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeValidation, err.(*domain.AppError).Code)

	// Invalid characters in key
	_, err = flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         "invalid key with spaces!",
		Name:        "Invalid Key",
		Environment: domain.EnvDevelopment,
	})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeValidation, err.(*domain.AppError).Code)

	// Empty name
	_, err = flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         "valid_key",
		Name:        "",
		Environment: domain.EnvDevelopment,
	})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeValidation, err.(*domain.AppError).Code)

	// Invalid environment
	_, err = flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         "valid_key",
		Name:        "Valid Name",
		Environment: "unknown_env",
	})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeValidation, err.(*domain.AppError).Code)
}

func TestFlagService_ListFlags_FilterAndSearch(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	prefix := fmt.Sprintf("list_test_%d", time.Now().UnixNano())
	devKey := prefix + "_dev"
	prodKey := prefix + "_prod"

	_, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         devKey,
		Name:        "Searchable Checkout Dev",
		Environment: domain.EnvDevelopment,
	})
	require.NoError(t, err)

	prodFlag, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         prodKey,
		Name:        "Searchable Checkout Prod",
		Environment: domain.EnvProduction,
	})
	require.NoError(t, err)
	_, err = flagService.ToggleFlag(ctx, prodFlag.ID, &domain.ToggleFlagRequest{Enabled: boolPtr(true)})
	require.NoError(t, err)

	// Filter by development environment
	devList, err := flagService.ListFlags(ctx, domain.FlagListQuery{
		Environment: domain.EnvDevelopment,
		Search:      prefix,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), devList.Total)
	assert.Equal(t, devKey, devList.Items[0].Key)
	assert.Equal(t, domain.FlagStats{All: 1, Enabled: 0, Disabled: 1}, devList.Stats)

	// Search across environments with prefix
	searchList, err := flagService.ListFlags(ctx, domain.FlagListQuery{
		Search: prefix,
	})
	require.NoError(t, err)
	assert.GreaterOrEqual(t, searchList.Total, int64(2))
	assert.Equal(t, domain.FlagStats{All: 2, Enabled: 1, Disabled: 1}, searchList.Stats)

	enabled := true
	enabledList, err := flagService.ListFlags(ctx, domain.FlagListQuery{
		Search:  prefix,
		Enabled: &enabled,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), enabledList.Total)
	assert.Equal(t, prodKey, enabledList.Items[0].Key)
	assert.Equal(t, domain.FlagStats{All: 2, Enabled: 1, Disabled: 1}, enabledList.Stats)
}

func TestFlagService_UpdateFlag_Success(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("upd_flag_%d", time.Now().UnixNano())
	created, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:          key,
		Name:         "Original Name",
		Description:  "Original Desc",
		Environment:  domain.EnvStaging,
		DefaultValue: false,
	})
	require.NoError(t, err)

	updated, err := flagService.UpdateFlag(ctx, created.ID, &domain.UpdateFlagRequest{
		Name:         "Updated Name",
		Description:  "Updated Desc",
		DefaultValue: true,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "Updated Desc", updated.Description)
	assert.True(t, updated.DefaultValue)

	// Verify AuditLog was recorded
	logs, err := flagService.GetAuditLogs(ctx, created.ID)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(logs), 2)
	assert.Equal(t, domain.ActionFlagUpdated, logs[0].ActionType)
	assert.Equal(t, "admin", logs[0].Operator)
	require.NotNil(t, logs[0].DefaultValue, "updated audit log must snapshot the new default value")
	assert.True(t, *logs[0].DefaultValue)
	require.NotNil(t, logs[1].DefaultValue, "created audit log must keep its original default value")
	assert.False(t, *logs[1].DefaultValue)
}

func boolPtr(b bool) *bool {
	return &b
}

func TestFlagService_ToggleFlag_Success(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("toggle_flag_%d", time.Now().UnixNano())
	created, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         key,
		Name:        "Toggle Test",
		Environment: domain.EnvProduction,
	})
	require.NoError(t, err)
	assert.False(t, created.Enabled)

	// Turn ON
	toggledOn, err := flagService.ToggleFlag(ctx, created.ID, &domain.ToggleFlagRequest{Enabled: boolPtr(true)})
	require.NoError(t, err)
	assert.True(t, toggledOn.Enabled)

	// Turn OFF
	toggledOff, err := flagService.ToggleFlag(ctx, created.ID, &domain.ToggleFlagRequest{Enabled: boolPtr(false)})
	require.NoError(t, err)
	assert.False(t, toggledOff.Enabled)

	// Verify AuditLog
	logs, err := flagService.GetAuditLogs(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ActionFlagToggled, logs[0].ActionType)
	require.NotNil(t, logs[0].DefaultValue)
	assert.False(t, *logs[0].DefaultValue)
}

func TestFlagService_UpdateAndToggle_NotFound(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	_, err := flagService.UpdateFlag(ctx, 99999999, &domain.UpdateFlagRequest{
		Name: "Non Existent",
	})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeFlagNotFound, err.(*domain.AppError).Code)

	_, err = flagService.ToggleFlag(ctx, 99999999, &domain.ToggleFlagRequest{
		Enabled: boolPtr(true),
	})
	require.Error(t, err)
	assert.Equal(t, domain.ErrCodeFlagNotFound, err.(*domain.AppError).Code)
}

func TestFlagService_AuditSuppression_NoOp(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	key := fmt.Sprintf("noop_audit_%d", time.Now().UnixNano())
	created, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:          key,
		Name:         "Stable Name",
		Description:  "Stable Desc",
		Environment:  domain.EnvDevelopment,
		DefaultValue: false,
	})
	require.NoError(t, err)

	initialLogs, err := flagService.GetAuditLogs(ctx, created.ID)
	require.NoError(t, err)
	initialCount := len(initialLogs)

	// No-op update with identical name, description, default_value
	_, err = flagService.UpdateFlag(ctx, created.ID, &domain.UpdateFlagRequest{
		Name:         "Stable Name",
		Description:  "Stable Desc",
		DefaultValue: false,
	})
	require.NoError(t, err)

	// Audit count must NOT increase
	logsAfterUpdate, err := flagService.GetAuditLogs(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, initialCount, len(logsAfterUpdate), "No-op update must suppress empty audit log")

	// No-op toggle with identical enabled status (already false)
	_, err = flagService.ToggleFlag(ctx, created.ID, &domain.ToggleFlagRequest{
		Enabled: boolPtr(false),
	})
	require.NoError(t, err)

	// Audit count must still NOT increase
	logsAfterToggle, err := flagService.GetAuditLogs(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, initialCount, len(logsAfterToggle), "No-op toggle must suppress empty audit log")
}

type failingAuditRepo struct {
	repository.AuditRepository
}

func (f *failingAuditRepo) Create(ctx context.Context, tx *gorm.DB, log *domain.AuditLog) error {
	return fmt.Errorf("simulated audit log failure for atomicity test")
}

func TestFlagService_AtomicRollback_OnAuditFailure(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=" + os.Getenv("USER") + " dbname=feature_flag_test sslmode=disable"
	}
	db, err := repository.InitDB(dsn)
	require.NoError(t, err)

	flagRepo := repository.NewFlagRepository(db)
	realAuditRepo := repository.NewAuditRepository(db)
	normalService := service.NewFlagService(flagRepo, realAuditRepo)
	ctx := context.Background()

	key := fmt.Sprintf("rollback_%d", time.Now().UnixNano())
	created, err := normalService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         key,
		Name:        "Original Before Failure",
		Environment: domain.EnvDevelopment,
	})
	require.NoError(t, err)

	// Inject failing audit repository to test transaction rollback
	brokenService := service.NewFlagService(flagRepo, &failingAuditRepo{AuditRepository: realAuditRepo})

	// Attempt update - must fail because audit log creation fails
	_, err = brokenService.UpdateFlag(ctx, created.ID, &domain.UpdateFlagRequest{
		Name: "New Name That Must Rollback",
	})
	require.Error(t, err)

	// Fetch from DB using normal service to verify rollback
	reloaded, err := normalService.GetFlagByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, "Original Before Failure", reloaded.Name, "Flag name must remain unchanged after transaction rollback")
}
