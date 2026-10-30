# Imagen de producción — Club Campestre | Sistema de Control de Ventas y Cobranza
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN useradd -m app && apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
RUN mkdir -p /app/storage && chown -R app /app/storage
USER app
EXPOSE 3000
# Aplica migraciones pendientes y arranca
CMD ["npm", "run", "start:prod"]
