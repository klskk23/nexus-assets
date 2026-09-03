// Package model holds the domain types shared across the application.
package model

import (
	"fmt"
	"strings"
	"time"
)

// AssetStatus is the lifecycle state of a physical device.
type AssetStatus string

const (
	StatusInStock  AssetStatus = "in_stock"
	StatusInUse    AssetStatus = "in_use"
	StatusInRepair AssetStatus = "in_repair"
	StatusLost     AssetStatus = "lost"
	StatusRetired  AssetStatus = "retired"
)

// BuiltinStatuses lists the statuses the rest of the system is written
// against, in display order.
//
// These five carry behaviour rather than only a name -- a transition matrix, a
// holder constraint, an exclusion from the category distribution, and the
// names of two transfer kinds. Administrators may add more, but not these:
// removing one would take a rule with it.
var BuiltinStatuses = []AssetStatus{
	StatusInStock, StatusInUse, StatusInRepair, StatusLost, StatusRetired,
}

// Builtin reports whether s is one of the five the code knows by name.
func (s AssetStatus) Builtin() bool {
	for _, v := range BuiltinStatuses {
		if v == s {
			return true
		}
	}
	return false
}

// Status is one entry in the status list.
//
// The three flags replace what used to be hardcoded checks against particular
// keys, so a status added at runtime can carry the same meanings.
type Status struct {
	Key   AssetStatus `json:"key"`
	Label string      `json:"label"`
	// Color names a slot in the palette rather than a value: a colour that
	// reads on white rarely reads on black, and the palette is defined once
	// per theme.
	Color   string `json:"color"`
	Sort    int    `json:"sort"`
	Builtin bool   `json:"builtin"`
	// CountsAsAvailable keeps it in the category distribution. "How many
	// routers do we have" means working ones.
	CountsAsAvailable bool `json:"counts_as_available"`
	// Terminal forbids moving out of it. A device that finished the write-off
	// process has usually been physically disposed of.
	Terminal  bool      `json:"terminal"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// HolderType distinguishes a user account from a holder entity.
type HolderType string

const (
	HolderTypeUser   HolderType = "user"
	HolderTypeEntity HolderType = "entity"
)

// EntityType is the kind of a holder entity. New kinds cost one enum value.
type EntityType string

const (
	EntityCompany    EntityType = "company"
	EntityLocation   EntityType = "location"
	EntityDepartment EntityType = "department"
)

// FieldType enumerates the eight supported custom field kinds.
type FieldType string

const (
	FieldText     FieldType = "text"
	FieldNumber   FieldType = "number"
	FieldBoolean  FieldType = "boolean"
	FieldDate     FieldType = "date"
	FieldMAC      FieldType = "mac"
	FieldIP       FieldType = "ip"
	FieldURL      FieldType = "url"
	FieldComputed FieldType = "computed"
)

// AllFieldTypes lists every supported field type.
var AllFieldTypes = []FieldType{
	FieldText, FieldNumber, FieldBoolean, FieldDate,
	FieldMAC, FieldIP, FieldURL, FieldComputed,
}

// Valid reports whether t is a known field type.
func (t FieldType) Valid() bool {
	for _, v := range AllFieldTypes {
		if v == t {
			return true
		}
	}
	return false
}

// TransferKind labels what a transfer event represents.
type TransferKind string

const (
	KindCreate       TransferKind = "create"
	KindCheckout     TransferKind = "checkout"
	KindCheckin      TransferKind = "checkin"
	KindTransfer     TransferKind = "transfer"
	KindReassign     TransferKind = "reassign"
	KindStatusChange TransferKind = "status_change"
)

// AuthType distinguishes how an account signs in.
type AuthType string

const (
	AuthOIDC  AuthType = "oidc"
	AuthLocal AuthType = "local"
)

// UserStatus is the account lifecycle state.
type UserStatus string

const (
	UserActive   UserStatus = "active"
	UserDisabled UserStatus = "disabled"
)

// Holder identifies whoever currently possesses an asset.
type Holder struct {
	Type HolderType `json:"type"`
	ID   string     `json:"id"`
	Name string     `json:"name,omitempty"`
	// EntityType is set only when Type is HolderTypeEntity.
	EntityType EntityType `json:"entity_type,omitempty"`
}

// Equal compares only the identity, ignoring denormalised display fields.
func (h Holder) Equal(other Holder) bool {
	return h.Type == other.Type && h.ID == other.ID
}

// User is an account.
type User struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	Name         string     `json:"name"`
	AuthType     AuthType   `json:"auth_type"`
	PasswordHash string     `json:"-"`
	OIDCSubject  string     `json:"-"`
	Status       UserStatus `json:"status"`
	// Role is the column 001 reserved and never enforced. Left alone: nothing
	// reads it, and deleting a column nobody reads is its own change.
	Role string `json:"-"`
	// RoleID is what this account may do, by way of a row in `roles`. Empty
	// means nothing is allowed -- a state the migration and every create path
	// avoid, because "unset means everything" turns one missed assignment into
	// an open door.
	RoleID       string `json:"role_id"`
	TokenVersion int    `json:"-"`
	// Lang and Theme are what this person chose for the interface; empty means
	// follow the system. They live on the account rather than in one browser,
	// because they are a property of the person and not of the machine.
	Lang      string    `json:"lang"`
	Theme     string    `json:"theme"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Category is a node in the classification tree.
type Category struct {
	ID       string  `json:"id"`
	Code     string  `json:"code"`
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
	Path     string  `json:"path"`
	// DisplayKey names the bound field whose value people read aloud. Empty
	// means the category has not nominated one, and assets fall back to
	// ShortID. It is deliberately not inherited from ancestors: a child
	// category is usually exactly where a different numbering rule belongs.
	DisplayKey string `json:"display_key"`
	// PrintPresetIDs names this category's labels in whatever print service
	// this deployment points at. A list because one device carries more than
	// one: a permanent number, and a location tag replaced whenever it moves.
	// Opaque here on purpose -- what a preset contains is that service's
	// vocabulary, and an installation with no printer should not carry a model
	// of one.
	PrintPresetIDs []string   `json:"print_preset_ids"`
	ArchivedAt     *time.Time `json:"archived_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// FieldDefinition is a globally registered information item.
//
// There is no archived state. An item nobody has filled in can be deleted
// outright; one that carries data cannot. The system decides which of the two
// applies, rather than asking an administrator to remember the difference
// between two similar-looking buttons.
type FieldDefinition struct {
	ID        string       `json:"id"`
	Key       string       `json:"key"`
	Label     string       `json:"label"`
	Type      FieldType    `json:"type"`
	Options   FieldOptions `json:"options"`
	IsUnique  bool         `json:"is_unique"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}

// FieldOptions carries per-type configuration. Which members matter is decided
// by the owning field's Type.
type FieldOptions struct {
	// text
	Regex     string `json:"regex,omitempty"`
	RegexHint string `json:"regex_hint,omitempty"`
	// number
	Min       *float64 `json:"min,omitempty"`
	Max       *float64 `json:"max,omitempty"`
	Precision *int     `json:"precision,omitempty"`
	Unit      string   `json:"unit,omitempty"`
	// computed
	Template string `json:"template,omitempty"`
}

// BoundField is a field definition together with its binding to one category.
type BoundField struct {
	FieldDefinition
	Required bool `json:"required"`
	Sort     int  `json:"sort"`
	// InheritedFrom names the ancestor category the binding comes from; it is
	// empty when the binding lives on the category being resolved.
	InheritedFrom string `json:"inherited_from,omitempty"`
}

// ProductModel groups devices of the same make.
//
// It belongs to any number of categories: one device can genuinely be both an
// SDWAN router and a spare, and forcing a choice between two correct answers
// only leads to the same model being entered twice.
type ProductModel struct {
	ID string `json:"id"`
	// CategoryIDs lists the categories whose entry forms offer this model. It
	// may be empty: a model can be prepared before it is placed anywhere.
	CategoryIDs []string `json:"category_ids"`
	Name        string   `json:"name"`
	// Vendor takes part in the duplicate-name check, so it is never null. An
	// empty vendor is a namespace of its own, not an exemption.
	Vendor       string         `json:"vendor"`
	ImageURL     string         `json:"image_url,omitempty"`
	AttrDefaults map[string]any `json:"attr_defaults"`
	ArchivedAt   *time.Time     `json:"archived_at,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

// HolderEntity is anything other than an account that can hold an asset.
type HolderEntity struct {
	ID   string     `json:"id"`
	Type EntityType `json:"type"`
	Name string     `json:"name"`
	// ParentID places the entity in the org: a department belongs to a
	// company, a location may sit under either or stand on its own. Null for a
	// company, and for the departments that predate the rule.
	ParentID *string `json:"parent_id"`
	// Note is whatever the operator needs to remember about this holder --
	// a floor and rack range, a contact, why it exists.
	Note           string         `json:"note"`
	IsDefaultStock bool           `json:"is_default_stock"`
	Attrs          map[string]any `json:"attrs"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// Asset is the ledger record of one physical device.
type Asset struct {
	ID string `json:"id"`
	// DisplayName is derived on read from the category's DisplayKey, never
	// stored. The UUID in ID is the only identity the database knows about.
	DisplayName string      `json:"display_name"`
	CategoryID  string      `json:"category_id"`
	ModelID     *string     `json:"model_id"`
	Status      AssetStatus `json:"status"`
	OwnerID     string      `json:"-"`
	Owner       *User       `json:"owner,omitempty"`
	Holder      Holder      `json:"holder"`
	// Home is where this device belongs when it is not out: the holder a
	// check-in returns it to, and who is answerable for it there. Null means
	// "no opinion" -- check-in then falls back to the global default stock
	// point, which is what every device did before homes existed.
	HomeHolder  *Holder        `json:"home_holder,omitempty"`
	HomeOwnerID *string        `json:"-"`
	HomeOwner   *User          `json:"home_owner,omitempty"`
	Attrs       map[string]any `json:"attrs"`
	// Note is a free sentence about this device, belonging to no category and
	// no scheme. Not the note on a transfer: that one explains a movement and
	// never changes, this one describes the device as it stands.
	Note string `json:"note"`
	// ArchivedAttrs holds keys that are no longer part of the category's
	// effective field set. They are kept, shown read-only, and never validated.
	ArchivedAttrs map[string]any `json:"archived_attrs,omitempty"`
	Version       int            `json:"version"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

// Transfer is the immutable record of one possession, ownership or status change.
type Transfer struct {
	ID         string       `json:"id"`
	AssetID    string       `json:"asset_id"`
	BatchID    *string      `json:"batch_id"`
	Kind       TransferKind `json:"kind"`
	FromStatus *AssetStatus `json:"from_status"`
	FromHolder *Holder      `json:"from_holder"`
	FromOwner  *string      `json:"from_owner_id"`
	ToStatus   AssetStatus  `json:"to_status"`
	ToHolder   Holder       `json:"to_holder"`
	ToOwner    string       `json:"to_owner_id"`
	Note       string       `json:"note,omitempty"`
	DueAt      *time.Time   `json:"due_at"`
	ActorID    string       `json:"-"`
	Actor      *User        `json:"actor,omitempty"`
	CreatedAt  time.Time    `json:"created_at"`
	EditedAt   *time.Time   `json:"edited_at"`
	EditedBy   *string      `json:"edited_by"`
	Original   string       `json:"-"`
}

// AssetState is the triple that drives transfer events.
type AssetState struct {
	Status  AssetStatus
	Holder  Holder
	OwnerID string
}

// ShortID is the fallback human-facing identifier: the first group of the UUID.
// Eight hex digits tell devices apart on a shelf and can be copied by hand,
// which the full UUID cannot.
func ShortID(id string) string {
	if i := strings.IndexByte(id, '-'); i > 0 {
		return id[:i]
	}
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// AssetDisplayName resolves what to show for one asset.
//
// A configured display key always has a value -- it must be unique, its
// dependencies are forced to be required, and a failed evaluation rolls the
// save back -- so the fallback only fires for a category that never nominated
// one. It still guards against an empty stored value rather than trusting that
// chain, because the cost of being wrong is a blank first column.
func AssetDisplayName(id string, attrs map[string]any, displayKey string) string {
	if displayKey != "" {
		if v, ok := attrs[displayKey]; ok && v != nil {
			if s := strings.TrimSpace(fmt.Sprintf("%v", v)); s != "" {
				return s
			}
		}
	}
	return ShortID(id)
}
