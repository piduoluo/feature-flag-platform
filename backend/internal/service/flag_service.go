package service

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/repository"
)

var keyPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// maxAuditLogPageSize caps a single page of the global audit log listing so a
// client cannot force an unbounded query.
const maxAuditLogPageSize = 100

// validateEnvironment rejects any value outside the three supported environments.
func validateEnvironment(env domain.Environment) error {
	switch env {
	case domain.EnvDevelopment, domain.EnvStaging, domain.EnvProduction:
		return nil
	default:
		return domain.NewValidationError(fmt.Sprintf("invalid environment '%s', must be one of: %s, %s, %s",
			env, domain.EnvDevelopment, domain.EnvStaging, domain.EnvProduction))
	}
}

func validateAuditLogListQuery(query *domain.AuditLogListQuery) error {
	query.Environment = domain.Environment(strings.TrimSpace(string(query.Environment)))
	// An empty environment means "all environments", so only non-empty values are validated.
	if query.Environment != "" {
		if err := validateEnvironment(query.Environment); err != nil {
			return err
		}
	}

	query.ActionType = strings.TrimSpace(query.ActionType)
	switch query.ActionType {
	case "", domain.ActionFlagCreated, domain.ActionFlagUpdated, domain.ActionFlagToggled, domain.ActionRulesSynced:
		// Valid, empty means no action_type filter.
	default:
		return domain.NewValidationError(fmt.Sprintf("invalid action_type '%s', must be one of: %s, %s, %s, %s",
			query.ActionType, domain.ActionFlagCreated, domain.ActionFlagUpdated, domain.ActionFlagToggled, domain.ActionRulesSynced))
	}

	if query.Page < 1 {
		return domain.NewValidationError("page must be greater than or equal to 1")
	}
	if query.PageSize < 1 || query.PageSize > maxAuditLogPageSize {
		return domain.NewValidationError(fmt.Sprintf("page_size must be between 1 and %d", maxAuditLogPageSize))
	}

	return nil
}

type FlagService interface {
	CreateFlag(ctx context.Context, req *domain.CreateFlagRequest) (*domain.Flag, error)
	ListFlags(ctx context.Context, query domain.FlagListQuery) (*domain.FlagListResult, error)
	GetFlagByID(ctx context.Context, id int64) (*domain.Flag, error)
	UpdateFlag(ctx context.Context, id int64, req *domain.UpdateFlagRequest) (*domain.Flag, error)
	ToggleFlag(ctx context.Context, id int64, req *domain.ToggleFlagRequest) (*domain.Flag, error)
	GetAuditLogs(ctx context.Context, flagID int64) ([]*domain.AuditLog, error)
	ListAllAuditLogs(ctx context.Context, query domain.AuditLogListQuery) (*domain.AuditLogListResult, error)
}

type flagService struct {
	flagRepo  repository.FlagRepository
	auditRepo repository.AuditRepository
}

func NewFlagService(flagRepo repository.FlagRepository, auditRepo repository.AuditRepository) FlagService {
	return &flagService{
		flagRepo:  flagRepo,
		auditRepo: auditRepo,
	}
}

func (s *flagService) CreateFlag(ctx context.Context, req *domain.CreateFlagRequest) (*domain.Flag, error) {
	if req == nil {
		return nil, domain.NewValidationError("request body cannot be nil")
	}

	key := strings.TrimSpace(req.Key)
	if key == "" {
		return nil, domain.NewValidationError("flag key is required")
	}
	if len(key) > 128 {
		return nil, domain.NewValidationError("flag key cannot exceed 128 characters")
	}
	if !keyPattern.MatchString(key) {
		return nil, domain.NewValidationError("flag key must contain only letters, numbers, hyphens and underscores")
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, domain.NewValidationError("flag name is required")
	}
	if len(name) > 255 {
		return nil, domain.NewValidationError("flag name cannot exceed 255 characters")
	}

	env := domain.Environment(strings.TrimSpace(string(req.Environment)))
	if err := validateEnvironment(env); err != nil {
		return nil, err
	}

	// Check if (key, environment) already exists
	existing, err := s.flagRepo.GetByKeyAndEnv(ctx, key, string(env))
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to check flag key existence: %v", err))
	}
	if existing != nil {
		return nil, domain.NewFlagKeyConflictError(key, string(env))
	}

	flag := &domain.Flag{
		Key:          key,
		Name:         name,
		Description:  req.Description,
		Environment:  env,
		Enabled:      false, // Always disabled on initial creation
		DefaultValue: req.DefaultValue,
	}

	// Transactional creation of Flag and initial AuditLog
	err = s.flagRepo.WithTransaction(ctx, func(tx *gorm.DB) error {
		if err := s.flagRepo.Create(ctx, tx, flag); err != nil {
			// Catch physical database unique constraint violation if race condition
			if strings.Contains(strings.ToLower(err.Error()), "unique") ||
				strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				return domain.NewFlagKeyConflictError(key, string(env))
			}
			return domain.NewInternalError(fmt.Sprintf("failed to create flag: %v", err))
		}

		diffMap := map[string]interface{}{
			"action":        "created",
			"key":           flag.Key,
			"name":          flag.Name,
			"description":   flag.Description,
			"environment":   flag.Environment,
			"default_value": flag.DefaultValue,
			"enabled":       flag.Enabled,
			"rule_count":    0,
		}
		diffBytes, _ := json.Marshal(diffMap)

		auditLog := &domain.AuditLog{
			FlagID:      flag.ID,
			FlagKey:     flag.Key,
			Environment: flag.Environment,
			ActionType:  domain.ActionFlagCreated,
			Operator:    domain.DefaultOperator,
			DiffSummary: diffBytes,
		}

		if err := s.auditRepo.Create(ctx, tx, auditLog); err != nil {
			return domain.NewInternalError(fmt.Sprintf("failed to record audit log: %v", err))
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return flag, nil
}

func (s *flagService) ListFlags(ctx context.Context, query domain.FlagListQuery) (*domain.FlagListResult, error) {
	flags, total, stats, err := s.flagRepo.List(ctx, query)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to list flags: %v", err))
	}

	return &domain.FlagListResult{
		Items: flags,
		Total: total,
		Stats: stats,
	}, nil
}

func (s *flagService) GetFlagByID(ctx context.Context, id int64) (*domain.Flag, error) {
	flag, err := s.flagRepo.GetByID(ctx, id)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to get flag by id: %v", err))
	}
	if flag == nil {
		return nil, domain.NewFlagNotFoundError(id)
	}
	return flag, nil
}

func (s *flagService) UpdateFlag(ctx context.Context, id int64, req *domain.UpdateFlagRequest) (*domain.Flag, error) {
	if req == nil {
		return nil, domain.NewValidationError("request body cannot be nil")
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, domain.NewValidationError("flag name is required")
	}
	if len(name) > 255 {
		return nil, domain.NewValidationError("flag name cannot exceed 255 characters")
	}

	flag, err := s.flagRepo.GetByID(ctx, id)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to get flag: %v", err))
	}
	if flag == nil {
		return nil, domain.NewFlagNotFoundError(id)
	}

	if flag.Name == name && flag.Description == req.Description && flag.DefaultValue == req.DefaultValue {
		// Suppress redundant audit log when no attributes changed (per GLOSSARY & ADR 0005)
		return flag, nil
	}

	oldValues := map[string]interface{}{
		"name":          flag.Name,
		"description":   flag.Description,
		"default_value": flag.DefaultValue,
	}

	flag.Name = name
	flag.Description = req.Description
	flag.DefaultValue = req.DefaultValue

	err = s.flagRepo.WithTransaction(ctx, func(tx *gorm.DB) error {
		if err := s.flagRepo.Update(ctx, tx, flag); err != nil {
			return domain.NewInternalError(fmt.Sprintf("failed to update flag: %v", err))
		}

		diffMap := map[string]interface{}{
			"action": "updated",
			"before": oldValues,
			"after": map[string]interface{}{
				"name":          flag.Name,
				"description":   flag.Description,
				"default_value": flag.DefaultValue,
			},
		}
		diffBytes, _ := json.Marshal(diffMap)

		auditLog := &domain.AuditLog{
			FlagID:      flag.ID,
			FlagKey:     flag.Key,
			Environment: flag.Environment,
			ActionType:  domain.ActionFlagUpdated,
			Operator:    domain.DefaultOperator,
			DiffSummary: diffBytes,
		}

		if err := s.auditRepo.Create(ctx, tx, auditLog); err != nil {
			return domain.NewInternalError(fmt.Sprintf("failed to record audit log: %v", err))
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return flag, nil
}

func (s *flagService) ToggleFlag(ctx context.Context, id int64, req *domain.ToggleFlagRequest) (*domain.Flag, error) {
	if req == nil || req.Enabled == nil {
		return nil, domain.NewValidationError("field 'enabled' is required")
	}

	flag, err := s.flagRepo.GetByID(ctx, id)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to get flag: %v", err))
	}
	if flag == nil {
		return nil, domain.NewFlagNotFoundError(id)
	}

	if flag.Enabled == *req.Enabled {
		// Suppress redundant audit log when enabled status has not changed
		return flag, nil
	}

	oldEnabled := flag.Enabled
	flag.Enabled = *req.Enabled

	err = s.flagRepo.WithTransaction(ctx, func(tx *gorm.DB) error {
		if err := s.flagRepo.Update(ctx, tx, flag); err != nil {
			return domain.NewInternalError(fmt.Sprintf("failed to update flag status: %v", err))
		}

		diffMap := map[string]interface{}{
			"action":      "toggled",
			"old_enabled": oldEnabled,
			"new_enabled": flag.Enabled,
		}
		diffBytes, _ := json.Marshal(diffMap)

		auditLog := &domain.AuditLog{
			FlagID:      flag.ID,
			FlagKey:     flag.Key,
			Environment: flag.Environment,
			ActionType:  domain.ActionFlagToggled,
			Operator:    domain.DefaultOperator,
			DiffSummary: diffBytes,
		}

		if err := s.auditRepo.Create(ctx, tx, auditLog); err != nil {
			return domain.NewInternalError(fmt.Sprintf("failed to record audit log: %v", err))
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return flag, nil
}

func (s *flagService) GetAuditLogs(ctx context.Context, flagID int64) ([]*domain.AuditLog, error) {
	flag, err := s.flagRepo.GetByID(ctx, flagID)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to check flag: %v", err))
	}
	if flag == nil {
		return nil, domain.NewFlagNotFoundError(flagID)
	}

	logs, err := s.auditRepo.ListByFlagID(ctx, flagID)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to list audit logs: %v", err))
	}
	if logs == nil {
		logs = make([]*domain.AuditLog, 0)
	}
	return logs, nil
}

func (s *flagService) ListAllAuditLogs(ctx context.Context, query domain.AuditLogListQuery) (*domain.AuditLogListResult, error) {
	if err := validateAuditLogListQuery(&query); err != nil {
		return nil, err
	}

	logs, total, err := s.auditRepo.ListAll(ctx, query)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to list audit logs: %v", err))
	}
	if logs == nil {
		logs = make([]*domain.AuditLog, 0)
	}

	return &domain.AuditLogListResult{
		Items:    logs,
		Total:    total,
		Page:     query.Page,
		PageSize: query.PageSize,
	}, nil
}
