package domain

import (
	"encoding/json"
	"time"
)

// Environment represents isolated context
type Environment string

// Environment types
const (
	EnvDevelopment Environment = "development"
	EnvStaging     Environment = "staging"
	EnvProduction  Environment = "production"
)

// Audit action types
const (
	ActionFlagCreated = "FLAG_CREATED"
	ActionFlagUpdated = "FLAG_UPDATED"
	ActionFlagToggled = "FLAG_TOGGLED"
	ActionRulesSynced = "RULES_SYNCED"
)

// DefaultOperator system default operator name for audit tracking
const DefaultOperator = "admin"

// Flag represents a feature flag entity in a specific environment.
type Flag struct {
	ID           int64       `json:"id" gorm:"primaryKey;autoIncrement"`
	Key          string      `json:"key" gorm:"column:key;not null;size:128;uniqueIndex:idx_flags_key_env,priority:1"`
	Name         string      `json:"name" gorm:"column:name;not null;size:255"`
	Description  string      `json:"description" gorm:"column:description;not null;default:''"`
	Environment  Environment `json:"environment" gorm:"column:environment;not null;size:32;uniqueIndex:idx_flags_key_env,priority:2"`
	Enabled      bool        `json:"enabled" gorm:"column:enabled;not null;default:false"`
	DefaultValue bool        `json:"default_value" gorm:"column:default_value;not null;default:false"`
	CreatedAt    time.Time   `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    time.Time   `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
	Rules        []Rule      `json:"rules" gorm:"foreignKey:FlagID"`
}

func (Flag) TableName() string {
	return "flags"
}

// Rule represents a matching condition associated with a Flag.
type Rule struct {
	ID            int64           `json:"id" gorm:"primaryKey;autoIncrement"`
	FlagID        int64           `json:"flag_id" gorm:"column:flag_id;not null;uniqueIndex:idx_rules_flag_priority,priority:1"`
	AttributeName string          `json:"attribute_name" gorm:"column:attribute_name;not null;size:128"`
	Operator      string          `json:"operator" gorm:"column:operator;not null;size:32"`
	ExpectedValue json.RawMessage `json:"expected_value" gorm:"column:expected_value;type:jsonb;not null"`
	ReturnValue   bool            `json:"return_value" gorm:"column:return_value;not null;default:false"`
	Priority      int             `json:"priority" gorm:"column:priority;not null;uniqueIndex:idx_rules_flag_priority,priority:2"`
	CreatedAt     time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt     time.Time       `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Rule) TableName() string {
	return "rules"
}

// AuditLog tracks configuration modifications atomically.
type AuditLog struct {
	ID          int64           `json:"id" gorm:"primaryKey;autoIncrement"`
	FlagID      int64           `json:"flag_id" gorm:"column:flag_id;not null"`
	FlagKey     string          `json:"flag_key" gorm:"column:flag_key;not null;size:128"`
	Environment Environment     `json:"environment" gorm:"column:environment;not null;size:32"`
	ActionType  string          `json:"action_type" gorm:"column:action_type;not null;size:64"`
	Operator    string          `json:"operator" gorm:"column:operator;not null;size:64;default:'admin'"`
	DiffSummary json.RawMessage `json:"diff_summary" gorm:"column:diff_summary;type:jsonb;not null;default:'{}'"`
	CreatedAt   time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

// AuditLogListQuery query parameters for the global audit log listing.
type AuditLogListQuery struct {
	Environment Environment `form:"environment"`
	FlagKey     string      `form:"flag_key"`
	ActionType  string      `form:"action_type"`
	Page        int         `form:"page,default=1"`
	PageSize    int         `form:"page_size,default=20"`
}

// AuditLogListResult paginated list of audit logs across all flags.
// Each item is a domain.AuditLog, which explicitly carries flag_id so the
// frontend can navigate to /flags/:id?tab=audit.
type AuditLogListResult struct {
	Items    []*AuditLog `json:"items"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
}

// CreateFlagRequest payload for creating a new Flag.
type CreateFlagRequest struct {
	Key          string      `json:"key"`
	Name         string      `json:"name"`
	Description  string      `json:"description"`
	Environment  Environment `json:"environment"`
	DefaultValue bool        `json:"default_value"`
}

// UpdateFlagRequest payload for editing Flag basic details.
type UpdateFlagRequest struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	DefaultValue bool   `json:"default_value"`
}

// ToggleFlagRequest payload for enabling/disabling a Flag.
type ToggleFlagRequest struct {
	Enabled *bool `json:"enabled"`
}

// FlagListQuery query parameters for filtering flags.
type FlagListQuery struct {
	Environment Environment `form:"environment"`
	Search      string      `form:"search"`
	Enabled     *bool       `form:"enabled"`
	Page        int         `form:"page,default=1"`
	PageSize    int         `form:"page_size,default=20"`
}

// FlagStats summarizes the environment/search result before status filtering.
type FlagStats struct {
	All      int64 `json:"all" gorm:"column:all_count"`
	Enabled  int64 `json:"enabled" gorm:"column:enabled_count"`
	Disabled int64 `json:"disabled" gorm:"column:disabled_count"`
}

// FlagListResult paginated list of flags.
type FlagListResult struct {
	Items []*Flag   `json:"items"`
	Total int64     `json:"total"`
	Stats FlagStats `json:"stats"`
}

// RuleItemPayload represents a single rule definition in sync request.
type RuleItemPayload struct {
	ID            *int64          `json:"id"`
	AttributeName string          `json:"attribute_name"`
	Operator      string          `json:"operator"`
	ExpectedValue json.RawMessage `json:"expected_value"`
	ReturnValue   bool            `json:"return_value"`
	Priority      int             `json:"priority"`
}

// SyncRulesRequest payload for bulk updating Flag rules.
type SyncRulesRequest struct {
	Rules *[]RuleItemPayload `json:"rules"`
}

// EvaluationReason represents the explanation for an evaluation result.
type EvaluationReason string

const (
	ReasonRuleMatch       EvaluationReason = "RULE_MATCH"
	ReasonDefaultFallback EvaluationReason = "DEFAULT_FALLBACK"
	ReasonFlagDisabled    EvaluationReason = "FLAG_DISABLED"
)

// MatchedRuleInfo holds metadata about the rule that triggered a match.
type MatchedRuleInfo struct {
	ID            int64           `json:"id"`
	Priority      int             `json:"priority"`
	AttributeName string          `json:"attribute_name"`
	Operator      string          `json:"operator"`
	ExpectedValue json.RawMessage `json:"expected_value"`
	ReturnValue   bool            `json:"return_value"`
}

// EvaluationRequest payload for evaluating a feature flag with user context.
type EvaluationRequest struct {
	FlagKey     string                 `json:"flag_key"`
	Environment Environment            `json:"environment"`
	Context     map[string]interface{} `json:"context"`
}

// EvaluationResponse standard payload returned by evaluation endpoint.
type EvaluationResponse struct {
	FlagKey     string           `json:"flag_key"`
	Environment Environment      `json:"environment"`
	Enabled     bool             `json:"enabled"`
	Result      bool             `json:"result"`
	Reason      EvaluationReason `json:"reason"`
	MatchedRule *MatchedRuleInfo `json:"matched_rule"`
}
