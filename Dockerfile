# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:1.28-alpine

# --- build stage: Abhängigkeiten, Test-Werkzeuge und GESICHERTER Build ---
# npm run build = Unit-Tests -> vite build (Zwischenstand) -> Browser-/Druck-Tests -> erst dann dist/.
# Schlägt ein Test fehl, scheitert das Image – es gibt kein fertiges dist/ und kein Laufzeit-Image.
FROM ${NODE_IMAGE} AS build
WORKDIR /src
ENV DM_IN_DOCKER=1
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm run build

# --- test stage (Kompatibilität: make test) – identisch mit build, das schon alle Tests enthält ---
FROM build AS test

# --- export stage: nur die statischen Dateien (make dist) ---
FROM scratch AS export
COPY --from=build /src/dist /

# --- runtime stage: statische Dateien per nginx ---
FROM ${NGINX_IMAGE} AS runtime
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
