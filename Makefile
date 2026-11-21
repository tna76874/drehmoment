# Drehmoment – Build & Entwicklung
# Reguläre Targets laufen komplett in Docker (keine Host-Pakete nötig).
# Die *-local Targets nutzen node/npm direkt (z. B. im ai-pod Container).

DOCKER ?= $(shell command -v docker >/dev/null 2>&1 && echo docker || echo podman)
IMAGE  ?= drehmoment
TAG    ?= latest
PORT   ?= 8080
DEV_PORT ?= 5173
NODE_IMAGE ?= node:24-bookworm-slim

SVG_SRC      := public/icon.svg
FAVICON_SVG  := public/favicon.svg
ICON_192     := public/icon-192.png
ICON_512     := public/icon-512.png

.DEFAULT_GOAL := help
.PHONY: build dist run watch test clean help install dev build-local preview test-local e2e-local icons

## --- Docker (regulär) -------------------------------------------------

build: ## Docker-Image (nginx + statische Seite) bauen
	$(DOCKER) build --target runtime -t $(IMAGE):$(TAG) .

dist: ## Statische Dateien per Docker nach ./dist exportieren
	rm -rf dist
	$(DOCKER) build --target export --output type=local,dest=dist .

run: build ## Image bauen und auf http://localhost:$(PORT) starten
	$(DOCKER) run --rm -p $(PORT):80 $(IMAGE):$(TAG)

watch: ## Live-Vorschau mit Auto-Reload in Docker auf http://localhost:$(DEV_PORT)
	$(DOCKER) run --rm --init -p $(DEV_PORT):5173 -v "$(CURDIR)":/app:z -w /app $(NODE_IMAGE) \
		sh -c 'npm install --no-audit --no-fund && npx vite --host 0.0.0.0 --port 5173'

test: ## ALLE Tests (Unit + Browser) in Docker ausführen
	$(DOCKER) build --target build -t $(IMAGE)-test .

## --- Lokal (ohne Docker, z. B. im ai-pod) ----------------------------

node_modules: package.json
	npm install --no-audit --no-fund
	@touch node_modules

install: node_modules ## npm-Abhängigkeiten installieren

dev: node_modules ## Vite-Dev-Server starten
	npx vite --host 0.0.0.0 --port $(DEV_PORT)

build-local: node_modules ## Gesicherter Build: ./dist entsteht NUR, wenn alle Tests bestehen
	npm run build

preview: build-local ## Lokalen Build per vite preview ausliefern
	npx vite preview --host 0.0.0.0 --port $(PORT)

test-local: node_modules ## Alle Unit-Tests (test/*.test.mjs ohne e2e-*, automatisch gefunden)
	npm test

e2e-local: build-local ## Alles: Unit-Tests, Build, Browser-Tests (= build-local)

## --- Sonstiges --------------------------------------------------------

icons: $(FAVICON_SVG) $(ICON_192) $(ICON_512) ## Icons aus public/icon.svg neu generieren

$(FAVICON_SVG): $(SVG_SRC)
	cp "$(SVG_SRC)" "$(FAVICON_SVG)"

$(ICON_192): $(SVG_SRC)
	@if command -v rsvg-convert >/dev/null 2>&1; then \
		rsvg-convert -w 192 -h 192 "$(SVG_SRC)" -o "$(ICON_192)"; \
	elif command -v magick >/dev/null 2>&1; then \
		magick -background none -density 300 "$(SVG_SRC)" -resize 192x192! "$(ICON_192)"; \
	elif command -v convert >/dev/null 2>&1; then \
		convert -background none -density 300 "$(SVG_SRC)" -resize 192x192! "$(ICON_192)"; \
	elif command -v resvg >/dev/null 2>&1; then \
		resvg -w 192 -h 192 "$(SVG_SRC)" "$(ICON_192)"; \
	else \
		echo "Kein SVG-zu-PNG-Tool gefunden (rsvg-convert, magick, convert oder resvg installieren)." >&2; \
		exit 1; \
	fi

$(ICON_512): $(SVG_SRC)
	@if command -v rsvg-convert >/dev/null 2>&1; then \
		rsvg-convert -w 512 -h 512 "$(SVG_SRC)" -o "$(ICON_512)"; \
	elif command -v magick >/dev/null 2>&1; then \
		magick -background none -density 300 "$(SVG_SRC)" -resize 512x512! "$(ICON_512)"; \
	elif command -v convert >/dev/null 2>&1; then \
		convert -background none -density 300 "$(SVG_SRC)" -resize 512x512! "$(ICON_512)"; \
	elif command -v resvg >/dev/null 2>&1; then \
		resvg -w 512 -h 512 "$(SVG_SRC)" "$(ICON_512)"; \
	else \
		echo "Kein SVG-zu-PNG-Tool gefunden (rsvg-convert, magick, convert oder resvg installieren)." >&2; \
		exit 1; \
	fi

clean: ## Build-Artefakte entfernen
	rm -rf dist test/out

help: ## Targets anzeigen
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'
