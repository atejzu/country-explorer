# Country Explorer

Petrol programming assignment. Phase 2B implements the Slovenian country explorer:
search, region filtering, name/population sorting, country details and a Leaflet /
OpenStreetMap map. Explorer state is shareable through URL query parameters.
Accounts, favourites and community features are not implemented yet.

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
# Adjust local database credentials and set REST_COUNTRIES_API_KEY in .env.
docker compose up --build
```

Open **http://localhost:8080**. Health: http://localhost:8081/actuator/health.
Country GET endpoints and health are public; other backend requests remain
denied. Actuator is not proxied through the frontend. PostgreSQL has no published
host port, and application/diagnostic ports bind to localhost.

`REST_COUNTRIES_API_KEY` is required for country requests and is sent only by
the backend as a Bearer token to REST Countries v5. An empty key permits startup
and health checks; country requests return `503 COUNTRY_SERVICE_UNAVAILABLE`.
No credentials are passed into frontend builds. Keep `.env` private and untracked.
`FRONTEND_ORIGIN` remains reserved for later integration.

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

## Country frontend

`/` provides country cards and explicit loading, empty and retry states.
`/countries/:code` loads full details independently, with a country-specific 404.
Search updates the URL after 300 ms; navigation cancels stale requests. All country
data comes through Spring Boot. Maps use standard OpenStreetMap tiles; flags use
the image URLs provided by the API. No upstream key is needed for frontend tests.

## Country API

- `GET /api/v1/countries`: optional `search`, `region`, `sort=name|population`,
  `direction=asc|desc`; defaults to name ascending. Regions are Africa, Americas,
  Asia, Europe, Oceania and Antarctic (case-insensitive).
- `GET /api/v1/countries/{alpha3}`: country details; codes accept either case.

Names prefer Slovenian translations; search also matches canonical names.
Country data stays in memory: the complete projected catalogue and individual
country details have separate Caffeine caches with a default 24-hour TTL.
No country records or application entities are stored in PostgreSQL in this phase.
Errors use Problem Details with stable `code` values.

Backend configuration supports `REST_COUNTRIES_BASE_URL`,
`REST_COUNTRIES_CONNECT_TIMEOUT` (default `2s`), `REST_COUNTRIES_READ_TIMEOUT`
(default `5s`), `COUNTRY_CATALOG_TTL` / `COUNTRY_DETAILS_TTL` (default `24h`),
and `COUNTRY_DETAILS_MAXIMUM_SIZE` (default `300`). For Compose, optional overrides
beyond base URL/key must be passed into the backend service environment.

## Development and tests

Prerequisites: Java 21, Node.js `>=24.15.0 <25`, npm and Docker for PostgreSQL tests.
`frontend/.nvmrc` pins Node 24.15.0; Maven Wrapper downloads Maven automatically.

```sh
cd backend
./mvnw verify             # Local mock HTTP server + independent PostgreSQL Testcontainer.
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
Country integration tests use a local mock HTTP server; no API key, internet
connection or real REST Countries quota is required by the test suite once build
dependencies and the PostgreSQL image are available locally.
