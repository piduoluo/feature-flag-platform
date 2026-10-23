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
	List(ctx context.Context, query domain.FlagListQuery) ([]*domain.Flag, int64, domain.FlagStats, error)
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

func (r *flagRepository) List(ctx context.Context, query domain.FlagListQuery) ([]*domain.Flag, int64, domain.FlagStats, error) {
	baseQuery := r.db.WithContext(ctx).Model(&domain.Flag{})

	if query.Environment != "" {
		baseQuery = baseQuery.Where("environment = ?", query.Environment)
	}

	if query.Search != "" {
		searchPattern := "%" + strings.ToLower(query.Search) + "%"
		baseQuery = baseQuery.Where("LOWER(key) LIKE ? OR LOWER(name) LIKE ?", searchPattern, searchPattern)
	}

	var stats domain.FlagStats
	// Clone the statement so the aggregate Select does not leak into the
	// paginated list query below.
	statsQuery := baseQuery.Session(&gorm.Session{})
	if err := statsQuery.
		Select(`COUNT(*) AS all_count,
			COALESCE(SUM(CASE WHEN enabled THEN 1 ELSE 0 END), 0) AS enabled_count,
			COALESCE(SUM(CASE WHEN enabled THEN 0 ELSE 1 END), 0) AS disabled_count`).
		Scan(&stats).Error; err != nil {
		return nil, 0, domain.FlagStats{}, err
	}

	listQuery := baseQuery
	if query.Enabled != nil {
		listQuery = listQuery.Where("enabled = ?", *query.Enabled)
	}

	var total int64
	if err := listQuery.Count(&total).Error; err != nil {
		return nil, 0, domain.FlagStats{}, err
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
	err := listQuery.Order("created_at DESC, id DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&flags).Error
	if err != nil {
		return nil, 0, domain.FlagStats{}, err
	}

	return flags, total, stats, nil
}

func (r *flagRepository) Update(ctx context.Context, tx *gorm.DB, flag *domain.Flag) error {
	db := r.db.WithContext(ctx)
	if tx != nil {
		db = tx.WithContext(ctx)
	}
	return db.Save(flag).Error
}
