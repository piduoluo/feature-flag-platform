package handler

import (
	"encoding/json"

	"github.com/gin-gonic/gin"

	"feature-flag-platform/internal/domain"
	"feature-flag-platform/internal/service"
)

// EvaluationHandler handles HTTP requests for evaluating feature flags.
type EvaluationHandler struct {
	evalService service.EvaluationService
}

// NewEvaluationHandler constructs a new EvaluationHandler instance.
func NewEvaluationHandler(evalService service.EvaluationService) *EvaluationHandler {
	return &EvaluationHandler{
		evalService: evalService,
	}
}

// RegisterRoutes registers the evaluation endpoints on the gin router group.
func (h *EvaluationHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/evaluations", h.Evaluate)
}

// Evaluate processes POST /api/v1/evaluations with strict JSON number decoding.
func (h *EvaluationHandler) Evaluate(c *gin.Context) {
	var req domain.EvaluationRequest
	decoder := json.NewDecoder(c.Request.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&req); err != nil {
		Error(c, domain.NewValidationError("invalid request JSON: "+err.Error()))
		return
	}

	result, err := h.evalService.Evaluate(c.Request.Context(), &req)
	if err != nil {
		Error(c, err)
		return
	}

	Success(c, result)
}
