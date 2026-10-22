package service_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"feature-flag-platform/internal/domain"
)

func TestFlagService_ListAllAuditLogs_RejectsInvalidQuery(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	cases := []struct {
		name  string
		query domain.AuditLogListQuery
	}{
		{"unknown environment", domain.AuditLogListQuery{Environment: "moon", Page: 1, PageSize: 20}},
		{"unknown action type", domain.AuditLogListQuery{ActionType: "FLAG_DELETED", Page: 1, PageSize: 20}},
		{"page below one", domain.AuditLogListQuery{Page: 0, PageSize: 20}},
		{"page_size below one", domain.AuditLogListQuery{Page: 1, PageSize: 0}},
		{"page_size above maximum", domain.AuditLogListQuery{Page: 1, PageSize: 101}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := flagService.ListAllAuditLogs(ctx, tc.query)
			require.Error(t, err)
			assert.Nil(t, result)

			var appErr *domain.AppError
			require.True(t, errors.As(err, &appErr))
			assert.Equal(t, domain.ErrCodeValidation, appErr.Code)
		})
	}
}

func TestFlagService_ListAllAuditLogs_FiltersAndPaginates(t *testing.T) {
	_, _, flagService := setupTestDB(t)
	ctx := context.Background()

	prefix := fmt.Sprintf("svc_audit_%d", time.Now().UnixNano())
	alphaKey := prefix + "_alpha"
	betaKey := prefix + "_beta"

	alpha, err := flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key: alphaKey, Name: "Audit Alpha", Environment: domain.EnvStaging,
	})
	require.NoError(t, err)
	_, err = flagService.CreateFlag(ctx, &domain.CreateFlagRequest{
		Key: betaKey, Name: "Audit Beta", Environment: domain.EnvStaging,
	})
	require.NoError(t, err)
	_, err = flagService.ToggleFlag(ctx, alpha.ID, &domain.ToggleFlagRequest{Enabled: boolPtr(true)})
	require.NoError(t, err)

	toggled, err := flagService.ListAllAuditLogs(ctx, domain.AuditLogListQuery{
		FlagKey:    prefix,
		ActionType: domain.ActionFlagToggled,
		Page:       1,
		PageSize:   10,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), toggled.Total)
	require.Len(t, toggled.Items, 1)
	assert.Equal(t, alpha.ID, toggled.Items[0].FlagID)
	assert.Equal(t, alphaKey, toggled.Items[0].FlagKey)
	assert.Equal(t, 1, toggled.Page)
	assert.Equal(t, 10, toggled.PageSize)

	created, err := flagService.ListAllAuditLogs(ctx, domain.AuditLogListQuery{
		FlagKey:    prefix,
		ActionType: domain.ActionFlagCreated,
		Page:       1,
		PageSize:   1,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), created.Total)
	require.Len(t, created.Items, 1)

	createdPage2, err := flagService.ListAllAuditLogs(ctx, domain.AuditLogListQuery{
		FlagKey:    prefix,
		ActionType: domain.ActionFlagCreated,
		Page:       2,
		PageSize:   1,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), createdPage2.Total)
	require.Len(t, createdPage2.Items, 1)
	assert.NotEqual(t, created.Items[0].ID, createdPage2.Items[0].ID)

	none, err := flagService.ListAllAuditLogs(ctx, domain.AuditLogListQuery{
		FlagKey:  fmt.Sprintf("no_such_key_%d", time.Now().UnixNano()),
		Page:     1,
		PageSize: 20,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(0), none.Total)
	assert.NotNil(t, none.Items, "empty result must serialize as [] not null")
	assert.Empty(t, none.Items)
}
