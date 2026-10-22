package repository

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	"feature-flag-platform/internal/domain"
)

type FlagRepository interface {
	Create(ctx context.Context, tx *gorm.DB, flag *domain.Flag) error
	GetByID(ctx context.Context, id int64) (*domain.Flag, error)
	GetByKeyAndEnv(ctx context.Context, key, env string) (*domain.Flag, error)
	List(ctx context.Context, query domain.FlagListQuery) ([]*domain.Flag, int64, error)
	Update(ctx context.Context, tx *gorm.DB, flag *domain.Flag) error
	WithTransaction(ctx context.Context, fn func(tx *gorm.DB) error) error
}

type flagRepository struct {
	db *gorm.DB
}

func NewFlagRepository(db *gorm.DB) FlagRepository {
	return &flagRepository{db: db}
}

func (r *flagRepository) WithTransaction(ctx context.Context, fn func(tx *gorm.DB) error) error {
	return r.db.WithContext(ctx).Transaction(fn)
}

func (r *flagRepository) Create(ctx context.Context, tx *gorm.DB, flag *domain.Flag) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Create(flag).Error
}

func (r *flagRepository) GetByID(ctx context.Context, id int64) (*domain.Flag, error) {
	var flag domain.Flag
	err := r.db.WithContext(ctx).
		Preload("Rules", func(db *gorm.DB) *gorm.DB {
			return db.Order("rules.priority ASC")
		}).
		First(&flag, "id = ?", id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &flag, nil
}

func (r *flagRepository) GetByKeyAndEnv(ctx context.Context, key, env string) (*domain.Flag, error) {
	var flag domain.Flag
	err := r.db.WithContext(ctx).
		Preload("Rules", func(db *gorm.DB) *gorm.DB {
			return db.Order("rules.priority ASC")
		}).
		Where("key = ? AND environment = ?", key, env).
		First(&flag).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &flag, nil
}

func (r *flagRepository) List(ctx context.Context, query domain.FlagListQuery) ([]*domain.Flag, int64, error) {
	db := r.db.WithContext(ctx).Model(&domain.Flag{})

	if query.Environment != "" {
		db = db.Where("environment = ?", query.Environment)
	}

	if query.Search != "" {
		searchPattern := "%" + strings.ToLower(query.Search) + "%"
		db = db.Where("LOWER(key) LIKE ? OR LOWER(name) LIKE ?", searchPattern, searchPattern)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := query.Page
	if page < 1 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	flags := make([]*domain.Flag, 0)
	err := db.Order("created_at DESC, id DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&flags).Error
	if err != nil {
		return nil, 0, err
	}

	return flags, total, nil
}

func (r *flagRepository) Update(ctx context.Context, tx *gorm.DB, flag *domain.Flag) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Save(flag).Error
}
