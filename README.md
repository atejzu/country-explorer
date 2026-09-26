# Country Explorer

Petrol programming assignment. Phase 1 provides runnable infrastructure and a
minimal Slovenian application shell. Country browsing, accounts and community
features are not implemented yet.

**Stack:** Java 21, Spring Boot 4.1.1, Maven Wrapper, PostgreSQL 17, Flyway,
Angular 22, Node.js 24.15.0, npm, Vitest and Docker Compose. Nginx serves the
production SPA and proxies `/api/*` to Spring Boot without changing the path.

```text
backend/       Spring MVC application, configuration, tests and Dockerfile
frontend/      Standalone, strict, zoneless Angular SPA and Nginx configuration
docs/          Original assignment
compose.yaml   Frontend, backend and PostgreSQL services
.env.example   Safe local configuration template
```

## Run locally

Prerequisites: Docker Engine/Desktop with Docker Compose and a running daemon.
Native Java and Node installations are not needed for the Compose runtime.

```sh
cp .env.example .env
# Adjust local database credentials in .env.
docker compose up --build
```

Open **http://localhost:8080**. Health: http://localhost:8081/actuator/health.
Only health is exposed by the backend in Phase 1; other backend requests receive
403. Actuator is not proxied through the frontend. PostgreSQL has no published
host port, and application/diagnostic ports bind to localhost.

`REST_COUNTRIES_API_KEY` will be required for later country functionality. Leave
it empty for Phase 1; this phase makes no REST Countries calls. `FRONTEND_ORIGIN`
and the REST Countries settings are reserved for later integration. No credentials
are passed into frontend builds. Keep `.env` private and untracked.

Flyway runs on startup with no application migrations yet. It creates only its
schema history table. The domain phase will introduce V1; Hibernate uses `validate`.
Security dependencies are present, CSRF remains enabled, and no login or generated
default account is provided. Session cookie settings are prepared for later use.

```sh
docker compose ps
docker compose logs -f backend
docker compose down       # Stop services; preserve database volume.
docker compose down -v    # Destructive reset: delete the database volume too.
```

## Development and tests

Prerequisites: Java 21, Node.js `>=24.15.0 <25`, npm and Docker for PostgreSQL tests.
`frontend/.nvmrc` pins Node 24.15.0; Maven Wrapper downloads Maven automatically.

```sh
cd backend
./mvnw verify             # Tests start their own PostgreSQL Testcontainer.
```

```sh
cd frontend
nvm use                  # If using nvm.
npm ci
npm run build
npm test -- --watch=false
npm start                # http://localhost:4200; /api/** proxies to localhost:8080.
```

To run the backend natively, first stop the full stack (port 8080 must be free).
From the repository root, run only PostgreSQL with a loopback port in one terminal:

```sh
docker compose down
docker compose run --rm --name country-explorer-postgres-dev \
  -p 127.0.0.1:5432:5432 postgres
```

In another terminal, from the repository root (the template is shell-compatible):

```sh
set -a
. ./.env
set +a
export DB_URL="jdbc:postgresql://localhost:5432/$POSTGRES_DB"
export DB_USERNAME="$POSTGRES_USER"
export DB_PASSWORD="$POSTGRES_PASSWORD"
cd backend
./mvnw spring-boot:run
```

This development database uses the same named volume as Compose. Stop it with
`docker stop country-explorer-postgres-dev` before returning to the full stack.
Backend tests use independent disposable containers and do not use this volume.
