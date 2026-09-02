# nexus-assets

*中文版：[`README.md`](./README.md)*

An internal asset ledger: devices, categories and fields, statuses and
transfers, CSV import/export, and a change audit. Point it at
[zenith-printer](./docs/zenith-printer.en.md) and ticking a few devices prints
their labels.

**The whole deployment artefact is one file**: a static Go binary with the
frontend and the database migrations compiled into it, and a SQLite file beside
it for data. No Redis, no second process, no external database.

## Running it

### Option 1: Docker Compose (recommended)

```bash
cd deploy
cp ../.env.example .env && chmod 600 .env   # at minimum, set NEXUS_JWT_SECRET
docker compose up -d
```

Open <http://localhost:8080>. The image is published for amd64 and arm64 alike;
`docker pull ghcr.io/klskk23/nexus-assets:latest` fetches the right one.

State lives in `deploy/data/` — a host directory, not a named volume — so moving
to another machine is `rsync -a data/`. For a permanent install, put it
somewhere real:

```bash
NEXUS_DATA=/srv/nexus-assets/data docker compose up -d
```

> **SQLite has to be on a local filesystem.** NFS and SMB have unreliable locks
> and will corrupt the database rather than refuse to try.

### Option 2: a single file

Download one or build one; both give you the same thing.

```bash
# Download (linux amd64 / arm64 on the releases page)
curl -fLO https://github.com/klskk23/nexus-assets/releases/latest/download/nexus_linux_amd64
chmod +x nexus_linux_amd64

# Or build it: frontend first, then Go — the bundle is embedded in the binary,
# so that order is not optional
make build     # cd web && npm ci && npm run build, then CGO_ENABLED=0 go build
```

Run it:

```bash
export NEXUS_JWT_SECRET="$(openssl rand -base64 36)"
export NEXUS_ADMIN_EMAIL=you@yourcompany.com
export NEXUS_ADMIN_PASSWORD='used once, to create the first admin'
export NEXUS_ALLOWED_EMAIL_DOMAINS=yourcompany.com
./nexus
```

As a service (`/etc/systemd/system/nexus-assets.service`):

```ini
[Unit]
Description=nexus-assets
After=network.target

[Service]
User=nexus
WorkingDirectory=/srv/nexus-assets
EnvironmentFile=/srv/nexus-assets/.env
Environment=NEXUS_DB_PATH=/srv/nexus-assets/nexus.db
ExecStart=/srv/nexus-assets/nexus
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod 600 /srv/nexus-assets/.env      # it holds the signing key
sudo systemctl enable --now nexus-assets
```

Upgrading is replacing that one file and `systemctl restart`. Migrations run
themselves on the way up.

### Option 3: development

```bash
make dev       # writes .env from .env.example the first time
cd web && npm run dev    # a second terminal, for frontend hot reload
```

## The four settings you must provide

| Variable | Why |
| --- | --- |
| `NEXUS_JWT_SECRET` | Signs sessions. **The process refuses to start without it** — a generated key would change on every restart, silently signing everyone out, and cost an hour to diagnose |
| `NEXUS_ADMIN_EMAIL` / `NEXUS_ADMIN_PASSWORD` | The admin created on first start; once that account exists these do nothing |
| `NEXUS_ALLOWED_EMAIL_DOMAINS` | Which email domains may sign in. **This is the only admission boundary in v1** — anyone who gets in can do anything |

Everything else — database path, listen address, Google sign-in, the print
service, API keys — is in [`.env.example`](./.env.example), each with a note
about what it does.

`.env` is not committed (`.gitignore` covers it) and never enters an image
layer.

**The file is optional.** The process reads the environment; a `.env` is folded
in underneath it and **anything already set wins**. So `docker run -e …`,
systemd's `Environment=`, or secrets injected by an orchestrator replace it
entirely — the compose file marks its `env_file` `required: false`, so it
starts with no such file at all.

## Behind a reverse proxy

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

With Google sign-in, `NEXUS_OIDC_REDIRECT_URL` must be the **public** address
(`https://your-host/api/auth/oidc/callback`) and must match what is registered
in the Google Cloud console exactly — a trailing slash is a mismatch.

## Backups

One file, and no need to stop the service:

```bash
sqlite3 nexus.db "VACUUM INTO '/backup/nexus-$(date +%F).db'"
```

Do not `cp` a live database: the `-wal` file may still hold committed
transactions.

## Health

`GET /api/health` needs no credential and answers whether the process can still
read its own database — rather than whether the port is open, which is the
check a wedged deployment passes. Inside the container the check is the binary
itself: `nexus healthcheck`.

## Development

```bash
make gates     # lint, tests and reconciliation; all green before merging
make test
make lint
```

- Project conventions and the rules most easily broken: [`CLAUDE.md`](./CLAUDE.md)
- Design baselines and past decisions: [`docs/`](./docs)
- Specs and the API contract: [`specs/`](./specs) (`001-.../contracts/openapi.yaml` is the full endpoint list)
- Label printing: [`docs/zenith-printer.en.md`](./docs/zenith-printer.en.md)
