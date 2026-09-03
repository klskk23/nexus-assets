// Package authz decides what an account is allowed to do.
//
// One idea, deliberately small: a permission answers "can this person do X",
// never "to which devices". Everything the ledger shows is readable by anyone
// who can sign in -- so no query anywhere narrows by who is asking, and the
// only thing a permission changes is whether a button works. That is what
// keeps this cheap enough to be correct.
//
// The one exception is the audit log, which is about people rather than about
// devices.
package authz

import "slices"

// Permission is one switch. The values are stored in the roles table, so they
// are part of the contract with any database already in the field: rename one
// and the role that carried it silently loses it.
type Permission string

const (
	AssetCreate Permission = "asset.create"
	AssetUpdate Permission = "asset.update"
	AssetDelete Permission = "asset.delete"

	TransferCreate Permission = "transfer.create"
	// TransferUpdate edits an event that already happened. Whoever can hand a
	// device over should not thereby be able to rewrite what happened last
	// month, which is why it is not part of TransferCreate.
	TransferUpdate Permission = "transfer.update"

	Print  Permission = "print"
	Import Permission = "import"
	Export Permission = "export"

	// SchemaManage covers categories, fields, their bindings -- and recompute,
	// which rewrites the numbers of every device in a subtree. Recompute is
	// not its own switch because whoever can edit the expression is already
	// deciding those numbers.
	SchemaManage Permission = "schema.manage"
	ModelManage  Permission = "model.manage"
	StatusManage Permission = "status.manage"

	// Holders are split three ways because the business keeps meeting new
	// customers: the people at the counter add them, and should not thereby be
	// able to rename or delete the ones already on file.
	HolderCreate Permission = "holder.create"
	HolderUpdate Permission = "holder.update"
	HolderDelete Permission = "holder.delete"
	// HolderDefaultStock decides where every unspecified check-in sends its
	// device. One wrong click sends months of returns to the wrong warehouse
	// and nobody notices at the time, so it is not part of HolderUpdate.
	HolderDefaultStock Permission = "holder.default_stock"

	UserManage Permission = "user.manage"
	AuditRead  Permission = "audit.read"
	RoleManage Permission = "role.manage"
)

// All is every permission, in the order the interface lists them.
var All = []Permission{
	AssetCreate, AssetUpdate, AssetDelete,
	TransferCreate, TransferUpdate,
	Print, Import, Export,
	SchemaManage, ModelManage, StatusManage,
	HolderCreate, HolderUpdate, HolderDelete, HolderDefaultStock,
	UserManage, AuditRead, RoleManage,
}

// Valid reports whether a stored string is still a permission this build
// knows. A role saved by a later version can carry one this build does not.
func Valid(p Permission) bool { return slices.Contains(All, p) }

// Set is what one account may do.
//
// admin is not "every switch ticked": it means everything, including
// permissions invented after the role was saved. A role of eighteen ticks
// would silently lack the nineteenth.
type Set struct {
	admin bool
	has   map[Permission]bool
}

// NewSet builds a set from what a role stores.
func NewSet(admin bool, list []Permission) Set {
	s := Set{admin: admin, has: make(map[Permission]bool, len(list))}
	for _, p := range list {
		s.has[p] = true
	}
	return s
}

// Admin reports whether this set is the unlimited one.
func (s Set) Admin() bool { return s.admin }

// Can reports whether the permission is held.
func (s Set) Can(p Permission) bool { return s.admin || s.has[p] }

// List renders the set for the interface, which uses it to disable buttons.
// An admin gets every permission spelled out: the page has no use for the
// distinction, and asking it to special-case "admin" would be one more place
// to get wrong.
func (s Set) List() []Permission {
	if s.admin {
		out := make([]Permission, len(All))
		copy(out, All)
		return out
	}
	out := []Permission{}
	for _, p := range All {
		if s.has[p] {
			out = append(out, p)
		}
	}
	return out
}
