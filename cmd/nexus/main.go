// Command nexus is the whole application: API, static frontend and the
// reconciliation subcommand, in one binary.
package main

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"os"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/httpapi"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
	"github.com/klskk23/nexus-assets/web"
)

type app struct {
	cfg     *config.Config
	db      *store.Store
	users   *auth.Store
	schema  *schema.Store
	holders *holder.Store
	assets  *asset.Service
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		log.Fatalf("nexus: %v", err)
	}
}

func run(args []string) error {
	ctx := context.Background()

	a, err := setup(ctx)
	if err != nil {
		return err
	}
	defer a.db.Close()

	if len(args) > 0 {
		switch args[0] {
		case "verify":
			return runVerify(ctx, a)
		default:
			return fmt.Errorf("unknown subcommand %q (known: verify)", args[0])
		}
	}
	return a.serve()
}

func setup(ctx context.Context) (*app, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	db, err := store.Open(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	if err := db.Migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	sch := schema.New(db)
	a := &app{
		cfg: cfg, db: db,
		users:   auth.NewStore(db),
		schema:  sch,
		holders: holder.New(db),
		assets:  asset.NewService(db, sch),
	}

	created, err := auth.Bootstrap(ctx, a.users, cfg.AdminEmail, cfg.AdminPassword)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("bootstrap admin: %w", err)
	}
	if created {
		log.Printf("created the initial admin account %s", cfg.AdminEmail)
	}
	return a, nil
}

func (a *app) serve() error {
	webFS, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		return fmt.Errorf("mount embedded frontend: %w", err)
	}
	issuer := auth.NewIssuer(a.cfg.JWTSecret, a.cfg.JWTTTL)
	srv := httpapi.NewServer(a.cfg, issuer, a.users, a.schema, a.holders, a.assets, webFS)

	log.Printf("listening on %s (database %s)", a.cfg.Addr, a.cfg.DBPath)
	return srv.Router().Run(a.cfg.Addr)
}
