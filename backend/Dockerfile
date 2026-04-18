# ── Development image for Fastify backend ────────────────────────────────────
# Designed for use with docker-compose.yml (hot-reload via tsx watch)
# Production builds should use a multi-stage image with tsc output.

FROM node:20-alpine

# Install dependencies needed by Prisma's query engine binary
RUN apk add --no-cache openssl

WORKDIR /app

# Install deps first (layer-cached unless package files change)
COPY package*.json ./
RUN npm ci

# Copy Prisma schema so `prisma generate` can run during build
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the source
# (In development, the host directory is mounted over this via docker-compose volumes)
COPY . .

EXPOSE 3001

# Default dev command: run Prisma migrations, then start with hot-reload
# Overridden per-service in docker-compose.yml if needed
CMD ["npm", "run", "dev"]
