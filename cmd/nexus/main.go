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
	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/httpapi"
	"github.com/klskk23/nexus-assets/internal/importer"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
	"github.com/klskk23/nexus-assets/internal/transfer"
	"github.com/klskk23/nexus-assets/web"
)

type app struct {
	cfg       *config.Config
	db        *store.Store
	users     *auth.Store
	schema    *schema.Store
	holders   *holder.Store
	assets    *asset.Service
	transfers *transfer.Service
	importer  *importer.Service
	audit     *audit.Store
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
		case "seed":
			n := 10000
			if len(args) > 1 {
				if _, err := fmt.Sscanf(args[1], "%d", &n); err != nil {
					return fmt.Errorf("seed count %q: %w", args[1], err)
				}
			}
			return runSeed(ctx, a, n)
		default:
			return fmt.Errorf("unknown subcommand %q (known: verify, seed)", args[0])
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
	// Runs once, after the schema is in place: the stored rules need a syntax
	// tree to be rewritten, which SQL has none of.
	if err := db.TranslateExpressions(ctx); err != nil {
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
	a.transfers = transfer.New(db, a.holders)
	a.importer = importer.New(db, sch, a.holders, a.users, a.assets)
	a.audit = audit.New(db)

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

	checker := auth.DomainChecker{Allowed: a.cfg.AllowedDomains, RequireHD: a.cfg.OIDCRequireHD}
	oidcFlow, err := auth.NewOIDC(context.Background(), a.cfg.OIDCIssuer,
		a.cfg.OIDCClientID, a.cfg.OIDCClientSecret, a.cfg.OIDCRedirectURL, checker)
	if err != nil {
		return fmt.Errorf("configure Google sign-in: %w", err)
	}
	if oidcFlow == nil {
		log.Print("Google sign-in is not configured; local accounts only")
	}

	sessions := auth.NewSessions(a.db, a.cfg.RefreshTTL)
	keys := auth.NewKeys(a.db)

	srv := httpapi.NewServer(a.cfg, issuer, a.users, a.schema, a.holders, a.assets,
		a.transfers, a.importer, a.audit, oidcFlow, sessions, keys, webFS)

	log.Printf("listening on %s (database %s)", a.cfg.Addr, a.cfg.DBPath)
	return srv.Router().Run(a.cfg.Addr)
}
