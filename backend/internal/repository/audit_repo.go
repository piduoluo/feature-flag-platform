package repository

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
)

// escapeLikePattern escapes LIKE wildcards so user search input is matched
// literally instead of being interpreted as a pattern.
func escapeLikePattern(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

type AuditRepository interface {
	Create(ctx context.Context, tx *gorm.DB, log *domain.AuditLog) error
	ListByFlagID(ctx context.Context, flagID int64) ([]*domain.AuditLog, error)
	ListAll(ctx context.Context, query domain.AuditLogListQuery) ([]*domain.AuditLog, int64, error)
}

type auditRepository struct {
	db *gorm.DB
}

func NewAuditRepository(db *gorm.DB) AuditRepository {
	return &auditRepository{db: db}
}

func (r *auditRepository) Create(ctx context.Context, tx *gorm.DB, log *domain.AuditLog) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Create(log).Error
}

func (r *auditRepository) ListAll(ctx context.Context, query domain.AuditLogListQuery) ([]*domain.AuditLog, int64, error) {
	db := r.db.WithContext(ctx).Model(&domain.AuditLog{})

	if query.Environment != "" {
		db = db.Where("environment = ?", query.Environment)
	}

	if query.FlagKey != "" {
		db = db.Where(`LOWER(flag_key) LIKE ? ESCAPE '\'`, "%"+escapeLikePattern(strings.ToLower(query.FlagKey))+"%")
	}

	if query.ActionType != "" {
		db = db.Where("action_type = ?", query.ActionType)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	logs := make([]*domain.AuditLog, 0)
	err := db.Order("created_at DESC, id DESC").
		Offset((query.Page - 1) * query.PageSize).
		Limit(query.PageSize).
		Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	return logs, total, nil
}

func (r *auditRepository) ListByFlagID(ctx context.Context, flagID int64) ([]*domain.AuditLog, error) {
	var logs []*domain.AuditLog
	err := r.db.WithContext(ctx).
		Where("flag_id = ?", flagID).
		Order("created_at DESC, id DESC").
		Find(&logs).Error
	if err != nil {
		return nil, err
	}
	return logs, nil
}
