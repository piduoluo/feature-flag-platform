package repository

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"feature-flag-platform/internal/domain"
)

// migrationDirs are checked in order so the same code works when the server
// runs from the repo root, from backend/, or from the Docker image (/app).
var migrationDirs = []string{
	"migrations",
	"backend/migrations",
	"../../migrations",
	"../../../backend/migrations",
}

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

	// Execute raw SQL migrations in filename order to guarantee explicit
	// constraints and additive schema upgrades (e.g. new audit columns).
	if err := runMigrations(sqlDB); err != nil {
		return nil, err
	}

	// Ensure schema consistency with GORM models
	if err := db.AutoMigrate(&domain.Flag{}, &domain.Rule{}, &domain.AuditLog{}); err != nil {
		return nil, fmt.Errorf("failed to auto-migrate database schema: %w", err)
	}

	return db, nil
}

// runMigrations applies every *.up.sql file from the first migration directory
// that exists. The statements are written to be idempotent because this repo
// does not keep a schema_migrations ledger.
func runMigrations(sqlDB *sql.DB) error {
	for _, dir := range migrationDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		names := make([]string, 0, len(entries))
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
				names = append(names, entry.Name())
			}
		}
		sort.Strings(names)

		for _, name := range names {
			path := filepath.Join(dir, name)
			content, err := os.ReadFile(path)
			if err != nil {
				return fmt.Errorf("failed to read SQL migration from %s: %w", path, err)
			}
			if _, err := sqlDB.Exec(string(content)); err != nil {
				return fmt.Errorf("failed to run SQL migration from %s: %w", path, err)
			}
		}
		return nil
	}
	return nil
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
