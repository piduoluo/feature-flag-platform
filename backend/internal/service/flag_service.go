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

type FlagService interface {
	CreateFlag(ctx context.Context, req *domain.CreateFlagRequest) (*domain.Flag, error)
	ListFlags(ctx context.Context, query domain.FlagListQuery) (*domain.FlagListResult, error)
	GetFlagByID(ctx context.Context, id int64) (*domain.Flag, error)
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
	switch env {
	case domain.EnvDevelopment, domain.EnvStaging, domain.EnvProduction:
		// Valid
	default:
		return nil, domain.NewValidationError(fmt.Sprintf("invalid environment '%s', must be one of: %s, %s, %s",
			env, domain.EnvDevelopment, domain.EnvStaging, domain.EnvProduction))
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
		}
		diffBytes, _ := json.Marshal(diffMap)

		auditLog := &domain.AuditLog{
			FlagID:      flag.ID,
			FlagKey:     flag.Key,
			Environment: flag.Environment,
			ActionType:  domain.ActionFlagCreated,
			Operator:    "admin",
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
	flags, total, err := s.flagRepo.List(ctx, query)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to list flags: %v", err))
	}

	return &domain.FlagListResult{
		Items: flags,
		Total: total,
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
