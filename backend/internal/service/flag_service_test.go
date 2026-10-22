package service_test

import (
	"context"
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

	_, err = flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key:         prodKey,
		Name:        "Searchable Checkout Prod",
		Environment: domain.EnvProduction,
	})
	require.NoError(t, err)

	// Filter by development environment
	devList, err := flagService.ListFlags(ctx, domain.FlagListQuery{
		Environment: domain.EnvDevelopment,
		Search:      prefix,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), devList.Total)
	assert.Equal(t, devKey, devList.Items[0].Key)

	// Search across environments with prefix
	searchList, err := flagService.ListFlags(ctx, domain.FlagListQuery{
		Search: prefix,
	})
	require.NoError(t, err)
	assert.GreaterOrEqual(t, searchList.Total, int64(2))
}
