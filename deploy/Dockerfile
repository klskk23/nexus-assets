# nexus-assets — the deployment image.
#
# Three stages, and the last one is empty. The frontend is built by node, the
# binary is built by go with the frontend embedded in it, and what ships is that
# one file on `scratch`: no shell, no package manager, no libc, nothing with a
# CVE feed of its own.
#
# The order matters: `web/embed.go` embeds `web/dist`, so the bundle has to
# exist before `go build` runs. A missing dist is not a build error either --
# `all:dist` would embed an empty tree and the image would serve a blank page --
# so the web stage asserts its own output.

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS web

WORKDIR /build/web

# Dependencies first, keyed on the lockfile alone, so editing a component does
# not re-run the install.
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npm run build && test -f dist/index.html

# ---------------------------------------------------------------------------
# Binary
# ---------------------------------------------------------------------------
FROM golang:1.26-bookworm AS build

WORKDIR /build

# Same trick, one layer earlier: the module cache survives a source edit.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=web /build/web/dist ./web/dist

# Stamped so /api/health can say what is deployed. Passed by the release
# workflow; "dev" is what a local build honestly is.
ARG VERSION=dev

# CGO_ENABLED=0 is not an optimisation here, it is the reason `scratch` works:
# the SQLite driver is modernc's pure-Go one, so the binary needs no libc and
# no dynamic loader. TARGETARCH comes from buildx and is already correct for
# the platform being built, native or emulated.
ARG TARGETOS=linux
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /nexus ./cmd/nexus

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM scratch AS runtime

# Runs as root, in a filesystem that holds one file. There is no shell to get
# to and nothing else to read; the trade is that a bind-mounted ./data works on
# any host without anybody chowning it first, which is the step people skip and
# then spend an evening on. To run unprivileged instead: add `USER 65532:65532`
# below and `chown -R 65532:65532 data` on the host.

# Two things a static binary still needs from the outside world: root
# certificates, for talking to Google's OIDC endpoints over TLS, and the
# timezone database, because labels and audit rows carry local times and a
# container is UTC unless told otherwise.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo

COPY --from=build /nexus /nexus

# Under /data, which is where the compose file mounts a directory. Left as
# environment rather than compiled in, so a different layout is a compose edit
# and not a rebuild.
ENV NEXUS_DB_PATH=/data/nexus.db \
    NEXUS_ADDR=0.0.0.0:8080 \
    TZ=Asia/Shanghai

VOLUME ["/data"]
EXPOSE 8080

# The binary checks itself: there is no curl in this image, and adding one
# would mean shipping a userland to run a GET. `healthcheck` answers before the
# database is opened, so it cannot become a second writer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/nexus", "healthcheck"]

# One process, PID 1, signals straight from docker.
ENTRYPOINT ["/nexus"]
