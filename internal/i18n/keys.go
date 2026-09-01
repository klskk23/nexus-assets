package i18n

// Catalogue keys.
//
// Named after what the message is about rather than where it is raised, so a
// message that moves between packages keeps its key. Grouped by area; the
// prefix is what the parity test sorts on.
const (
	// Generic HTTP-layer messages.
	KeyValidationFailed  = "err.validation_failed"
	KeyVersionConflict   = "err.version_conflict"
	KeyNotFound          = "err.not_found"
	KeyInternal          = "err.internal"
	KeyUnauthenticated   = "err.unauthenticated"
	KeyBadRequest        = "err.bad_request"
	KeyLoginFailed       = "err.login_failed"
	KeyAccountDisabled   = "err.account_disabled"
	KeyDomainNotAllowed  = "err.domain_not_allowed"
	KeyOIDCDisabled      = "err.oidc_disabled"
	KeyOIDCStateMismatch = "err.oidc_state_mismatch"
	KeySessionExpired    = "err.session_expired"
	KeyPreferenceUnknown = "err.preference_unknown"
	// Yes and no as a reader sees them, for the tabular views that hand values
	// to something outside this system.
	KeyYes              = "value.yes"
	KeyNo               = "value.no"
	KeyRowsNeedCategory = "rows.category_required"
	// Printing. What the reader is told when a batch does not reach paper.
	KeyPrintNotConfigured   = "print.not_configured"
	KeyPrintNoPreset        = "print.no_preset"
	KeyPrintUnreachable     = "print.unreachable"
	KeyPrintPresetNotChosen = "print.preset_not_chosen"
	KeyConfigAPIKey         = "key.from_config"
	KeyConfigAPIKeyFixed    = "key.from_config_fixed"
	KeyKeyDaysRange         = "err.key_days_range"
	// Why a Google sign-in was refused. Each one is something the person or
	// their administrator can act on, so none of them may arrive as the
	// generic server failure.
	KeyOIDCEmailUnverified = "oidc.email_unverified"
	KeyOIDCNoEmail         = "oidc.no_email"
	KeyOIDCNoHostedDomain  = "oidc.no_hosted_domain"
	KeyOIDCHDNotAllowed    = "oidc.hd_not_allowed"
	KeyOIDCDomainRefused   = "oidc.domain_refused"
	KeyOIDCEmailMalformed  = "oidc.email_malformed"
	KeyOIDCExchangeFailed  = "oidc.exchange_failed"
	KeyUploadTooLarge      = "err.upload_too_large"
	KeyNotTailEvent        = "err.not_tail_event"
	KeyNoDefaultStock      = "err.no_default_stock"

	// Request shape.
	KeyVersionRequired   = "req.version_required"
	KeyParentIDShape     = "req.parent_id_shape"
	KeyCategoryIDShape   = "req.category_parent_id_shape"
	KeyTimeShapeRFC3339  = "req.time_rfc3339"
	KeyTimeShape         = "req.time_invalid"
	KeyImportNeedCat     = "req.import_needs_category"
	KeyImportNeedFile    = "req.import_needs_file"
	KeyStatusUnknown     = "req.status_unknown"
	KeyConfirmSN         = "req.confirm_sn"
	KeyConfirmSNMismatch = "req.confirm_sn_mismatch"
	KeyConfirmCount      = "req.confirm_count"
	KeyNoAssetsSelected  = "req.no_assets_selected"

	// Field validation.
	KeyFieldRequired    = "field.required"
	KeyFieldRuleInvalid = "field.rule_invalid"
	KeyFieldPatternHint = "field.pattern_hint"
	KeyFieldPattern     = "field.pattern"
	KeyFieldNotNumber   = "field.not_number"
	KeyFieldMin         = "field.min"
	KeyFieldMax         = "field.max"
	KeyFieldNotBool     = "field.not_bool"
	KeyFieldDateShape   = "field.date_shape"
	KeyFieldTypeUnknown = "field.type_unknown"
	// Configuration a field's own definition got wrong. These reach the
	// operator through the field editor, so they say what to change.
	KeyOptRegexInvalid   = "options.regex_invalid"
	KeyOptMinAboveMax    = "options.min_above_max"
	KeyOptPrecisionRange = "options.precision_range"
	KeyOptTemplateEmpty  = "options.template_empty"
	KeyFieldMACEmpty     = "field.mac_empty"
	KeyFieldMACInvalid   = "field.mac_invalid"
	KeyFieldIPInvalid    = "field.ip_invalid"
	KeyFieldURLInvalid   = "field.url_invalid"
	KeyFieldComputeFail  = "field.compute_failed"
	KeyFieldValueTaken   = "field.value_taken_by"
	KeyFieldValuesTaken  = "field.values_taken"

	// Statuses.
	KeyStatusKeyShape   = "status.key_shape"
	KeyStatusNeedsLabel = "status.needs_label"
	KeyStatusBadColor   = "status.bad_color"
	KeyStatusKeyTaken   = "status.key_taken"
	KeyStatusBuiltin    = "status.builtin"
	KeyStatusInUse      = "status.in_use"

	// Holder entities.
	KeyHolderDefaultStock      = "holder.default_stock_required"
	KeyDefaultStockNotLocation = "holder.default_stock_not_a_location"
	KeyHolderDefaultStockDel   = "holder.default_stock_delete"
	KeyHolderHasChildren       = "holder.has_children"
	KeyHolderNameEmpty         = "holder.name_empty"
	KeyHolderCycle             = "holder.cycle"
	KeyHolderTypeUnknown       = "holder.type_unknown"
	KeyHolderNoParentAllowed   = "holder.no_parent_allowed"
	KeyHolderParentMissing     = "holder.parent_missing"
	KeyHolderParentKind        = "holder.parent_kind"
	KeyHolderParentRequired    = "holder.parent_required"
	KeyHolderReferenced        = "holder.referenced"
	KeyHolderReferencedMore    = "holder.referenced_more"
	KeyHolderBlockerHold       = "holder.blocker_hold"
	KeyHolderBlockerRef        = "holder.blocker_ref"
	KeyHolderBlockerList       = "holder.blocker_list"
	KeyHolderBlockerPlain      = "holder.blocker_plain"
	KeyEntityCompany           = "holder.kind.company"
	KeyEntityDepartment        = "holder.kind.department"
	KeyEntityLocation          = "holder.kind.location"
	KeyJoinOr                  = "holder.join_or"
	KeyBlockerEntry            = "holder.blocker_entry"
	KeyListSeparator           = "common.list_separator"

	// Accounts.
	KeyUserStillOwns = "user.still_owns_assets"

	// Categories, fields, bindings.
	KeyCategoryHasAssetsMove = "category.has_assets_move"
	KeyCategoryHasChildren   = "category.has_children"
	KeyCategoryHasAssets     = "category.has_assets"
	KeyDisplayKeyUnbound     = "category.display_key_unbound"
	KeyDisplayKeyNotUnique   = "category.display_key_not_unique"
	KeyBindDuplicate         = "binding.duplicate"
	KeyDepMissing            = "binding.dep_missing"
	KeyDepUnbound            = "binding.dep_unbound"
	KeyDepNotRequired        = "binding.dep_not_required"
	KeyDepUnmet              = "binding.dep_unmet"
	KeyRefComputedKey        = "ref.computed_key"
	KeyRefDisplayKey         = "ref.display_key"
	KeyUnbindBlocked         = "binding.unbind_blocked"
	KeyFieldReferenced       = "field.referenced"
	KeyFieldInUseByAssets    = "field.in_use_by_assets"
	KeyListTruncated         = "common.list_truncated"
	// KeyPassthrough carries text that is already final -- an underlying
	// error whose wording this system does not own.
	KeyPassthrough         = "common.passthrough"
	KeyLabelWithKey        = "common.label_with_key"
	KeyProblemSeparator    = "common.problem_separator"
	KeyFieldInCategory     = "field.in_category"
	KeyTemplateUnparseable = "template.unparseable"
	KeyTemplateCycle       = "template.cycle"

	// Expressions (computed fields).
	KeyNamedProblem       = "expr.named_problem"
	KeyExprEmpty          = "expr.empty"
	KeyExprSyntax         = "expr.syntax"
	KeyExprNameOutright   = "expr.name_outright"
	KeyExprNoIteration    = "expr.no_iteration"
	KeyExprNoSuchFunc     = "expr.no_such_function"
	KeyExprNotReadable    = "expr.not_readable"
	KeyExprBuiltinBlocked = "expr.builtin_blocked"
	KeyExprNoValue        = "expr.no_value"
	KeyExprEmptyResult    = "expr.empty_result"
	KeyExprCycle          = "expr.cycle"
	KeyFnHexEmpty         = "fn.hex_empty"
	KeyFnNotHex           = "fn.not_hex"
	KeyFnNotDecimal       = "fn.not_decimal"
	KeyFnSliceRange       = "fn.slice_range"

	// Product models.
	KeyModelNoVendor  = "model.no_vendor"
	KeyModelDuplicate = "model.duplicate"
	KeyModelNeedsName = "model.needs_name"
	KeyModelInUse     = "model.in_use"

	// Import and export.
	KeyImportParseFailed  = "import.parse_failed"
	KeyImportNeedsHeaders = "import.needs_headers"
	KeyImportNoRows       = "import.no_rows"
	KeyImportRowsFailed   = "import.rows_failed"
	KeyImportModelAmbig   = "import.model_ambiguous"
	KeyImportModelMissing = "import.model_missing"
	KeyImportHolderEmpty  = "import.holder_empty"
	KeyImportHolderMiss   = "import.holder_missing"

	// CSV column headers, shared by the export and the import template.
	KeyColSN        = "csv.sn"
	KeyColCategory  = "csv.category"
	KeyColStatus    = "csv.status"
	KeyColHolder    = "csv.holder"
	KeyColOwner     = "csv.owner"
	KeyColCreatedAt = "csv.created_at"
	KeyColModel     = "csv.model"
	KeyColHolderLoc = "csv.holder_location"
	KeyColNote      = "csv.note"
	KeyColRequired  = "csv.required_suffix"
)
