-- 000002_audit_log_default_value.up.sql
--
-- Persist the flag's default return value alongside each audit record so the
-- "默认返回值" column stays stable even after the flag is reconfigured later.
-- Rows written before this column existed are backfilled once from the current
-- flag configuration; the UPDATE is idempotent because new rows are never NULL.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS default_value BOOLEAN;

UPDATE audit_logs AS a
SET default_value = f.default_value
FROM flags AS f
WHERE f.id = a.flag_id
  AND a.default_value IS NULL;
