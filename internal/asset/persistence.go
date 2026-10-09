package asset

import (
	"context"
	"database/sql"
	"errors"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Persistence is scoped to one asset-only write transaction. It loads schema
// once, then caches fingerprints by the actual category/model pair, not per row.
// Callers must not change metadata in that transaction after creating it.
// Neither the transaction nor its snapshot can be supplied by a Prepared value.
type Persistence struct {
	service      *Service
	tx           *sql.Tx
	snapshot     *schema.SchemaSnapshot
	fingerprints map[schemaIdentity]string
}

type schemaIdentity struct {
	categoryID string
	modelID    string
	hasModel   bool
}

// BeginPersistence reads through tx, never through the read connection pool.
// The returned writer cannot be reused for a different transaction.
func (s *Service) BeginPersistence(ctx context.Context, tx *sql.Tx) (*Persistence, error) {
	snapshot, err := schema.LoadSchemaSnapshot(ctx, tx)
	if err != nil {
		return nil, err
	}
	return &Persistence{
		service: s, tx: tx, snapshot: snapshot,
		fingerprints: make(map[schemaIdentity]string),
	}, nil
}

// Check allows an importer to reject every stale row before writing its first
// asset. Persist retains the same guard so checking is not optional for safety.
func (p *Persistence) Check(prep Prepared) error {
	if prep.schemaFingerprint == "" {
		return ErrSchemaStale
	}
	key := schemaIdentity{categoryID: prep.Input.CategoryID, hasModel: prep.Input.ModelID != nil}
	if prep.Input.ModelID != nil {
		key.modelID = *prep.Input.ModelID
	}
	fingerprint, ok := p.fingerprints[key]
	if !ok {
		current, err := p.snapshot.AssetSchema(prep.Input.CategoryID, prep.Input.ModelID)
		if errors.Is(err, schema.ErrNotFound) {
			return ErrSchemaStale
		}
		if err != nil {
			return err
		}
		fingerprint = current.Fingerprint
		p.fingerprints[key] = fingerprint
	}
	if fingerprint != prep.schemaFingerprint {
		return ErrSchemaStale
	}
	return nil
}

// Persist writes only after the preparation has passed this transaction's guard.
func (p *Persistence) Persist(ctx context.Context, prep Prepared) (model.Asset, error) {
	if err := p.Check(prep); err != nil {
		return model.Asset{}, err
	}
	return p.service.persist(ctx, p.tx, prep)
}
