# Drehmoment – Build & Entwicklung
# Reguläre Targets laufen komplett in Docker (keine Host-Pakete nötig).
# Die *-local Targets nutzen node/npm direkt (z. B. im ai-pod Container).

DOCKER ?= $(shell command -v docker >/dev/null 2>&1 && echo docker || echo podman)
IMAGE  ?= drehmoment
TAG    ?= latest
PORT   ?= 8080
DEV_PORT ?= 5173
NODE_IMAGE ?= node:24-bookworm-slim

.DEFAULT_GOAL := help
.PHONY: build dist run watch test clean help install dev build-local preview test-local e2e-local

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

test: ## Tests (Erkennung + PDF) in Docker ausführen
	$(DOCKER) build --target test -t $(IMAGE)-test .

## --- Lokal (ohne Docker, z. B. im ai-pod) ----------------------------

node_modules: package.json
	npm install --no-audit --no-fund
	@touch node_modules

install: node_modules ## npm-Abhängigkeiten installieren

dev: node_modules ## Vite-Dev-Server starten
	npx vite --host 0.0.0.0 --port $(DEV_PORT)

build-local: node_modules ## Statische Seite lokal nach ./dist bauen
	npm run build

preview: build-local ## Lokalen Build per vite preview ausliefern
	npx vite preview --host 0.0.0.0 --port $(PORT)

test-local: node_modules ## Erkennungs-, PDF-, Kompatibilitäts-, Rasterkarten-, Bild- und Scanner-Tests
	node test/detect.test.mjs
	node test/pdf.test.mjs
	node test/compat.test.mjs
	node test/csv.test.mjs
	node test/gridcards.test.mjs
	node test/media.test.mjs
	node test/scanlogic.test.mjs

e2e-local: build-local ## Browser-Test (Playwright, simulierte Kamera)
	node test/e2e.test.mjs
	node test/e2e-media.test.mjs

## --- Sonstiges --------------------------------------------------------

clean: ## Build-Artefakte entfernen
	rm -rf dist test/out

help: ## Targets anzeigen
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'
