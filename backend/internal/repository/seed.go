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
			Key:          "ai_ride_assistant_enabled",
			Name:         "AI 行程助手",
			Description:  "仅对演示测试用户开放 AI 行程助手",
			Environment:  domain.EnvProduction,
			Enabled:      true,
			DefaultValue: false,
			Rules: []seedRule{
				{
					Priority:      1,
					AttributeName: "user_id",
					Operator:      "in",
					ExpectedValue: json.RawMessage(`[10001, 10002]`),
					ReturnValue:   true,
				},
			},
		},
		{
			Key:          "ai_ride_assistant_enabled",
			Name:         "AI 行程助手（开发环境）",
			Description:  "开发环境全量开启，供功能联调",
			Environment:  domain.EnvDevelopment,
			Enabled:      true,
			DefaultValue: true,
			Rules:        []seedRule{},
		},
		{
			Key:          "robotaxi_r2_trial_enabled",
			Name:         "Robotaxi R2 试点体验",
			Description:  "仅对演示试点用户开放 Robotaxi R2",
			Environment:  domain.EnvStaging,
			Enabled:      true,
			DefaultValue: false,
			Rules: []seedRule{
				{
					Priority:      1,
					AttributeName: "pilot_paused",
					Operator:      "equals",
					ExpectedValue: json.RawMessage(`true`),
					ReturnValue:   false,
				},
				{
					Priority:      2,
					AttributeName: "user_id",
					Operator:      "in",
					ExpectedValue: json.RawMessage(`[20001, 20002]`),
					ReturnValue:   true,
				},
			},
		},
		{
			Key:          "safety_ai_upgrade_enabled",
			Name:         "安全 AI 功能升级",
			Description:  "演示安全功能的开关与紧急关闭",
			Environment:  domain.EnvProduction,
			Enabled:      false,
			DefaultValue: false,
			Rules: []seedRule{
				{
					Priority:      1,
					AttributeName: "user_id",
					Operator:      "in",
					ExpectedValue: json.RawMessage(`[30001]`),
					ReturnValue:   true,
				},
			},
		},
		{
			Key:          "robotaxi_uae_pilot_enabled",
			Name:         "Robotaxi 阿联酋试点预留",
			Description:  "为计划中的阿联酋试点预留测试开关；不代表功能已上线",
			Environment:  domain.EnvStaging,
			Enabled:      true,
			DefaultValue: false,
			Rules: []seedRule{
				{
					Priority:      1,
					AttributeName: "pilot_cohort",
					Operator:      "equals",
					ExpectedValue: json.RawMessage(`"uae_preview"`),
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
