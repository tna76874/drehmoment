# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:1.28-alpine

# --- build stage: Abhängigkeiten installieren und vite build ---
FROM ${NODE_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY . .
RUN npm run build

# --- test stage: Erkennungs- und PDF-Tests (make test) ---
FROM build AS test
RUN node test/detect.test.mjs && node test/pdf.test.mjs && node test/compat.test.mjs && node test/csv.test.mjs && node test/gridcards.test.mjs && node test/media.test.mjs && node test/scanlogic.test.mjs

# --- export stage: nur die statischen Dateien (make dist) ---
FROM scratch AS export
COPY --from=build /src/dist /

# --- runtime stage: statische Dateien per nginx ---
FROM ${NGINX_IMAGE} AS runtime
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
