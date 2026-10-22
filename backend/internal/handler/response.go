package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"feature-flag-platform/internal/domain"
)

// Response standard API envelope
type Response struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
}

func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Code:    "SUCCESS",
		Message: "Operation successful",
		Data:    data,
	})
}

func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Response{
		Code:    "SUCCESS",
		Message: "Resource created successfully",
		Data:    data,
	})
}

func Error(c *gin.Context, err error) {
	var appErr *domain.AppError
	if errors.As(err, &appErr) {
		c.JSON(appErr.HTTPStatus, Response{
			Code:    appErr.Code,
			Message: appErr.Message,
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusInternalServerError, Response{
		Code:    domain.ErrCodeInternal,
		Message: err.Error(),
		Data:    nil,
	})
}
