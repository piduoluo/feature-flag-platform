package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/service"
)

type FlagHandler struct {
	flagService service.FlagService
}

func NewFlagHandler(flagService service.FlagService) *FlagHandler {
	return &FlagHandler{flagService: flagService}
}

func (h *FlagHandler) RegisterRoutes(rg *gin.RouterGroup) {
	flags := rg.Group("/flags")
	{
		flags.POST("", h.CreateFlag)
		flags.GET("", h.ListFlags)
		flags.GET("/:id", h.GetFlag)
		flags.PUT("/:id", h.UpdateFlag)
		flags.PATCH("/:id/toggle", h.ToggleFlag)
		flags.GET("/:id/audit-logs", h.GetAuditLogs)
	}
}

func (h *FlagHandler) CreateFlag(c *gin.Context) {
	var req domain.CreateFlagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Error(c, domain.NewValidationError("invalid request body: "+err.Error()))
		return
	}

	flag, err := h.flagService.CreateFlag(c.Request.Context(), &req)
	if err != nil {
		Error(c, err)
		return
	}

	Created(c, flag)
}

func (h *FlagHandler) ListFlags(c *gin.Context) {
	var query domain.FlagListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		Error(c, domain.NewValidationError("invalid query parameters: "+err.Error()))
		return
	}

	result, err := h.flagService.ListFlags(c.Request.Context(), query)
	if err != nil {
		Error(c, err)
		return
	}

	Success(c, result)
}

func parseFlagID(c *gin.Context) (int64, error) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return 0, domain.NewValidationError("invalid flag id: must be an integer")
	}
	return id, nil
}

func (h *FlagHandler) GetFlag(c *gin.Context) {
	id, err := parseFlagID(c)
	if err != nil {
		Error(c, err)
		return
	}

	flag, err := h.flagService.GetFlagByID(c.Request.Context(), id)
	if err != nil {
		Error(c, err)
		return
	}

	Success(c, flag)
}

func (h *FlagHandler) UpdateFlag(c *gin.Context) {
	id, err := parseFlagID(c)
	if err != nil {
		Error(c, err)
		return
	}

	var req domain.UpdateFlagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Error(c, domain.NewValidationError("invalid request body: "+err.Error()))
		return
	}

	flag, err := h.flagService.UpdateFlag(c.Request.Context(), id, &req)
	if err != nil {
		Error(c, err)
		return
	}

	Success(c, flag)
}

func (h *FlagHandler) ToggleFlag(c *gin.Context) {
	id, err := parseFlagID(c)
	if err != nil {
		Error(c, err)
		return
	}

	var req domain.ToggleFlagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Error(c, domain.NewValidationError("invalid request body: "+err.Error()))
		return
	}

	flag, err := h.flagService.ToggleFlag(c.Request.Context(), id, &req)
	if err != nil {
		Error(c, err)
		return
	}

	Success(c, flag)
}

func (h *FlagHandler) GetAuditLogs(c *gin.Context) {
	id, err := parseFlagID(c)
	if err != nil {
		Error(c, err)
		return
	}

	logs, err := h.flagService.GetAuditLogs(c.Request.Context(), id)
	if err != nil {
		Error(c, err)
		return
	}

	Success(c, logs)
}
