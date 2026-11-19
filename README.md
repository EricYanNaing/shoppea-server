# Shoppia — Phase 1 backend

A read-only multi-vendor marketplace foundation. Phase 1 contains exactly User and Store models, public ACTIVE-store reads, internal safe user lookups, and shared HTTP infrastructure. Authentication and marketplace write features are deliberately outside this phase. bcrypt is installed for a future phase but is not used.

## Stack and requirements

Node.js 24 LTS recommended (`nvm use`); Node 22.12+ LTS is also supported. npm, Express 5, strict TypeScript 5, Prisma 7 and its MariaDB adapter (supports MySQL), MySQL 8, Zod 4, dotenv 17, bcrypt 6, Vitest 4 and Supertest 7. Exact dependency versions are recorded in package.json and package-lock.json; commit the lockfile for reproducible installations.

## Structure

```text
shoppea-server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       ├── migration_lock.toml
│       └── 20261119000000_init/migration.sql
├── src/
│   ├── config/{env,database}.ts
│   ├── generated/prisma/                 # generated; ignored in Git
│   ├── modules/
│   │   ├── users/{user.service,user.types}.ts
│   │   └── stores/{store.routes,store.controller,store.service,store.validation}.ts
│   ├── middleware/{validate.middleware,error.middleware,not-found.middleware}.ts
│   ├── utils/{api-response,app-error}.ts
│   ├── app.ts
│   └── server.ts
├── tests/{setup,stores.test,users.test,database-config.test}.ts
├── .env.example
├── .gitignore
├── .nvmrc
├── package.json
├── package-lock.json
├── prisma.config.ts
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── LEARNING.md
└── README.md
```

Additional files have specific jobs: Prisma 7 reads its CLI connection from `prisma.config.ts` and emits a typed client under `src/generated/prisma`; migrations record database changes; the lockfile fixes dependency versions; `.nvmrc` selects Node 24; `tsconfig.build.json` keeps tests out of production output; `vitest.config.ts` installs the database mock before tests; `LEARNING.md` explains the code. Generated client files are rebuilt rather than maintained by hand.

## Install and configure

From the existing workspace:

```sh
cd shoppea-server
nvm use
npm ci
cp .env.example .env
```

Edit `.env` with your own development connection. The example contains placeholders, not usable credentials. Never commit `.env`.

| Variable | Meaning | Default |
| --- | --- | --- |
| PORT | HTTP port, integer 1–65535 | 3000 |
| NODE_ENV | development, test, production | development |
| DATABASE_URL | mysql://USER:PASSWORD@HOST:3306/DATABASE | required |

Percent-encode special characters in usernames/passwords (`@` becomes `%40`). For TiDB Cloud, select the `test` database and copy the Prisma connection URL into `.env`, keeping `?sslaccept=strict`. Remote connections require this option. The runtime adapter enables TLS and verifies the server certificate; the Prisma CLI reads the same option from the URL. Local loopback connections may omit TLS. Unknown or duplicate options and URL fragments are rejected rather than silently discarded. The service validates configuration at startup; Prisma CLI loads `.env` separately. Client generation and schema validation do not require a live MySQL connection. Migration commands do.

## MySQL and migrations

Use a **new dedicated development database**, not an existing production schema. In a local MySQL 8 administrator session, create your database:

```sql
CREATE DATABASE shoppia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Provision your own development user/password and grant access only to this database. Development migration creation (`migrate dev`) additionally needs a shadow database and permission to create it, or an explicitly configured separate shadow database. Never point the shadow database at your actual database.

The initial migration SQL is included but was **not applied** during implementation because no development MySQL connection was supplied. It creates only User and Store tables and their constraints; it explicitly selects `utf8mb4_unicode_ci` so name searches are case-insensitive. Inspect this file before applying it.

To apply the existing migration to your new database without a shadow database:

```sh
npm run prisma:generate
npm run prisma:validate
npm run prisma:deploy
```

For subsequent local schema changes:

```sh
npm run prisma:migrate -- --name describe_your_change
npm run prisma:generate
```

`migrate dev` is for development only and can request a reset when it detects drift. Do not approve a reset of a database containing valuable data. Production uses reviewed migrations via `prisma:deploy`. No migration command runs as part of tests, build, or server startup.

There is no seed or store creation endpoint. An empty database correctly returns an empty store list. To explore detail responses, add a development User and ACTIVE Store manually using your database tool, satisfying the owner foreign key. Do not store real passwords or invent an authentication flow for this exercise.

## Commands

```sh
npm run dev              # reload on changes; connects before listening
npm run typecheck       # app, tests and configuration
npm test                # isolated mocked database; no MySQL required
npm run test:watch
npm run build           # regenerate Prisma client and compile src to dist
npm start               # run compiled server; requires configured MySQL
```

Generate the client once before first testing or type checking (`npm run prisma:generate`). The server refuses to listen when MySQL cannot be reached. `/health` is a liveness endpoint, not an ongoing database readiness check. SIGINT/SIGTERM stop new HTTP connections, drain requests, disconnect Prisma, and enforce a ten-second shutdown deadline.

## API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | /health | process liveness |
| GET | /api/v1/stores | paginated ACTIVE stores |
| GET | /api/v1/stores/:slug | one ACTIVE store or STORE_NOT_FOUND |

No public user endpoints or store writes exist. All other routes return 404.

```sh
curl 'http://localhost:3000/health'
curl 'http://localhost:3000/api/v1/stores?page=2&limit=5&keyword=fashion'
curl 'http://localhost:3000/api/v1/stores/my-fashion-shop'
```

Health response (200):

```json
{"success":true,"message":"Server is running","data":{"status":"ok"}}
```

List response for no matches (200):

```json
{"success":true,"message":"Stores retrieved successfully","data":[],"meta":{"page":1,"limit":10,"total":0,"totalPages":0}}
```

A successful detail response (200) uses `message: "Store retrieved successfully"` and a single Store object as `data`. Public Store objects contain id, name, slug, description, logoUrl, bannerUrl, status, createdAt and updatedAt; no owner relation, email, ownerId or password hash is returned. Dates serialize as ISO strings.

Missing, DRAFT, or SUSPENDED detail response (404):

```json
{"success":false,"message":"Store not found","error":{"code":"STORE_NOT_FOUND"}}
```

Validation error for `page=0` (400; exact Zod wording may vary):

```json
{"success":false,"message":"Invalid request input","error":{"code":"VALIDATION_ERROR","details":[{"field":"page","message":"Must be a positive integer"}]}}
```

Page defaults to 1. Limit defaults to 10, maximum 100. Decimal, zero, negative, duplicate, unknown, and unsafe-offset query values are rejected. Keyword is optional, trimmed, at most 191 characters; whitespace-only input means no search. SQL LIKE wildcards are escaped for literal keyword matching. Slugs contain lowercase letters/numbers separated by single hyphens, maximum 191 characters. Store ordering is `createdAt DESC, id DESC`. Pages beyond the end return an empty array with the real total. Offset pagination can shift between separate requests if records change; deterministic ordering resolves ties, not concurrent inserts.

## Database and architecture

A User has a unique email, a private passwordHash, a CUSTOMER/MERCHANT/ADMIN role (default CUSTOMER), and timestamps. A Store has a unique slug, descriptive/media fields, status (default DRAFT), timestamps and a required ownerId. Each Store points to one User; `User.stores` describes the inverse collection without creating an extra database column. `ownerId` is the actual foreign key. Restrict deletion prevents deleting an owner while stores reference them. A role alone does not enforce ownership authorization; that belongs to a future phase.

The ownerId index supports ownership lookups. The composite `(status, createdAt, id)` index supports ACTIVE filtering and deterministic list order; its leftmost prefix covers status lookups, so a separate status index is redundant. Unique email and slug constraints already provide indexes. A contains search uses LIKE with a leading wildcard and generally cannot use a normal name index efficiently; revisit search infrastructure when real data warrants it.

Requests follow **Route → Zod validation → Controller → Service → Prisma → MySQL**. Controllers translate to HTTP; services perform database work and resource rules. There are no repositories or dependency-injection containers. A repeatable-read transaction runs the row and count queries against one consistent snapshot. User lookups use an explicit allowlist of fields. Prisma 7 uses a shared adapter-backed client; no connection is created per request.

Express 5 forwards rejected async handler promises to centralized error middleware. Known application errors get intentional status/code/message values. Unexpected errors return a generic 500; internal messages and stacks never enter responses. Logging records method/path/status/duration without query strings, bodies or credentials. Logs intentionally omit raw database error objects; a later observability layer can add structured, redacted diagnostics.

## Testing and limits

Tests use Vitest and Supertest with a mocked database module; no development database is opened or modified. They verify HTTP responses, pagination math, matching count filters, stable sorting, ACTIVE-only query predicates, slug validation, missing/inactive responses, user lookups and password exclusion. They also cover malformed JSON, unsupported routes and safe unexpected errors.

Mocks verify our query construction and HTTP behavior. They cannot prove MySQL collation, actual foreign-key enforcement, migration execution, connection lifecycle or index performance. Add dedicated MySQL integration tests later using an isolated test database. Verification during implementation (2026-11-19):

- `npm run prisma:generate`: passed (Prisma 7.10.1).
- `npm run prisma:validate`: passed.
- `npm run typecheck`: passed.
- `npm test`: 46 tests passed across 3 files, including strict TLS connection configuration checks. Supertest required local listener access outside the restricted execution environment; database operations stayed mocked.
- `npm run build`: passed.
- `npm audit`: zero known vulnerabilities after upgrading Vitest to 4.1.12.
- `npm ci --dry-run --ignore-scripts --no-audit`: passed against the finalized lockfile. This validates installation planning; it is not a fresh installation execution.
- MySQL migration, live queries, and live shutdown: not exercised; no connection supplied.

## Learn next

Read [LEARNING.md](LEARNING.md) for the file-by-file guide, complete page-2 execution flow, common mistakes, three exercises and the suggested Phase 2 milestone.

Sources: [Prisma 7 MySQL setup](https://www.prisma.io/docs/v7/prisma-orm/add-to-existing-project/mysql), [Prisma case sensitivity](https://docs.prisma.io/docs/orm/v6/prisma-client/queries/case-sensitivity).
