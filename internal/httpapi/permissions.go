package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/i18n"
)

// need refuses the request unless the caller holds the permission.
//
// Written as middleware on the route rather than as a check inside each
// handler, so the mapping between "what this endpoint is" and "what it needs"
// can be read in one place -- the router -- instead of being spread over forty
// functions where a missing line looks like nothing at all.
func need(p authz.Permission) gin.HandlerFunc {
	return func(c *gin.Context) {
		if auth.Permissions(c).Can(p) {
			c.Next()
			return
		}
		forbid(c, p)
		c.Abort()
	}
}

// forbid answers a request that authenticated fine and is not allowed.
//
// 403, not 404: hiding the existence of an endpoint from somebody who is
// signed in buys nothing here -- the whole ledger is readable -- and turns
// "you need a permission" into "this is broken".
func forbid(c *gin.Context, p authz.Permission) {
	lang := LangOf(c)
	Fail(c, http.StatusForbidden, CodeForbidden,
		i18n.M(i18n.KeyForbidden, i18n.M(permissionKey(p)).In(lang)).In(lang), nil)
}

// permissionKey is the catalogue entry naming a permission the way the
// interface names it, so a refusal says "管理类别与字段" and not
// "schema.manage".
func permissionKey(p authz.Permission) string {
	if key, ok := permissionNames[p]; ok {
		return key
	}
	return i18n.KeyPermUnknown
}

var permissionNames = map[authz.Permission]string{
	authz.AssetCreate:        i18n.KeyPermAssetCreate,
	authz.AssetUpdate:        i18n.KeyPermAssetUpdate,
	authz.AssetDelete:        i18n.KeyPermAssetDelete,
	authz.TransferCreate:     i18n.KeyPermTransferCreate,
	authz.TransferUpdate:     i18n.KeyPermTransferUpdate,
	authz.Print:              i18n.KeyPermPrint,
	authz.Import:             i18n.KeyPermImport,
	authz.Export:             i18n.KeyPermExport,
	authz.SchemaManage:       i18n.KeyPermSchemaManage,
	authz.ModelManage:        i18n.KeyPermModelManage,
	authz.StatusManage:       i18n.KeyPermStatusManage,
	authz.HolderCreate:       i18n.KeyPermHolderCreate,
	authz.HolderUpdate:       i18n.KeyPermHolderUpdate,
	authz.HolderDelete:       i18n.KeyPermHolderDelete,
	authz.HolderDefaultStock: i18n.KeyPermHolderStock,
	authz.UserManage:         i18n.KeyPermUserManage,
	authz.AuditRead:          i18n.KeyPermAuditRead,
	authz.RoleManage:         i18n.KeyPermRoleManage,
}
