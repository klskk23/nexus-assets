package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/model"
)

func (s *Server) listUsers(c *gin.Context) {
	items, err := s.users.List(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if items == nil {
		items = []model.User{}
	}
	c.JSON(http.StatusOK, items)
}

func (s *Server) createUser(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Name     string `json:"name"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	out, err := s.users.Create(c.Request.Context(), auth.CreateInput{
		Email: req.Email, Name: req.Name, AuthType: model.AuthLocal, Password: req.Password,
	})
	if err != nil {
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, err.Error(), nil)
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchUser(c *gin.Context) {
	var req struct {
		Disable *bool `json:"disable"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	ctx := c.Request.Context()
	if req.Disable != nil && *req.Disable {
		if err := s.users.Disable(ctx, c.Param("id")); err != nil {
			FailErr(c, err)
			return
		}
	}
	out, err := s.users.Get(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
