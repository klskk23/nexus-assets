.PHONY: dev build test lint verify gates web-build clean

GO ?= go
BIN ?= nexus

# Settings come from .env; copy .env.example if it is missing.
dev: .env
	$(GO) run ./cmd/nexus

.env:
	@cp .env.example .env && chmod 600 .env
	@echo "created .env from .env.example — edit it before using this anywhere real"

web-build:
	cd web && npm ci && npm run build

build: web-build
	CGO_ENABLED=0 $(GO) build -o $(BIN) ./cmd/nexus

test:
	$(GO) test ./cmd/... ./internal/...
	cd web && npx vitest run

lint:
	test -z "$$(gofmt -l ./cmd ./internal ./migrations)" || (echo "gofmt: files need formatting" && gofmt -l ./cmd ./internal ./migrations && exit 1)
	$(GO) vet ./cmd/... ./internal/...
	golangci-lint run
	cd web && npx tsc --noEmit && npx eslint .

verify: build
	./$(BIN) verify

# Constitution merge gates 1-7
gates: lint test verify
	@echo "All merge gates passed"

clean:
	rm -f $(BIN) c.out
	rm -rf web/dist/assets web/dist/index.html
