# payments_generator

Tool to generate payments data.

---

## Docker Setup

The `docker-compose.yml` provides a complete local development environment with two services:

| Service    | Image              | Port | Description                                |
| ---------- | ------------------ | ---- | ------------------------------------------ |
| `postgres` | postgres:16-alpine | 5432 | PostgreSQL database with persistent volume |
| `backend`  | (local build)      | 3001 | Fastify API with hot-reload via tsx        |

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) v2 (included with Docker Desktop)

### Quick start

```bash
# 1. Copy and review environment defaults (optional — defaults work out of the box)
cp .env.docker .env.docker.local   # never committed

# 2. Start the full stack
docker compose up

# Backend is now available at http://localhost:3001
# PostgreSQL is available at localhost:5432
```

Prisma migrations run automatically when the backend container starts.

### Environment variables

All defaults are defined in `.env.docker`. Override any value by editing that file or by exporting variables before running `docker compose up`.

| Variable            | Default                                                           | Description              |
| ------------------- | ----------------------------------------------------------------- | ------------------------ |
| `POSTGRES_USER`     | `payments`                                                        | DB superuser name        |
| `POSTGRES_PASSWORD` | `payments_secret`                                                 | DB superuser password    |
| `POSTGRES_DB`       | `payments_db`                                                     | Database name            |
| `DATABASE_URL`      | `postgresql://payments:payments_secret@postgres:5432/payments_db` | Prisma connection string |
| `PORT`              | `3001`                                                            | Fastify listen port      |
| `API_KEY`           | `dev-api-key-…`                                                   | Replace for non-dev use  |

### Stopping / cleaning up

```bash
# Stop containers (data persisted in postgres_data volume)
docker compose down

# Stop and remove persistent volume (full reset)
docker compose down -v
```

---

## GitHub Pages Deployment

The frontend is automatically deployed to GitHub Pages on every push to `main`.

**Live URL:** `https://MrHensonShort.github.io/payments_generator/`

### How it works

- Workflow: `.github/workflows/deploy.yml`
- Trigger: push to `main` branch
- Build: `npm ci` → `npm run build` → uploads `dist/` as a Pages artifact
- Deploy: `actions/deploy-pages@v4` publishes the artifact

### One-time repository setup

In the GitHub repository settings (`Settings → Pages`):

- **Source**: set to **GitHub Actions** (not a branch)

This is required once; after that every push to `main` triggers an automatic deploy.

### Routing

The app uses `HashRouter`, so all client-side routes work on GitHub Pages without any additional `404.html` redirect configuration.

---

## Frontend development

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run test       # Vitest unit tests
npm run e2e        # Playwright E2E tests
```
