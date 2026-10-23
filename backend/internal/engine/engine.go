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
	if rules == nil {
		rules = flag.Rules
	}
	res := &domain.EvaluationResponse{
		FlagID: flag.ID, FlagKey: flag.Key, Environment: flag.Environment,
		Enabled: flag.Enabled, DefaultValue: flag.DefaultValue,
		RuleCount: len(rules), RuleTrace: make([]domain.RuleTrace, 0),
		Result: false, Reason: domain.ReasonFlagDisabled,
	}
	if !flag.Enabled {
		return res
	}

	sortedRules := append([]domain.Rule(nil), rules...)
	sort.SliceStable(sortedRules, func(i, j int) bool {
		return sortedRules[i].Priority < sortedRules[j].Priority
	})
	for _, rule := range sortedRules {
		actual, present := context[rule.AttributeName]
		reason := explainRule(rule, actual, present)
		expected := rule.ExpectedValue
		// Corrupt stored JSON must not make the diagnostic response unserializable.
		if !json.Valid(expected) {
			expected = json.RawMessage("null")
		}
		trace := domain.RuleTrace{
			MatchedRuleInfo: domain.MatchedRuleInfo{
				ID: rule.ID, Priority: rule.Priority, AttributeName: rule.AttributeName,
				Operator: rule.Operator, ExpectedValue: expected, ReturnValue: rule.ReturnValue,
			},
			AttributePresent: present, ActualValue: actual,
			Matched: reason == domain.TraceMatched, Reason: reason,
		}
		res.RuleTrace = append(res.RuleTrace, trace)
		if trace.Matched {
			res.Result = rule.ReturnValue
			res.Reason = domain.ReasonRuleMatch
			res.MatchedRule = &trace.MatchedRuleInfo
			return res
		}
	}
	res.Result = flag.DefaultValue
	res.Reason = domain.ReasonDefaultFallback
	return res
}

// explainRule performs the match once and records the first decisive reason.
func explainRule(rule domain.Rule, actual interface{}, present bool) domain.RuleTraceReason {
	if !present {
		return domain.TraceAttributeMissing
	}
	if actual == nil {
		return domain.TraceNullValue
	}
	decoder := json.NewDecoder(bytes.NewReader(rule.ExpectedValue))
	decoder.UseNumber()
	var expected interface{}
	if err := decoder.Decode(&expected); err != nil {
		return domain.TraceInvalidRule
	}
	switch rule.Operator {
	case "equals":
		if scalarType(expected) == "" {
			return domain.TraceInvalidRule
		}
		if matchScalar(actual, expected) {
			return domain.TraceMatched
		}
		if scalarType(actual) != scalarType(expected) {
			return domain.TraceTypeMismatch
		}
		return domain.TraceValueMismatch
	case "in":
		values, ok := expected.([]interface{})
		if !ok {
			return domain.TraceInvalidRule
		}
		sameType := false
		for _, value := range values {
			if matchScalar(actual, value) {
				return domain.TraceMatched
			}
			if kind := scalarType(value); kind != "" && kind == scalarType(actual) {
				sameType = true
			}
		}
		if sameType {
			return domain.TraceNotInSet
		}
		return domain.TraceTypeMismatch
	default:
		return domain.TraceInvalidRule
	}
}

func scalarType(value interface{}) string {
	switch value.(type) {
	case string:
		return "string"
	case bool:
		return "boolean"
	default:
		if _, ok := toRat(value); ok {
			return "number"
		}
		return ""
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
