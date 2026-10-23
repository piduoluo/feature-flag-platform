-- 000002_audit_log_default_value.up.sql
--
-- Persist the flag's default return value alongside each audit record so the
-- "默认返回值" column stays stable even after the flag is reconfigured later.
-- Rows written before this column existed remain NULL: the current flag
-- configuration cannot establish the default value of a historical operation.
-- New operations record their snapshot in the same transaction as the change.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS default_value BOOLEAN;
