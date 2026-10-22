package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
)

// SeedDemoData populates initial demo flags, ordered rules, and audit records idempotently.
func SeedDemoData(db *gorm.DB) error {
	ctx := context.Background()

	type seedRule struct {
		Priority      int
		AttributeName string
		Operator      string
		ExpectedValue json.RawMessage
		ReturnValue   bool
	}

	type seedFlag struct {
		Key          string
		Name         string
		Description  string
		Environment  domain.Environment
		Enabled      bool
		DefaultValue bool
		Rules        []seedRule
	}

	demoFlags := []seedFlag{
		{
			Key:          "checkout_v2",
			Name:         "新版结账收银台",
			Description:  "双十一大促新版收银台灰度放量控制",
			Environment:  domain.EnvProduction,
			Enabled:      true,
			DefaultValue: false,
			Rules: []seedRule{
				{
					Priority:      1,
					AttributeName: "country",
					Operator:      "equals",
					ExpectedValue: json.RawMessage(`"CN"`),
					ReturnValue:   true,
				},
				{
					Priority:      2,
					AttributeName: "plan",
					Operator:      "in",
					ExpectedValue: json.RawMessage(`["premium", "enterprise"]`),
					ReturnValue:   true,
				},
				{
					Priority:      3,
					AttributeName: "risk_score",
					Operator:      "equals",
					ExpectedValue: json.RawMessage(`0.0`),
					ReturnValue:   false,
				},
			},
		},
		{
			Key:          "checkout_v2",
			Name:         "新版结账收银台 (开发环境)",
			Description:  "开发环境全量开启联调测试",
			Environment:  domain.EnvDevelopment,
			Enabled:      true,
			DefaultValue: true,
			Rules:        []seedRule{},
		},
		{
			Key:          "ai_copilot_assistant",
			Name:         "智能代码补全助手",
			Description:  "大模型代码生成与实时提示灰度",
			Environment:  domain.EnvStaging,
			Enabled:      true,
			DefaultValue: false,
			Rules: []seedRule{
				{
					Priority:      1,
					AttributeName: "user_id",
					Operator:      "in",
					ExpectedValue: json.RawMessage(`[10001, 10002, 9007199254740993]`),
					ReturnValue:   true,
				},
				{
					Priority:      2,
					AttributeName: "beta_tester",
					Operator:      "equals",
					ExpectedValue: json.RawMessage(`true`),
					ReturnValue:   true,
				},
			},
		},
		{
			Key:          "dark_mode_theme",
			Name:         "暗黑模式沉浸体验",
			Description:  "全站暗黑主题开关 (当前熔断停用)",
			Environment:  domain.EnvProduction,
			Enabled:      false,
			DefaultValue: true,
			Rules: []seedRule{
				{
					Priority:      1,
					AttributeName: "preview_tester",
					Operator:      "equals",
					ExpectedValue: json.RawMessage(`true`),
					ReturnValue:   true,
				},
			},
		},
	}

	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, sf := range demoFlags {
			var count int64
			if err := tx.Model(&domain.Flag{}).
				Where("key = ? AND environment = ?", sf.Key, sf.Environment).
				Count(&count).Error; err != nil {
				return fmt.Errorf("failed to check existing flag %s in %s: %w", sf.Key, sf.Environment, err)
			}

			if count > 0 {
				// Already exists, skip idempotently
				continue
			}

			flag := &domain.Flag{
				Key:          sf.Key,
				Name:         sf.Name,
				Description:  sf.Description,
				Environment:  sf.Environment,
				Enabled:      sf.Enabled,
				DefaultValue: sf.DefaultValue,
			}
			if err := tx.Create(flag).Error; err != nil {
				return fmt.Errorf("failed to seed flag %s: %w", sf.Key, err)
			}

			// Insert rules
			for _, r := range sf.Rules {
				rule := &domain.Rule{
					FlagID:        flag.ID,
					AttributeName: r.AttributeName,
					Operator:      r.Operator,
					ExpectedValue: r.ExpectedValue,
					ReturnValue:   r.ReturnValue,
					Priority:      r.Priority,
				}
				if err := tx.Create(rule).Error; err != nil {
					return fmt.Errorf("failed to seed rule for flag %s: %w", sf.Key, err)
				}
			}

			// Insert initial audit log
			initialDiff, _ := json.Marshal(map[string]interface{}{
				"key":           flag.Key,
				"name":          flag.Name,
				"environment":   flag.Environment,
				"default_value": flag.DefaultValue,
				"rule_count":    len(sf.Rules),
			})

			auditLog := &domain.AuditLog{
				FlagID:      flag.ID,
				FlagKey:     flag.Key,
				Environment: flag.Environment,
				ActionType:  domain.ActionFlagCreated,
				Operator:    domain.DefaultOperator,
				DiffSummary: initialDiff,
			}
			if err := tx.Create(auditLog).Error; err != nil {
				return fmt.Errorf("failed to seed audit log for flag %s: %w", sf.Key, err)
			}

			log.Printf("[SEED] Demo flag '%s' seeded successfully in environment '%s'", sf.Key, sf.Environment)
		}
		return nil
	})
}
