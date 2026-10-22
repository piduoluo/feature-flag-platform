package repository

import (
	"fmt"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"feature-flag-platform/internal/domain"
)

// InitDB initializes GORM PostgreSQL connection.
func InitDB(dsn string) (*gorm.DB, error) {
	if dsn == "" {
		dsn = GetDSNFromEnv()
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// Execute raw SQL migration if found to guarantee explicit constraints
	migrationPaths := []string{
		"migrations/000001_init.up.sql",
		"backend/migrations/000001_init.up.sql",
		"../../migrations/000001_init.up.sql",
		"../../../backend/migrations/000001_init.up.sql",
	}
	for _, p := range migrationPaths {
		if content, err := os.ReadFile(p); err == nil {
			if _, err := sqlDB.Exec(string(content)); err != nil {
				return nil, fmt.Errorf("failed to run SQL migration from %s: %w", p, err)
			}
			break
		}
	}

	// Ensure schema consistency with GORM models
	if err := db.AutoMigrate(&domain.Flag{}, &domain.Rule{}, &domain.AuditLog{}); err != nil {
		return nil, fmt.Errorf("failed to auto-migrate database schema: %w", err)
	}

	return db, nil
}

// GetDSNFromEnv constructs PostgreSQL DSN from environment variables.
func GetDSNFromEnv() string {
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		return databaseURL
	}

	host := getEnvOrDefault("DB_HOST", "localhost")
	port := getEnvOrDefault("DB_PORT", "5432")
	user := getEnvOrDefault("DB_USER", getDefaultUser())
	password := os.Getenv("DB_PASSWORD")
	dbname := getEnvOrDefault("DB_NAME", "feature_flag_db")
	sslmode := getEnvOrDefault("DB_SSLMODE", "disable")

	if password != "" {
		return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, user, password, dbname, sslmode)
	}
	return fmt.Sprintf("host=%s port=%s user=%s dbname=%s sslmode=%s",
		host, port, user, dbname, sslmode)
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getDefaultUser() string {
	if u := os.Getenv("USER"); u != "" {
		return u
	}
	return "postgres"
}
