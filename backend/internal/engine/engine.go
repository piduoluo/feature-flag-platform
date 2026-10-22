package engine

import (
	"bytes"
	"encoding/json"
	"math/big"
	"sort"
	"strconv"

	"feature-flag-platform/internal/domain"
)

// EvaluationEngine defines pure in-memory flag evaluation behavior.
type EvaluationEngine interface {
	Evaluate(flag *domain.Flag, rules []domain.Rule, context map[string]interface{}) *domain.EvaluationResponse
}

type evaluationEngine struct{}

// NewEvaluationEngine creates a new instance of the in-memory EvaluationEngine.
func NewEvaluationEngine() EvaluationEngine {
	return &evaluationEngine{}
}

// Evaluate evaluates rules against context deterministically.
func (e *evaluationEngine) Evaluate(
	flag *domain.Flag,
	rules []domain.Rule,
	context map[string]interface{},
) *domain.EvaluationResponse {
	// 1. Short-circuit: Disabled flag returns false immediately
	if !flag.Enabled {
		return &domain.EvaluationResponse{
			FlagKey:     flag.Key,
			Environment: flag.Environment,
			Enabled:     false,
			Result:      false,
			Reason:      domain.ReasonFlagDisabled,
			MatchedRule: nil,
		}
	}

	if rules == nil {
		rules = flag.Rules
	}

	// 2. Sort rules by Priority ascending (1 is highest priority)
	sortedRules := make([]domain.Rule, len(rules))
	copy(sortedRules, rules)
	sort.SliceStable(sortedRules, func(i, j int) bool {
		return sortedRules[i].Priority < sortedRules[j].Priority
	})

	// 3. Evaluate each rule in order
	for _, rule := range sortedRules {
		ctxVal, exists := context[rule.AttributeName]
		if !exists || ctxVal == nil {
			// Missing attribute or explicit null safely skips to next rule
			continue
		}

		decoder := json.NewDecoder(bytes.NewReader(rule.ExpectedValue))
		decoder.UseNumber()
		var expVal interface{}
		if err := decoder.Decode(&expVal); err != nil {
			continue
		}

		matched := false
		switch rule.Operator {
		case "equals":
			matched = matchScalar(ctxVal, expVal)
		case "in":
			if expArr, ok := expVal.([]interface{}); ok {
				for _, elem := range expArr {
					if matchScalar(ctxVal, elem) {
						matched = true
						break
					}
				}
			}
		}

		if matched {
			return &domain.EvaluationResponse{
				FlagKey:     flag.Key,
				Environment: flag.Environment,
				Enabled:     true,
				Result:      rule.ReturnValue,
				Reason:      domain.ReasonRuleMatch,
				MatchedRule: &domain.MatchedRuleInfo{
					ID:            rule.ID,
					Priority:      rule.Priority,
					AttributeName: rule.AttributeName,
					Operator:      rule.Operator,
					ExpectedValue: rule.ExpectedValue,
					ReturnValue:   rule.ReturnValue,
				},
			}
		}
	}

	// 4. Fallback to flag default value if no rules matched
	return &domain.EvaluationResponse{
		FlagKey:     flag.Key,
		Environment: flag.Environment,
		Enabled:     true,
		Result:      flag.DefaultValue,
		Reason:      domain.ReasonDefaultFallback,
		MatchedRule: nil,
	}
}

// matchScalar performs strict JSON type isolation and exact numerical matching.
func matchScalar(ctxVal, expVal interface{}) bool {
	if ctxVal == nil || expVal == nil {
		return false
	}

	switch exp := expVal.(type) {
	case string:
		ctxStr, ok := ctxVal.(string)
		if !ok {
			return false
		}
		return ctxStr == exp

	case bool:
		ctxBool, ok := ctxVal.(bool)
		if !ok {
			return false
		}
		return ctxBool == exp

	default:
		// Attempt numeric comparison
		expRat, expOk := toRat(expVal)
		if !expOk {
			return false
		}
		ctxRat, ctxOk := toRat(ctxVal)
		if !ctxOk {
			return false
		}
		return expRat.Cmp(ctxRat) == 0
	}
}

// toRat converts numeric types into *big.Rat for arbitrary-precision exact comparison.
func toRat(val interface{}) (*big.Rat, bool) {
	switch v := val.(type) {
	case *big.Rat:
		return v, true
	case json.Number:
		r, ok := new(big.Rat).SetString(string(v))
		return r, ok
	case int:
		return new(big.Rat).SetInt64(int64(v)), true
	case int8:
		return new(big.Rat).SetInt64(int64(v)), true
	case int16:
		return new(big.Rat).SetInt64(int64(v)), true
	case int32:
		return new(big.Rat).SetInt64(int64(v)), true
	case int64:
		return new(big.Rat).SetInt64(v), true
	case uint:
		return new(big.Rat).SetUint64(uint64(v)), true
	case uint8:
		return new(big.Rat).SetUint64(uint64(v)), true
	case uint16:
		return new(big.Rat).SetUint64(uint64(v)), true
	case uint32:
		return new(big.Rat).SetUint64(uint64(v)), true
	case uint64:
		return new(big.Rat).SetUint64(v), true
	case float32:
		str := strconv.FormatFloat(float64(v), 'f', -1, 32)
		r, ok := new(big.Rat).SetString(str)
		return r, ok
	case float64:
		str := strconv.FormatFloat(v, 'f', -1, 64)
		r, ok := new(big.Rat).SetString(str)
		return r, ok
	default:
		return nil, false
	}
}
