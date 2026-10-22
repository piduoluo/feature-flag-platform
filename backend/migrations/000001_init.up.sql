-- 000001_init.up.sql

CREATE TABLE IF NOT EXISTS flags (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    environment VARCHAR(32) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    default_value BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_flags_key_env UNIQUE (key, environment)
);

CREATE INDEX IF NOT EXISTS idx_flags_env ON flags (environment);
CREATE INDEX IF NOT EXISTS idx_flags_key ON flags (key);

CREATE TABLE IF NOT EXISTS rules (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    attribute_name VARCHAR(128) NOT NULL,
    operator VARCHAR(32) NOT NULL,
    expected_value JSONB NOT NULL,
    return_value BOOLEAN NOT NULL DEFAULT FALSE,
    priority INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rules_flag_priority UNIQUE (flag_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_rules_flag_priority ON rules (flag_id, priority ASC);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    flag_id BIGINT NOT NULL,
    flag_key VARCHAR(128) NOT NULL,
    environment VARCHAR(32) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    operator VARCHAR(64) NOT NULL DEFAULT 'admin',
    diff_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_flag_id ON audit_logs (flag_id, created_at DESC);
