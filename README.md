# Country Explorer

Petrol programming assignment. Phase 2B implements the Slovenian country explorer:
search, region filtering, name/population sorting, country details and a Leaflet /
OpenStreetMap map. Explorer state is shareable through URL query parameters.
Phase 3A adds backend accounts and session authentication. Angular authentication
UI, favourites and community features are not implemented yet.

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
Country GET endpoints, health and auth bootstrap/registration/login are public.
Current-user and logout require authentication; future backend routes remain denied.
Actuator is not proxied through the frontend. PostgreSQL has no published
host port, and application/diagnostic ports bind to localhost.

`REST_COUNTRIES_API_KEY` is required for country requests and is sent only by
the backend as a Bearer token to REST Countries v5. An empty key permits startup
and health checks; country requests return `503 COUNTRY_SERVICE_UNAVAILABLE`.
No credentials are passed into frontend builds. Keep `.env` private and untracked.
`FRONTEND_ORIGIN` remains reserved for later integration.

Flyway runs `V1__create_users.sql` on startup: the `users` table has UUID IDs,
UTC timestamps and case-insensitive unique username/email indexes. Hibernate uses
`validate`. Passwords use Spring Security's versioned delegating encoder with
`pbkdf2@SpringSecurity_v5_8` for new accounts. Passwords require 8–72 characters
without composition rules or an additional UTF-8 byte limit. No default account
is provided.

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

Common names use Slovenian native names or Java locale data, with canonical fallback.
Official names use Slovenian native names when available, otherwise canonical names.
Search matches both application display names and canonical names.
Country data stays in memory: the complete projected catalogue and individual
country details have separate Caffeine caches with a default 24-hour TTL.
Country records are not stored in PostgreSQL; user accounts are persisted there.
Errors use Problem Details with stable `code` values.

Backend configuration supports `REST_COUNTRIES_BASE_URL`,
`REST_COUNTRIES_CONNECT_TIMEOUT` (default `2s`), `REST_COUNTRIES_READ_TIMEOUT`
(default `5s`), `COUNTRY_CATALOG_TTL` / `COUNTRY_DETAILS_TTL` (default `24h`),
and `COUNTRY_DETAILS_MAXIMUM_SIZE` (default `300`). For Compose, optional overrides
beyond base URL/key must be passed into the backend service environment.

## Backend authentication

- `GET /api/v1/auth/csrf`: anonymous `204`, materializes the `XSRF-TOKEN` cookie.
- `POST /api/v1/auth/register`: username, email and password; `201` current-user
  DTO. Registration does not log in. Case-insensitive conflicts return stable `409`s,
  including concurrent inserts. Validation returns `400 VALIDATION_FAILED` with field errors.
- `POST /api/v1/auth/login`: JSON email/password; `200` with `{ "user": ... }`.
  Invalid credentials return the same `401 INVALID_CREDENTIALS` for unknown email
  and wrong password. Login runs inside the Spring Security filter chain.
- `GET /api/v1/users/me`: own account DTO, or `401 AUTHENTICATION_REQUIRED`.
- `POST /api/v1/auth/logout`: authenticated, session invalidation, `204`.

Authentication uses a server-side Spring Security HTTP session, with session ID
rotation at login and a 30-minute idle timeout. No JWT or browser storage token is
used. The session cookie is HttpOnly / SameSite=Lax; set `SESSION_COOKIE_SECURE=true`
for deployed HTTPS. Sessions are local to the single backend and do not survive restart.

All auth POSTs remain CSRF-protected. Bootstrap `/auth/csrf` before a mutation,
send the plain `XSRF-TOKEN` cookie value as `X-XSRF-TOKEN`, and bootstrap again after
login/logout. Only the XSRF cookie is JavaScript-readable. Spring Security's SPA
handling retains BREACH protection. Security errors use `application/problem+json`;
CSRF and authorization failures return `403 ACCESS_DENIED`. The same-origin proxy
requires no CORS configuration. Angular will wire this lifecycle in Phase 3B.

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
Auth tests cover real cookie/header CSRF, HTTP sessions, PostgreSQL uniqueness
races, and migration over both fresh schemas and empty Flyway history.
Country integration tests use a local mock HTTP server; no API key, internet
connection or real REST Countries quota is required by the test suite once build
dependencies and the PostgreSQL image are available locally.
