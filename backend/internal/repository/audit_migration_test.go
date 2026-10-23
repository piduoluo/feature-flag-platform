package repository_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAuditDefaultValueMigrationPreservesUnknownHistoryAndRecordedSnapshots(t *testing.T) {
	db := setupAuditRepoTestDB(t)
	migration, err := os.ReadFile("../../migrations/000002_audit_log_default_value.up.sql")
	require.NoError(t, err)

	// Temporary tables isolate a pre-upgrade schema from the shared test tables.
	tx := db.Begin()
	require.NoError(t, tx.Error)
	t.Cleanup(func() { tx.Rollback() })
	require.NoError(t, tx.Exec(`
		CREATE TEMP TABLE flags (id BIGINT PRIMARY KEY, default_value BOOLEAN) ON COMMIT DROP;
		CREATE TEMP TABLE audit_logs (id BIGINT PRIMARY KEY, flag_id BIGINT) ON COMMIT DROP;
		INSERT INTO flags VALUES (1, true);
		INSERT INTO audit_logs VALUES (1, 1);
	`).Error)

	require.NoError(t, tx.Exec(string(migration)).Error)
	var unknown int64
	require.NoError(t, tx.Raw("SELECT count(*) FROM audit_logs WHERE id = 1 AND default_value IS NULL").Scan(&unknown).Error)
	require.EqualValues(t, 1, unknown, "current configuration cannot establish an old operation's default value")

	require.NoError(t, tx.Exec(`
		INSERT INTO audit_logs VALUES (2, 1, true);
		UPDATE flags SET default_value = false WHERE id = 1;
	`).Error)
	require.NoError(t, tx.Exec(string(migration)).Error)
	require.NoError(t, tx.Raw("SELECT count(*) FROM audit_logs WHERE id = 1 AND default_value IS NULL").Scan(&unknown).Error)
	require.EqualValues(t, 1, unknown, "restarting after a configuration change must not fabricate a historical value")
	var snapshot bool
	require.NoError(t, tx.Raw("SELECT default_value FROM audit_logs WHERE id = 2").Scan(&snapshot).Error)
	require.True(t, snapshot, "repeated migration must preserve a recorded snapshot even when the flag now differs")
}
