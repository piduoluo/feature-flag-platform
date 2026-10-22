package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
)

type RuleRepository interface {
	ListByFlagID(ctx context.Context, flagID int64) ([]*domain.Rule, error)
	GetByID(ctx context.Context, id int64) (*domain.Rule, error)
	Create(ctx context.Context, tx *gorm.DB, rule *domain.Rule) error
	Update(ctx context.Context, tx *gorm.DB, rule *domain.Rule) error
	Delete(ctx context.Context, tx *gorm.DB, id int64) error
	ShiftPriorities(ctx context.Context, tx *gorm.DB, flagID int64, offset int) error
}

type ruleRepository struct {
	db *gorm.DB
}

func NewRuleRepository(db *gorm.DB) RuleRepository {
	return &ruleRepository{db: db}
}

func (r *ruleRepository) ListByFlagID(ctx context.Context, flagID int64) ([]*domain.Rule, error) {
	var rules []*domain.Rule
	err := r.db.WithContext(ctx).
		Where("flag_id = ?", flagID).
		Order("priority ASC").
		Find(&rules).Error
	if err != nil {
		return nil, err
	}
	if rules == nil {
		rules = make([]*domain.Rule, 0)
	}
	return rules, nil
}

func (r *ruleRepository) GetByID(ctx context.Context, id int64) (*domain.Rule, error) {
	var rule domain.Rule
	err := r.db.WithContext(ctx).First(&rule, "id = ?", id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &rule, nil
}

func (r *ruleRepository) Create(ctx context.Context, tx *gorm.DB, rule *domain.Rule) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Create(rule).Error
}

func (r *ruleRepository) Update(ctx context.Context, tx *gorm.DB, rule *domain.Rule) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Save(rule).Error
}

func (r *ruleRepository) Delete(ctx context.Context, tx *gorm.DB, id int64) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Delete(&domain.Rule{}, "id = ?", id).Error
}

// ShiftPriorities adjusts existing rules' priorities by offset (e.g. +10000) to allow atomic swaps without unique index collision
func (r *ruleRepository) ShiftPriorities(ctx context.Context, tx *gorm.DB, flagID int64, offset int) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Exec("UPDATE rules SET priority = priority + ? WHERE flag_id = ?", offset, flagID).Error
}
