package repository

import (
	"context"

	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
)

type AuditRepository interface {
	Create(ctx context.Context, tx *gorm.DB, log *domain.AuditLog) error
	ListByFlagID(ctx context.Context, flagID int64) ([]*domain.AuditLog, error)
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
