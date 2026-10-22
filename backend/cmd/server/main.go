package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"feature-flag-platform/internal/handler"
	"feature-flag-platform/internal/repository"
	"feature-flag-platform/internal/service"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dsn := repository.GetDSNFromEnv()
	db, err := repository.InitDB(dsn)
	if err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}

	flagRepo := repository.NewFlagRepository(db)
	auditRepo := repository.NewAuditRepository(db)
	ruleRepo := repository.NewRuleRepository(db)
	flagService := service.NewFlagService(flagRepo, auditRepo)
	ruleService := service.NewRuleService(flagRepo, ruleRepo, auditRepo)
	flagHandler := handler.NewFlagHandler(flagService, ruleService)

	router := gin.Default()

	// CORS middleware for local frontend development
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	apiGroup := router.Group("/api/v1")
	flagHandler.RegisterRoutes(apiGroup)

	log.Printf("Server listening on port %s...", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server terminated: %v", err)
	}
}
