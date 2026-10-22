package domain

import (
	"fmt"
	"net/http"
)

// Standard Error Codes defined in SPEC.md and GLOSSARY.md
const (
	ErrCodeValidation   = "VALIDATION_ERROR"
	ErrCodeFlagNotFound = "FLAG_NOT_FOUND"
	ErrCodeKeyConflict  = "FLAG_KEY_CONFLICT"
	ErrCodePriorityConf = "PRIORITY_CONFLICT"
	ErrCodeInternal     = "INTERNAL_ERROR"
)

// AppError represents a domain error with business code and HTTP status.
type AppError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	HTTPStatus int    `json:"-"`
}

func (e *AppError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func NewValidationError(message string) *AppError {
	return &AppError{
		Code:       ErrCodeValidation,
		Message:    message,
		HTTPStatus: http.StatusBadRequest,
	}
}

func NewFlagNotFoundError(keyOrID interface{}) *AppError {
	return &AppError{
		Code:       ErrCodeFlagNotFound,
		Message:    fmt.Sprintf("Flag %v not found", keyOrID),
		HTTPStatus: http.StatusNotFound,
	}
}

func NewFlagKeyConflictError(key, env string) *AppError {
	return &AppError{
		Code:       ErrCodeKeyConflict,
		Message:    fmt.Sprintf("Flag key '%s' already exists in environment '%s'", key, env),
		HTTPStatus: http.StatusConflict,
	}
}

func NewPriorityConflictError(priority int) *AppError {
	return &AppError{
		Code:       ErrCodePriorityConf,
		Message:    fmt.Sprintf("Rule priority %d already exists for this flag", priority),
		HTTPStatus: http.StatusConflict,
	}
}

func NewInternalError(message string) *AppError {
	return &AppError{
		Code:       ErrCodeInternal,
		Message:    message,
		HTTPStatus: http.StatusInternalServerError,
	}
}
