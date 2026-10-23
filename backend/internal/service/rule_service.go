package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/repository"
)

type RuleService interface {
	SyncRules(ctx context.Context, flagID int64, req *domain.SyncRulesRequest) ([]*domain.Rule, error)
	GetRulesByFlagID(ctx context.Context, flagID int64) ([]*domain.Rule, error)
}

type ruleService struct {
	flagRepo  repository.FlagRepository
	ruleRepo  repository.RuleRepository
	auditRepo repository.AuditRepository
}

func NewRuleService(
	flagRepo repository.FlagRepository,
	ruleRepo repository.RuleRepository,
	auditRepo repository.AuditRepository,
) RuleService {
	return &ruleService{
		flagRepo:  flagRepo,
		ruleRepo:  ruleRepo,
		auditRepo: auditRepo,
	}
}

func (s *ruleService) GetRulesByFlagID(ctx context.Context, flagID int64) ([]*domain.Rule, error) {
	flag, err := s.flagRepo.GetByID(ctx, flagID)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to get flag: %v", err))
	}
	if flag == nil {
		return nil, domain.NewFlagNotFoundError(flagID)
	}

	return s.ruleRepo.ListByFlagID(ctx, flagID)
}

func (s *ruleService) SyncRules(ctx context.Context, flagID int64, req *domain.SyncRulesRequest) ([]*domain.Rule, error) {
	if req == nil || req.Rules == nil {
		return nil, domain.NewValidationError("field 'rules' is required (pass [] to clear all rules)")
	}

	flag, err := s.flagRepo.GetByID(ctx, flagID)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to get flag: %v", err))
	}
	if flag == nil {
		return nil, domain.NewFlagNotFoundError(flagID)
	}

	incomingRules := *req.Rules

	// 1. Validate payload: check duplicate priorities, duplicate IDs, format
	seenPriorities := make(map[int]bool)
	seenIDs := make(map[int64]bool)

	for _, item := range incomingRules {
		if item.Priority < 1 {
			return nil, domain.NewValidationError("rule priority must be a positive integer (>= 1)")
		}
		if seenPriorities[item.Priority] {
			return nil, domain.NewPriorityConflictError(item.Priority)
		}
		seenPriorities[item.Priority] = true

		if item.ID != nil && *item.ID > 0 {
			if seenIDs[*item.ID] {
				return nil, domain.NewValidationError(fmt.Sprintf("duplicate rule ID %d in request", *item.ID))
			}
			seenIDs[*item.ID] = true
		}

		attr := strings.TrimSpace(item.AttributeName)
		if attr == "" {
			return nil, domain.NewValidationError("rule attribute_name is required")
		}

		op := strings.TrimSpace(item.Operator)
		if op != "equals" && op != "in" {
			return nil, domain.NewValidationError(fmt.Sprintf("invalid operator '%s': must be 'equals' or 'in'", op))
		}

		if err := validateExpectedValue(op, item.ExpectedValue); err != nil {
			return nil, err
		}
	}

	// 2. Fetch current rules from DB
	currentRules, err := s.ruleRepo.ListByFlagID(ctx, flagID)
	if err != nil {
		return nil, domain.NewInternalError(fmt.Sprintf("failed to fetch current rules: %v", err))
	}

	currentMap := make(map[int64]*domain.Rule, len(currentRules))
	for _, r := range currentRules {
		currentMap[r.ID] = r
	}

	// 3. Verify all provided IDs belong to this flag
	for _, item := range incomingRules {
		if item.ID != nil && *item.ID > 0 {
			existing, exists := currentMap[*item.ID]
			if !exists || existing.FlagID != flagID {
				return nil, domain.NewValidationError(fmt.Sprintf("rule ID %d does not belong to flag %d", *item.ID, flagID))
			}
		}
	}

	// 4. Calculate three-way Diff: added, updated, deleted
	var added []*domain.Rule
	var updated []*domain.Rule
	var deleted []*domain.Rule

	addedSummary := make([]map[string]interface{}, 0)
	updatedSummary := make([]map[string]interface{}, 0)
	deletedSummary := make([]map[string]interface{}, 0)

	incomingIDs := make(map[int64]bool)
	for _, item := range incomingRules {
		if item.ID != nil && *item.ID > 0 {
			incomingIDs[*item.ID] = true
			existing := currentMap[*item.ID]

			// Check if any property changed
			isChanged := existing.Priority != item.Priority ||
				existing.AttributeName != item.AttributeName ||
				existing.Operator != item.Operator ||
				existing.ReturnValue != item.ReturnValue ||
				!jsonEqual(existing.ExpectedValue, item.ExpectedValue)

			if isChanged {
				beforeMap := map[string]interface{}{
					"priority":       existing.Priority,
					"attribute_name": existing.AttributeName,
					"operator":       existing.Operator,
					"expected_value": json.RawMessage(existing.ExpectedValue),
					"return_value":   existing.ReturnValue,
				}

				// Clone and update
				updatedRule := &domain.Rule{
					ID:            existing.ID,
					FlagID:        flagID,
					Priority:      item.Priority,
					AttributeName: item.AttributeName,
					Operator:      item.Operator,
					ExpectedValue: item.ExpectedValue,
					ReturnValue:   item.ReturnValue,
					CreatedAt:     existing.CreatedAt,
				}
				updated = append(updated, updatedRule)

				afterMap := map[string]interface{}{
					"priority":       updatedRule.Priority,
					"attribute_name": updatedRule.AttributeName,
					"operator":       updatedRule.Operator,
					"expected_value": json.RawMessage(updatedRule.ExpectedValue),
					"return_value":   updatedRule.ReturnValue,
				}

				updatedSummary = append(updatedSummary, map[string]interface{}{
					"id":     existing.ID,
					"before": beforeMap,
					"after":  afterMap,
				})
			}
		} else {
			newRule := &domain.Rule{
				FlagID:        flagID,
				Priority:      item.Priority,
				AttributeName: item.AttributeName,
				Operator:      item.Operator,
				ExpectedValue: item.ExpectedValue,
				ReturnValue:   item.ReturnValue,
			}
			added = append(added, newRule)
			addedSummary = append(addedSummary, map[string]interface{}{
				"priority":       newRule.Priority,
				"attribute_name": newRule.AttributeName,
				"operator":       newRule.Operator,
				"expected_value": json.RawMessage(newRule.ExpectedValue),
				"return_value":   newRule.ReturnValue,
			})
		}
	}

	// Deleted rules: in DB but not in request
	for _, r := range currentRules {
		if !incomingIDs[r.ID] {
			deleted = append(deleted, r)
			deletedSummary = append(deletedSummary, map[string]interface{}{
				"id":             r.ID,
				"priority":       r.Priority,
				"attribute_name": r.AttributeName,
				"operator":       r.Operator,
				"expected_value": json.RawMessage(r.ExpectedValue),
				"return_value":   r.ReturnValue,
			})
		}
	}

	// 5. Blank Audit Suppression: if no added, updated, or deleted, skip audit log
	if len(added) == 0 && len(updated) == 0 && len(deleted) == 0 {
		if currentRules == nil {
			currentRules = make([]*domain.Rule, 0)
		}
		return currentRules, nil
	}

	// 6. Execute atomic transaction
	err = s.flagRepo.WithTransaction(ctx, func(tx *gorm.DB) error {
		// 1) Delete removed rules
		for _, d := range deleted {
			if err := s.ruleRepo.Delete(ctx, tx, d.ID); err != nil {
				return domain.NewInternalError(fmt.Sprintf("failed to delete rule %d: %v", d.ID, err))
			}
		}

		// 2) Shift priorities of all remaining rules to avoid transient unique constraint collisions during swaps
		if len(currentRules)-len(deleted) > 0 {
			if err := s.ruleRepo.ShiftPriorities(ctx, tx, flagID, 1000000); err != nil {
				return domain.NewInternalError(fmt.Sprintf("failed to shift priorities: %v", err))
			}
		}

		// 3) Update all retained existing rules to their target state (restoring target priority from +1000000 offset)
		for _, item := range incomingRules {
			if item.ID != nil && *item.ID > 0 {
				existing := currentMap[*item.ID]
				ruleToSave := &domain.Rule{
					ID:            existing.ID,
					FlagID:        flagID,
					Priority:      item.Priority,
					AttributeName: item.AttributeName,
					Operator:      item.Operator,
					ExpectedValue: item.ExpectedValue,
					ReturnValue:   item.ReturnValue,
					CreatedAt:     existing.CreatedAt,
				}
				if err := s.ruleRepo.Update(ctx, tx, ruleToSave); err != nil {
					return domain.NewInternalError(fmt.Sprintf("failed to update rule %d: %v", ruleToSave.ID, err))
				}
			}
		}

		// 4) Insert newly added rules
		for _, a := range added {
			if err := s.ruleRepo.Create(ctx, tx, a); err != nil {
				return domain.NewInternalError(fmt.Sprintf("failed to create rule: %v", err))
			}
		}

		// 5) Record RULES_SYNCED audit log
		diffMap := map[string]interface{}{
			"action":  "rules_synced",
			"added":   addedSummary,
			"updated": updatedSummary,
			"deleted": deletedSummary,
		}
		diffBytes, _ := json.Marshal(diffMap)

		auditLog := &domain.AuditLog{
			FlagID:       flag.ID,
			FlagKey:      flag.Key,
			Environment:  flag.Environment,
			ActionType:   domain.ActionRulesSynced,
			Operator:     domain.DefaultOperator,
			DefaultValue: &flag.DefaultValue,
			DiffSummary:  diffBytes,
		}
		if err := s.auditRepo.Create(ctx, tx, auditLog); err != nil {
			return domain.NewInternalError(fmt.Sprintf("failed to record audit log: %v", err))
		}

		// 6) Refresh the flag's updated_at so the list's "last updated" column
		// reflects rule changes. No-op syncs return before this transaction.
		if err := s.flagRepo.Touch(ctx, tx, flagID); err != nil {
			return domain.NewInternalError(fmt.Sprintf("failed to refresh flag updated_at: %v", err))
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return s.ruleRepo.ListByFlagID(ctx, flagID)
}

func validateExpectedValue(operator string, raw json.RawMessage) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return domain.NewValidationError("expected_value cannot be null or empty")
	}

	if operator == "equals" {
		var val interface{}
		if err := json.Unmarshal(raw, &val); err != nil || val == nil {
			return domain.NewValidationError("operator 'equals' expected_value must be a non-null scalar")
		}
		switch val.(type) {
		case string, float64, bool:
			return nil
		default:
			return domain.NewValidationError("operator 'equals' expected_value must be a scalar (string, number, or boolean)")
		}
	}

	if operator == "in" {
		var arr []interface{}
		if err := json.Unmarshal(raw, &arr); err != nil {
			return domain.NewValidationError("operator 'in' expected_value must be a JSON array")
		}
		if len(arr) == 0 {
			return domain.NewValidationError("operator 'in' expected_value cannot be an empty array")
		}
		for _, item := range arr {
			if item == nil {
				return domain.NewValidationError("operator 'in' expected_value array cannot contain null")
			}
			switch item.(type) {
			case string, float64, bool:
				// valid scalar
			default:
				return domain.NewValidationError("operator 'in' expected_value array must only contain scalars (string, number, or boolean)")
			}
		}
		return nil
	}

	return nil
}

func jsonEqual(a, b json.RawMessage) bool {
	var valA, valB interface{}
	if err := json.Unmarshal(a, &valA); err != nil {
		return false
	}
	if err := json.Unmarshal(b, &valB); err != nil {
		return false
	}
	normA, _ := json.Marshal(valA)
	normB, _ := json.Marshal(valB)
	return bytes.Equal(normA, normB)
}
