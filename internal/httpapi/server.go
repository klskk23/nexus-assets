package httpapi

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Server wires the HTTP surface to the domain services.
type Server struct {
	cfg     *config.Config
	issuer  *auth.Issuer
	users   *auth.Store
	schema  *schema.Store
	holders *holder.Store
	assets  *asset.Service
	oidc    *auth.OIDC
	webFS   fs.FS
}

// NewServer builds the API server.
func NewServer(cfg *config.Config, issuer *auth.Issuer, users *auth.Store,
	sch *schema.Store, holders *holder.Store, assets *asset.Service,
	oidcFlow *auth.OIDC, webFS fs.FS) *Server {
	return &Server{cfg: cfg, issuer: issuer, users: users, schema: sch,
		holders: holders, assets: assets, oidc: oidcFlow, webFS: webFS}
}

// Router builds the gin engine.
func (s *Server) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())

	api := r.Group("/api")
	api.POST("/auth/login", s.login)
	api.GET("/auth/oidc/start", s.oidcStart)
	api.GET("/auth/oidc/callback", s.oidcCallback)

	authed := api.Group("")
	authed.Use(auth.Middleware(s.issuer, s.users, func(c *gin.Context) {
		Fail(c, http.StatusUnauthorized, CodeUnauthenticated, MsgUnauthenticated, nil)
	}))

	authed.GET("/me", s.me)

	authed.GET("/categories", s.listCategories)
	authed.POST("/categories", s.createCategory)
	authed.PATCH("/categories/:id", s.patchCategory)
	authed.GET("/categories/:id/schema", s.categorySchema)

	authed.GET("/fields", s.listFields)
	authed.POST("/fields", s.createField)
	authed.PATCH("/fields/:id", s.patchField)
	authed.POST("/categories/:id/bindings", s.bindField)

	authed.GET("/models", s.listModels)
	authed.POST("/models", s.createModel)

	authed.GET("/holders", s.listHolders)
	authed.POST("/holders", s.createHolder)
	authed.PATCH("/holders/:id", s.patchHolder)

	authed.GET("/users", s.listUsers)
	authed.POST("/users", s.createUser)
	authed.PATCH("/users/:id", s.patchUser)

	authed.GET("/assets", s.listAssets)
	authed.POST("/assets", s.createAsset)
	authed.GET("/assets/:id", s.getAsset)
	authed.PATCH("/assets/:id", s.patchAsset)
	authed.DELETE("/assets/:id", s.deleteAsset)

	if s.webFS != nil {
		s.mountWeb(r)
	}
	return r
}

// mountWeb serves the embedded single-page application, falling back to
// index.html so client-side routes survive a refresh.
func (s *Server) mountWeb(r *gin.Engine) {
	fileServer := http.FileServer(http.FS(s.webFS))
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			Fail(c, http.StatusNotFound, CodeNotFound, MsgNotFound, nil)
			return
		}
		if _, err := fs.Stat(s.webFS, strings.TrimPrefix(c.Request.URL.Path, "/")); err != nil {
			c.Request.URL.Path = "/"
		}
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}
