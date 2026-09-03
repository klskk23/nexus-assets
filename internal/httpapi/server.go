package httpapi

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/importer"
	"github.com/klskk23/nexus-assets/internal/printing"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
	"github.com/klskk23/nexus-assets/internal/transfer"
)

// Server wires the HTTP surface to the domain services.
type Server struct {
	cfg *config.Config
	// db is here for one reader: the health endpoint, which has to answer
	// "can this process still reach its database" rather than "is the port
	// open" -- the second question is the one a stuck deployment passes.
	db        *store.Store
	issuer    *auth.Issuer
	users     *auth.Store
	schema    *schema.Store
	holders   *holder.Store
	assets    *asset.Service
	transfers *transfer.Service
	importer  *importer.Service
	audit     *audit.Store
	oidc      *auth.OIDC
	sessions  *auth.Sessions
	printer   *printing.Client
	keys      *auth.Keys
	roles     *authz.Roles
	webFS     fs.FS
}

// NewServer builds the API server.
func NewServer(cfg *config.Config, db *store.Store, issuer *auth.Issuer, users *auth.Store,
	sch *schema.Store, holders *holder.Store, assets *asset.Service,
	transfers *transfer.Service, imp *importer.Service, aud *audit.Store,
	oidcFlow *auth.OIDC, sessions *auth.Sessions, keys *auth.Keys,
	roles *authz.Roles, webFS fs.FS) *Server {
	return &Server{cfg: cfg, db: db, issuer: issuer, users: users, schema: sch,
		holders: holders, assets: assets, transfers: transfers, importer: imp,
		audit: aud, oidc: oidcFlow, sessions: sessions, keys: keys, roles: roles,
		printer: printing.New(cfg.PrinterURL), webFS: webFS}
}

// Router builds the gin engine.
func (s *Server) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())

	api := r.Group("/api")
	// Read by a container runtime and a reverse proxy, neither of which holds
	// a credential, so it sits outside the authenticated group.
	api.GET("/health", s.health)
	api.POST("/auth/login", s.login)
	api.GET("/auth/oidc/start", s.oidcStart)
	api.GET("/auth/oidc/callback", s.oidcCallback)
	// Refreshing carries its own credential in a cookie, so it cannot sit
	// behind the middleware that wants an access token.
	api.POST("/auth/refresh", s.refresh)
	api.POST("/auth/logout", s.logout)
	// The contract and a page to exercise it against this very server.
	api.GET("/openapi.yaml", s.openAPISpec)
	api.GET("/docs", s.docsIndex)
	api.GET("/docs/*file", s.docsAsset)

	authed := api.Group("")
	authed.Use(auth.Middleware(s.issuer, s.users, s.keys, s.roles,
		auth.ConfigKey{Secret: s.cfg.AdminAPIKey, Email: s.cfg.AdminEmail}, func(c *gin.Context) {
			FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeyUnauthenticated)
		}))

	authed.GET("/me", s.me)
	authed.PATCH("/me", s.patchMe)
	authed.GET("/api-keys", s.listAPIKeys)
	authed.POST("/api-keys", s.createAPIKey)
	authed.DELETE("/api-keys/:id", s.revokeAPIKey)

	authed.GET("/categories", s.listCategories)
	authed.POST("/categories", need(authz.SchemaManage), s.createCategory)
	authed.PATCH("/categories/:id", need(authz.SchemaManage), s.patchCategory)
	authed.DELETE("/categories/:id", need(authz.SchemaManage), s.deleteCategory)
	authed.GET("/categories/:id/schema", s.categorySchema)

	authed.GET("/fields", s.listFields)
	authed.POST("/fields", need(authz.SchemaManage), s.createField)
	authed.PATCH("/fields/:id", need(authz.SchemaManage), s.patchField)
	authed.DELETE("/fields/:id", need(authz.SchemaManage), s.deleteField)
	authed.POST("/categories/:id/bindings", need(authz.SchemaManage), s.bindField)
	authed.DELETE("/categories/:id/bindings/:field_id", need(authz.SchemaManage), s.unbindField)
	authed.GET("/fields/:id/referrers", s.listFieldReferrers)
	authed.POST("/fields/:id/recompute", need(authz.SchemaManage), s.recomputeField)
	authed.POST("/categories/:id/recompute", need(authz.SchemaManage), s.recompute)

	authed.GET("/models", s.listModels)
	authed.POST("/models", need(authz.ModelManage), s.createModel)
	authed.PATCH("/models/:id", need(authz.ModelManage), s.patchModel)
	authed.DELETE("/models/:id", need(authz.ModelManage), s.deleteModel)
	authed.GET("/models/:id/usage", s.modelUsage)

	authed.GET("/statuses", s.listStatuses)
	authed.POST("/statuses", need(authz.StatusManage), s.createStatus)
	authed.PATCH("/statuses/:key", need(authz.StatusManage), s.patchStatus)
	authed.DELETE("/statuses/:key", need(authz.StatusManage), s.deleteStatus)
	authed.GET("/status-usage", s.statusUsage)

	authed.GET("/holders", s.listHolders)
	authed.POST("/holders", need(authz.HolderCreate), s.createHolder)
	authed.PATCH("/holders/:id", s.patchHolder)
	authed.DELETE("/holders/:id", need(authz.HolderDelete), s.deleteHolder)
	authed.GET("/holders/:id/usage", s.holderUsage)

	// Roles are read by the account page to fill a dropdown, so the list is
	// open like every other read; changing them is not.
	authed.GET("/roles", s.listRoles)
	authed.POST("/roles", need(authz.RoleManage), s.createRole)
	authed.PATCH("/roles/:id", need(authz.RoleManage), s.patchRole)
	authed.DELETE("/roles/:id", need(authz.RoleManage), s.deleteRole)
	authed.PATCH("/users/:id/role", need(authz.RoleManage), s.setUserRole)

	authed.GET("/users", s.listUsers)
	authed.POST("/users", need(authz.UserManage), s.createUser)
	authed.PATCH("/users/:id", need(authz.UserManage), s.patchUser)
	authed.POST("/users/:id/password", need(authz.UserManage), s.resetPassword)

	authed.GET("/assets", s.listAssets)
	authed.POST("/assets", need(authz.AssetCreate), s.createAsset)
	authed.GET("/assets/:id", s.getAsset)
	authed.PATCH("/assets/:id", need(authz.AssetUpdate), s.patchAsset)
	authed.DELETE("/assets/:id", need(authz.AssetDelete), s.deleteAsset)
	authed.POST("/assets/delete", need(authz.AssetDelete), s.deleteAssets)
	authed.GET("/assets/:id/transfers", s.listAssetTransfers)

	authed.GET("/categories/:id/import-template.csv", s.importTemplate)
	authed.POST("/import/preview", need(authz.AssetCreate), need(authz.Import), s.importPreview)
	authed.POST("/import/commit", need(authz.AssetCreate), need(authz.Import), s.importCommit)
	authed.GET("/export.csv", need(authz.Export), s.exportCSV)
	authed.GET("/rows", need(authz.Export), s.listRows)
	authed.GET("/capabilities", s.printingAvailable)
	authed.POST("/print", need(authz.Print), s.printAssets)
	authed.GET("/print/presets", s.printPresets)
	authed.GET("/print/jobs/:id", s.printJobStatus)

	authed.GET("/audit", need(authz.AuditRead), s.listAudit)
	authed.GET("/overview", s.overview)

	authed.POST("/transfers", need(authz.TransferCreate), s.createTransfer)
	authed.PATCH("/transfers/:id", need(authz.TransferUpdate), s.patchTransfer)

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
			FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyNotFound)
			return
		}
		if _, err := fs.Stat(s.webFS, strings.TrimPrefix(c.Request.URL.Path, "/")); err != nil {
			c.Request.URL.Path = "/"
		}
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}
