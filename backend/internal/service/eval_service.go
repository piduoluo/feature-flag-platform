package service

import (
	"context"
	"fmt"
	"strings"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/engine"
	"feature-flag-platform/internal/repository"
)

// EvaluationService coordinates flag retrieval and domain evaluation engine execution.
type EvaluationService interface {
	Evaluate(ctx context.Context, req *domain.EvaluationRequest) (*domain.EvaluationResponse, error)
}

type evaluationService struct {
	flagRepo repository.FlagRepository
	engine   engine.EvaluationEngine
}

// NewEvaluationService constructs a new EvaluationService instance.
func NewEvaluationService(flagRepo repository.FlagRepository, eng engine.EvaluationEngine) EvaluationService {
	return &evaluationService{
		flagRepo: flagRepo,
		engine:   eng,
	}
}

func (s *evaluationService) Evaluate(ctx context.Context, req *domain.EvaluationRequest) (*domain.EvaluationResponse, error) {
	if req == nil {
		return nil, domain.NewValidationError("request body is required")
	}

	flagKey := strings.TrimSpace(req.FlagKey)
	if flagKey == "" {
		return nil, domain.NewValidationError("field 'flag_key' is required")
	}

	env := req.Environment
	if env == "" {
		return nil, domain.NewValidationError("field 'environment' is required")
	}
	if env != domain.EnvDevelopment && env != domain.EnvStaging && env != domain.EnvProduction {
		return nil, domain.NewValidationError(fmt.Sprintf("invalid environment '%s': must be development, staging, or production", env))
	}

	if req.Context == nil {
		return nil, domain.NewValidationError("field 'context' is required")
	}

	// Fetch flag with ordered rules
	flag, err := s.flagRepo.GetByKeyAndEnv(ctx, flagKey, string(env))
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to query flag: %v", err))
	}
	if flag == nil {
		return nil, domain.NewFlagNotFoundError(fmt.Sprintf("%s in environment %s", flagKey, env))
	}

	// Pure in-memory evaluation
	res := s.engine.Evaluate(flag, flag.Rules, req.Context)
	return res, nil
}
