package main

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/klskk23/nexus-assets/internal/store"
	"github.com/klskk23/nexus-assets/migrations"
	"github.com/pressly/goose/v3"
)

// The fixture is genuinely pre-selection schema, not a new-schema API fixture
// relabeled as migrated data. Ordinary archived unique claims remain valid.
func TestVerifyReconcilesMigratedLegacyInheritance(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(filepath.Join(t.TempDir(), "legacy.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpToContext(ctx, db.WriteDBForTest(), ".", 23); err != nil {
		t.Fatal(err)
	}
	err = db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, query := range []string{
			`INSERT INTO categories(id,code,name,parent_id,path,display_key,created_at,updated_at) VALUES ('root','ROOT','Root',NULL,'/root/','tag','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),('child','CHILD','Child','root','/root/child/','tag','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),('leaf','LEAF','Leaf','child','/root/child/leaf/','tag','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
			`INSERT INTO field_definitions(id,key,label,type,options,is_unique,searchable,required,created_at,updated_at) VALUES ('field','tag','Tag','text','{}',1,0,0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
			`INSERT INTO category_fields(category_id,field_id,sort) VALUES('root','field',10)`,
			`INSERT INTO users(id,email,name,auth_type,password_hash,status,role,token_version,created_at,updated_at) VALUES('user','legacy@example.test','Legacy','local',NULL,'active','admin',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
			`INSERT INTO assets(id,category_id,model_id,status,owner_id,holder_type,holder_id,attrs,version,created_at,updated_at) VALUES('asset','leaf',NULL,'in_stock','user','user','user','{"tag":"CURRENT"}',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
			`INSERT INTO asset_unique_values(asset_id,field_key,value,scope_id,archived_at,created_at) VALUES('asset','tag','CURRENT','root',NULL,'2026-01-01T00:00:00Z'),('asset','tag','OLD','root','2026-01-01T00:00:00Z','2025-01-01T00:00:00Z')`,
			`INSERT INTO asset_search_values(asset_id,field_key,value) VALUES('asset','tag','CURRENT')`,
			`INSERT INTO asset_transfers(id,asset_id,kind,to_status,to_holder_type,to_holder_id,to_owner_id,note,actor_id,created_at) VALUES('event','asset','create','in_stock','user','user','user','','user','2026-01-01T00:00:00Z')`,
		} {
			if _, err := tx.ExecContext(ctx, query); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	a := &app{db: db}
	before := verifyDatabaseState(t, a)
	if err := runVerify(ctx, a); err != nil {
		t.Fatalf("migrated legacy claims: %v", err)
	}
	for table, want := range before {
		if got := verifyDatabaseState(t, a)[table]; got != want {
			t.Fatalf("verify changed %s", table)
		}
	}
	var selections int
	if err := db.ReadDB().QueryRow(`SELECT count(*) FROM category_field_selections WHERE field_id='field'`).Scan(&selections); err != nil {
		t.Fatal(err)
	}
	if selections != 2 {
		t.Fatalf("migrated selections=%d, want 2", selections)
	}
}
