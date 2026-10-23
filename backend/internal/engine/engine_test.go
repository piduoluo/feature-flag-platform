package engine_test

import (
	"encoding/json"
	"testing"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/engine"
)

func TestEvaluationEngine_DisabledFlag(t *testing.T) {
	eng := engine.NewEvaluationEngine()

	flag := &domain.Flag{
		ID:           1,
		Key:          "test_feature",
		Environment:  domain.EnvProduction,
		Enabled:      false,
		DefaultValue: true, // Even if default is true, disabled must return false
		Rules: []domain.Rule{
			{
				ID:            10,
				Priority:      1,
				AttributeName: "country",
				Operator:      "equals",
				ExpectedValue: json.RawMessage(`"CN"`),
				ReturnValue:   true,
			},
		},
	}

	res := eng.Evaluate(flag, flag.Rules, map[string]interface{}{"country": "CN"})

	if res.Enabled {
		t.Errorf("expected enabled=false, got true")
	}
	if res.Result != false {
		t.Errorf("expected result=false when flag disabled, got %v", res.Result)
	}
	if res.Reason != domain.ReasonFlagDisabled {
		t.Errorf("expected reason=FLAG_DISABLED, got %v", res.Reason)
	}
	if res.MatchedRule != nil {
		t.Errorf("expected matched_rule=nil, got %+v", res.MatchedRule)
	}
}

func TestEvaluationEngine_DefaultFallback(t *testing.T) {
	eng := engine.NewEvaluationEngine()

	tests := []struct {
		name         string
		defaultValue bool
		rules        []domain.Rule
		context      map[string]interface{}
	}{
		{
			name:         "empty rules fallback to true",
			defaultValue: true,
			rules:        []domain.Rule{},
			context:      map[string]interface{}{"country": "CN"},
		},
		{
			name:         "empty rules fallback to false",
			defaultValue: false,
			rules:        []domain.Rule{},
			context:      map[string]interface{}{"country": "CN"},
		},
		{
			name:         "no matching rules fallback to default true",
			defaultValue: true,
			rules: []domain.Rule{
				{
					ID:            1,
					Priority:      1,
					AttributeName: "country",
					Operator:      "equals",
					ExpectedValue: json.RawMessage(`"US"`),
					ReturnValue:   false,
				},
			},
			context: map[string]interface{}{"country": "CN"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			flag := &domain.Flag{
				ID:           1,
				Key:          "fallback_flag",
				Environment:  domain.EnvProduction,
				Enabled:      true,
				DefaultValue: tc.defaultValue,
			}
			res := eng.Evaluate(flag, tc.rules, tc.context)
			if !res.Enabled {
				t.Errorf("expected enabled=true")
			}
			if res.Result != tc.defaultValue {
				t.Errorf("expected result=%v, got %v", tc.defaultValue, res.Result)
			}
			if res.Reason != domain.ReasonDefaultFallback {
				t.Errorf("expected reason=DEFAULT_FALLBACK, got %v", res.Reason)
			}
			if res.MatchedRule != nil {
				t.Errorf("expected matched_rule=nil, got %+v", res.MatchedRule)
			}
		})
	}
}

func TestEvaluationEngine_PriorityAndShortCircuit(t *testing.T) {
	eng := engine.NewEvaluationEngine()

	// Given rules with priority 1 (return false) and priority 2 (return true)
	// Passed in reverse order to ensure engine sorts by priority ascending
	rules := []domain.Rule{
		{
			ID:            2,
			Priority:      2,
			AttributeName: "plan",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"pro"`),
			ReturnValue:   true,
		},
		{
			ID:            1,
			Priority:      1,
			AttributeName: "country",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"CN"`),
			ReturnValue:   false,
		},
	}

	flag := &domain.Flag{
		ID:           1,
		Key:          "priority_flag",
		Environment:  domain.EnvProduction,
		Enabled:      true,
		DefaultValue: true,
	}

	// Context matches both rules: country=CN and plan=pro
	// Priority 1 must match first and short-circuit, returning false
	res := eng.Evaluate(flag, rules, map[string]interface{}{
		"country": "CN",
		"plan":    "pro",
	})

	if res.Reason != domain.ReasonRuleMatch {
		t.Fatalf("expected reason=RULE_MATCH, got %v", res.Reason)
	}
	if res.Result != false {
		t.Errorf("expected short-circuit to priority 1 return_value (false), got %v", res.Result)
	}
	if res.MatchedRule == nil || res.MatchedRule.ID != 1 {
		t.Errorf("expected matched rule ID 1, got %+v", res.MatchedRule)
	}
}

func TestEvaluationEngine_StrictTypeIsolationAndNumericalComparison(t *testing.T) {
	eng := engine.NewEvaluationEngine()

	tests := []struct {
		name          string
		operator      string
		expectedJSON  string
		contextVal    interface{}
		shouldMatch   bool
		expectedMatch bool // rule return_value is true
	}{
		// 1. Strict JSON Type Isolation: string vs number
		{
			name:         "string does not match number (equals)",
			operator:     "equals",
			expectedJSON: `1`,
			contextVal:   "1",
			shouldMatch:  false,
		},
		{
			name:         "number does not match string (equals)",
			operator:     "equals",
			expectedJSON: `"1"`,
			contextVal:   json.Number("1"),
			shouldMatch:  false,
		},
		// 2. Strict JSON Type Isolation: string vs boolean
		{
			name:         "string does not match boolean (equals)",
			operator:     "equals",
			expectedJSON: `true`,
			contextVal:   "true",
			shouldMatch:  false,
		},
		{
			name:         "boolean does not match string (equals)",
			operator:     "equals",
			expectedJSON: `"true"`,
			contextVal:   true,
			shouldMatch:  false,
		},
		// 3. Strict JSON Type Isolation: number vs boolean
		{
			name:         "number 0 does not match boolean false",
			operator:     "equals",
			expectedJSON: `false`,
			contextVal:   0,
			shouldMatch:  false,
		},
		{
			name:         "number 1 does not match boolean true",
			operator:     "equals",
			expectedJSON: `true`,
			contextVal:   1,
			shouldMatch:  false,
		},
		// 4. Exact Numerical Comparison: 1 equals 1.0
		{
			name:         "integer 1 equals 1.0 float in expected",
			operator:     "equals",
			expectedJSON: `1.0`,
			contextVal:   json.Number("1"),
			shouldMatch:  true,
		},
		{
			name:         "float 1.0 equals 1 in expected",
			operator:     "equals",
			expectedJSON: `1`,
			contextVal:   json.Number("1.0"),
			shouldMatch:  true,
		},
		{
			name:         "decimals match exactly: 123.45 equals 123.450",
			operator:     "equals",
			expectedJSON: `123.450`,
			contextVal:   json.Number("123.45"),
			shouldMatch:  true,
		},
		{
			name:         "negative numbers match: -42 equals -42.0",
			operator:     "equals",
			expectedJSON: `-42.0`,
			contextVal:   json.Number("-42"),
			shouldMatch:  true,
		},
		{
			name:         "scientific notation: 1e3 equals 1000",
			operator:     "equals",
			expectedJSON: `1000`,
			contextVal:   json.Number("1e3"),
			shouldMatch:  true,
		},
		// 5. Big Integer exact precision without float64 loss
		{
			name:         "big integer exact match (2^53 + 1)",
			operator:     "equals",
			expectedJSON: `9007199254740993`,
			contextVal:   json.Number("9007199254740993"),
			shouldMatch:  true,
		},
		{
			name:         "big integer off-by-one does not match (2^53 vs 2^53+1)",
			operator:     "equals",
			expectedJSON: `9007199254740992`,
			contextVal:   json.Number("9007199254740993"),
			shouldMatch:  false,
		},
		// 6. Operator IN with strict types and exact numbers
		{
			name:         "in matches identical string",
			operator:     "in",
			expectedJSON: `["CN", "US", "JP"]`,
			contextVal:   "US",
			shouldMatch:  true,
		},
		{
			name:         "in does not match absent string",
			operator:     "in",
			expectedJSON: `["CN", "US"]`,
			contextVal:   "UK",
			shouldMatch:  false,
		},
		{
			name:         "in exact number match: 1.0 in [1, 2, 3]",
			operator:     "in",
			expectedJSON: `[1, 2, 3]`,
			contextVal:   json.Number("1.0"),
			shouldMatch:  true,
		},
		{
			name:         "in type isolation: string '1' not in [1, 2, 3]",
			operator:     "in",
			expectedJSON: `[1, 2, 3]`,
			contextVal:   "1",
			shouldMatch:  false,
		},
		{
			name:         "in big int exact match: 9007199254740993 in array",
			operator:     "in",
			expectedJSON: `[9007199254740993, 100]`,
			contextVal:   json.Number("9007199254740993"),
			shouldMatch:  true,
		},
		{
			name:         "in big int off-by-one does not match",
			operator:     "in",
			expectedJSON: `[9007199254740992, 100]`,
			contextVal:   json.Number("9007199254740993"),
			shouldMatch:  false,
		},
		// 7. Null and Missing attributes handling
		{
			name:         "context value is nil/null safely fails match",
			operator:     "equals",
			expectedJSON: `"CN"`,
			contextVal:   nil,
			shouldMatch:  false,
		},
		{
			name:         "context value is non-scalar map safely fails match",
			operator:     "equals",
			expectedJSON: `"CN"`,
			contextVal:   map[string]interface{}{"nested": "CN"},
			shouldMatch:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			flag := &domain.Flag{
				ID:           1,
				Key:          "test_flag",
				Environment:  domain.EnvProduction,
				Enabled:      true,
				DefaultValue: false,
			}
			rules := []domain.Rule{
				{
					ID:            100,
					Priority:      1,
					AttributeName: "attr",
					Operator:      tc.operator,
					ExpectedValue: json.RawMessage(tc.expectedJSON),
					ReturnValue:   true,
				},
			}

			var ctx map[string]interface{}
			if tc.contextVal == nil {
				ctx = map[string]interface{}{"attr": nil}
			} else {
				ctx = map[string]interface{}{"attr": tc.contextVal}
			}

			res := eng.Evaluate(flag, rules, ctx)
			if tc.shouldMatch {
				if res.Reason != domain.ReasonRuleMatch {
					t.Fatalf("expected RULE_MATCH, got %v", res.Reason)
				}
				if !res.Result {
					t.Errorf("expected result=true on match")
				}
				if res.MatchedRule == nil || res.MatchedRule.ID != 100 {
					t.Errorf("expected matched rule ID 100, got %+v", res.MatchedRule)
				}
			} else {
				if res.Reason != domain.ReasonDefaultFallback {
					t.Fatalf("expected DEFAULT_FALLBACK when no match, got %v", res.Reason)
				}
				if res.Result != false {
					t.Errorf("expected result=false on fallback")
				}
				if res.MatchedRule != nil {
					t.Errorf("expected matched_rule=nil on fallback")
				}
			}
		})
	}
}

func TestEvaluationEngine_MissingAttributeSkipsToNextRule(t *testing.T) {
	eng := engine.NewEvaluationEngine()

	// Rule 1 expects "vip_level" which is missing from context
	// Rule 2 expects "country" which is present and matches
	rules := []domain.Rule{
		{
			ID:            1,
			Priority:      1,
			AttributeName: "vip_level",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`5`),
			ReturnValue:   false,
		},
		{
			ID:            2,
			Priority:      2,
			AttributeName: "country",
			Operator:      "equals",
			ExpectedValue: json.RawMessage(`"CN"`),
			ReturnValue:   true,
		},
	}

	flag := &domain.Flag{
		ID:           1,
		Key:          "skip_flag",
		Environment:  domain.EnvProduction,
		Enabled:      true,
		DefaultValue: false,
	}

	// vip_level is completely missing from context
	res := eng.Evaluate(flag, rules, map[string]interface{}{
		"country": "CN",
	})

	if res.Reason != domain.ReasonRuleMatch {
		t.Fatalf("expected RULE_MATCH, got %v", res.Reason)
	}
	if res.Result != true {
		t.Errorf("expected result=true from Rule 2, got %v", res.Result)
	}
	if res.MatchedRule == nil || res.MatchedRule.ID != 2 {
		t.Errorf("expected matched rule ID 2, got %+v", res.MatchedRule)
	}
}

func TestEvaluationEngine_TraceExplainsDecisions(t *testing.T) {
	cases := []struct {
		name, operator, expected string
		context                  map[string]interface{}
		reason                   domain.RuleTraceReason
	}{
		{"missing is distinct from null", "equals", `"CN"`, map[string]interface{}{}, domain.TraceAttributeMissing},
		{"explicit null", "equals", `"CN"`, map[string]interface{}{"value": nil}, domain.TraceNullValue},
		{"strict types", "equals", `1`, map[string]interface{}{"value": "1"}, domain.TraceTypeMismatch},
		{"object cannot equal a scalar", "equals", `1`, map[string]interface{}{"value": map[string]interface{}{}}, domain.TraceTypeMismatch},
		{"different string", "equals", `"CN"`, map[string]interface{}{"value": "US"}, domain.TraceValueMismatch},
		{"same type outside set", "in", `["premium","enterprise"]`, map[string]interface{}{"value": "free"}, domain.TraceNotInSet},
		{"no matching type in set", "in", `[1,2]`, map[string]interface{}{"value": "1"}, domain.TraceTypeMismatch},
		{"mixed set includes same type", "in", `[1,"premium"]`, map[string]interface{}{"value": "free"}, domain.TraceNotInSet},
		{"invalid JSON skips safely", "equals", `{`, map[string]interface{}{"value": "CN"}, domain.TraceInvalidRule},
		{"invalid operator", "contains", `"CN"`, map[string]interface{}{"value": "CN"}, domain.TraceInvalidRule},
		{"in requires array", "in", `"CN"`, map[string]interface{}{"value": "CN"}, domain.TraceInvalidRule},
		{"equals requires scalar", "equals", `{}`, map[string]interface{}{"value": "CN"}, domain.TraceInvalidRule},
		{"exact large integer hit", "in", `[9007199254740993]`, map[string]interface{}{"value": json.Number("9007199254740993")}, domain.TraceMatched},
		{"adjacent large integer miss", "equals", `9007199254740993`, map[string]interface{}{"value": json.Number("9007199254740992")}, domain.TraceValueMismatch},
		{"equivalent JSON numbers", "equals", `1.0`, map[string]interface{}{"value": json.Number("1")}, domain.TraceMatched},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flag := &domain.Flag{ID: 42, Key: "trace", Enabled: true, DefaultValue: true}
			rule := domain.Rule{ID: 7, Priority: 1, AttributeName: "value", Operator: tc.operator, ExpectedValue: json.RawMessage(tc.expected), ReturnValue: false}
			res := engine.NewEvaluationEngine().Evaluate(flag, []domain.Rule{rule}, tc.context)
			if len(res.RuleTrace) != 1 {
				t.Fatalf("expected one executed rule, got %+v", res)
			}
			trace := res.RuleTrace[0]
			_, present := tc.context["value"]
			if trace.Reason != tc.reason || trace.AttributePresent != present || trace.Matched != (tc.reason == domain.TraceMatched) {
				t.Fatalf("incorrect explanation: %+v", trace)
			}
			if res.FlagID != 42 || !res.DefaultValue || res.RuleCount != 1 {
				t.Fatalf("missing evaluation metadata: %+v", res)
			}
			if trace.Matched {
				if res.Result || res.Reason != domain.ReasonRuleMatch || res.MatchedRule.ID != rule.ID {
					t.Fatalf("matched false must not become fallback: %+v", res)
				}
			} else if !res.Result || res.Reason != domain.ReasonDefaultFallback || res.MatchedRule != nil {
				t.Fatalf("miss must preserve default: %+v", res)
			}
			encoded, err := json.Marshal(res)
			if err != nil {
				t.Fatalf("trace must be valid JSON: %v", err)
			}
			var roundtrip domain.EvaluationResponse
			if err := json.Unmarshal(encoded, &roundtrip); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestEvaluationEngine_TraceStopsAtFirstMatch(t *testing.T) {
	rules := []domain.Rule{
		{ID: 3, Priority: 3, AttributeName: "plan", Operator: "in", ExpectedValue: json.RawMessage(`["premium","enterprise"]`), ReturnValue: true},
		{ID: 1, Priority: 1, AttributeName: "user_id", Operator: "in", ExpectedValue: json.RawMessage(`[10001,10002]`), ReturnValue: true},
		{ID: 2, Priority: 2, AttributeName: "country", Operator: "equals", ExpectedValue: json.RawMessage(`"CN"`), ReturnValue: false},
	}
	flag := &domain.Flag{Enabled: true, Rules: rules}
	eng := engine.NewEvaluationEngine()
	res := eng.Evaluate(flag, nil, map[string]interface{}{"country": "US", "plan": "free"})
	if res.Reason != domain.ReasonDefaultFallback || len(res.RuleTrace) != 3 {
		t.Fatalf("all misses must be recorded: %+v", res)
	}
	for i, reason := range []domain.RuleTraceReason{domain.TraceAttributeMissing, domain.TraceValueMismatch, domain.TraceNotInSet} {
		if res.RuleTrace[i].Priority != i+1 || res.RuleTrace[i].Reason != reason {
			t.Fatalf("incorrect ordered trace: %+v", res.RuleTrace)
		}
	}
	res = eng.Evaluate(flag, nil, map[string]interface{}{"country": "CN", "plan": "premium"})
	if res.Reason != domain.ReasonRuleMatch || res.Result || len(res.RuleTrace) != 2 || res.MatchedRule.ID != 2 || res.RuleCount != 3 {
		t.Fatalf("second rule returns false and third must remain unevaluated: %+v", res)
	}
	if rules[0].ID != 3 {
		t.Fatal("evaluation must not reorder caller-owned rules")
	}
}

func TestEvaluationEngine_EmptyTraceSerializesAsArray(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		flag := &domain.Flag{Enabled: enabled, DefaultValue: true}
		if !enabled {
			flag.Rules = []domain.Rule{{Priority: 1, Operator: "equals", AttributeName: "x", ExpectedValue: json.RawMessage(`1`)}}
		}
		res := engine.NewEvaluationEngine().Evaluate(flag, nil, map[string]interface{}{"x": 1})
		if res.RuleTrace == nil || len(res.RuleTrace) != 0 || res.Result != enabled {
			t.Fatalf("disabled/empty must have empty trace and correct result: %+v", res)
		}
		encoded, err := json.Marshal(res)
		if err != nil {
			t.Fatal(err)
		}
		var wire map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &wire); err != nil {
			t.Fatal(err)
		}
		if string(wire["rule_trace"]) != "[]" {
			t.Fatalf("expected [], got %s", wire["rule_trace"])
		}
	}
}
