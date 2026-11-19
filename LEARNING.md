# Learning the Phase 1 foundation

Read alongside the source. The aim is to know where a change belongs before adding the next module.

## 1. Configuration: fail early, share one client

**Files:** `src/config/env.ts`, `src/config/database.ts`, `prisma.config.ts`, `.env.example`, `tsconfig*.json`.

**Problem and purpose:** Environment variables are untyped strings. A misspelled URL or port should fail at startup rather than during a customer's request. Zod validates configuration once. `database.ts` creates one adapter-backed Prisma client that services share; creating clients inside handlers would create unnecessary connection pools.

**Why this approach:** Prisma 7 separates CLI configuration from runtime connections. `prisma.config.ts` tells migration/generation commands where the schema and database URL live; the runtime module maps the validated URL into the MySQL adapter. A five-connection pool is a small starting point, not a universal production setting. Strict TypeScript catches incompatible request/service/data shapes before execution. The separate build config emits application code without compiling test files into production.

**Interactions and request behavior:** `server.ts` validates configuration and connects before listening. Services import the shared client. Once a request arrives, the pool supplies a connection for the query; the handler never constructs credentials.

**Mistakes to avoid:** Committing `.env`, printing database errors with secrets, opening a new client per request, assuming a TypeScript type validates runtime strings, or silently dropping URL connection options. This implementation explicitly rejects URL query options; secure remote deployment needs explicit TLS configuration in the adapter.

**Before the next module:** Understand environment validation versus request validation, compile time versus runtime, and that a generated client does not create database tables.

## 2. Schema and migration: relations are database constraints

**Files:** `prisma/schema.prisma`, `prisma/migrations/*`, generated `src/generated/prisma/*`.

**Problem and purpose:** The database must prevent duplicate emails/slugs and stores with nonexistent owners. Exactly two models represent this phase. `ownerId` stores a User ID; `@relation(fields: [ownerId], references: [id])` creates its foreign-key constraint. `owner` and `stores` are Prisma navigation fields, not duplicate stored columns.

**Small example:** One User `u1` can own Store `s1` and Store `s2`, both with `ownerId = u1`. Store `s1` cannot belong to two owners because it has one required ownerId. A nonexistent owner ID fails at the database boundary. Restrict deletion prevents an accidental owner deletion while their stores remain.

**Why this approach:** CUSTOMER and DRAFT are safe defaults. Unique constraints already index email and slug. The owner index serves ownership queries; `(status, createdAt, id)` supports active lists and ordering. A second index on status alone would duplicate the composite index's leading column. TEXT allows descriptions and media URLs to exceed the default 191-character string width. CUIDs and `updatedAt` are managed by Prisma; raw SQL inserts must supply IDs and updatedAt themselves.

**Interactions and request behavior:** Prisma turns service filters into SQL over these tables. The initial migration records the actual SQL, including case-insensitive collation. Generate rebuilds TypeScript code; deploy applies saved migration SQL; migrate dev creates new migration history while checking for drift.

**Mistakes to avoid:** Editing an already applied migration, treating enums as authorization, creating redundant indexes, assuming a leading-wildcard name search is made fast by a normal name index, or running resets on valuable data.

**Before the next module:** Be able to explain one-to-many cardinality, uniqueness, foreign keys, nullability and how a migration differs from generated client code. The SQL has been prepared, not executed here.

## 3. Routes and validation: make raw input trustworthy

**Files:** `store.routes.ts`, `store.validation.ts`, `validate.middleware.ts`.

**Problem and purpose:** HTTP query inputs arrive as strings (or repeated values), not numbers. Routes declare GET endpoints and attach Zod checks before their controllers. Validation transforms valid strings to typed values and supplies defaults.

**Small example:** `?page=2&limit=5` becomes `{ page: 2, limit: 5 }`. `?page=0` returns 400 with a field-level error before any query runs. A limit of 101 also fails. A repeated page is rejected rather than guessed. Unknown query keys fail, which helps catch misspelled filters.

**Why this approach:** Digit validation avoids surprising coercions such as empty strings, exponent notation or booleans becoming valid pagination. A safe-integer check prevents offset precision loss. Slugs use a readable lowercase-and-hyphen format. Parsed values live in `res.locals`, because Express 5 exposes `req.query` as a getter. Request input and validated input stay distinct.

**Interactions and request behavior:** The route runs middleware, which calls `safeParse`; success stores parsed data and calls `next()`, while failure passes an AppError to the central handler. The controller runs only after successful validation.

**Mistakes to avoid:** Trusting `req.query as SomeType`, rewriting Express's query getter, putting SQL in routes, or forgetting route-parameter checks. A type assertion alone performs no runtime check.

**Before the next module:** Know what `next()` means and where raw strings become numbers. Understand why schema-inferred types keep validation and service inputs aligned.

## 4. Controllers and response envelopes: translate to HTTP

**Files:** `store.controller.ts`, `utils/api-response.ts`.

**Problem and purpose:** HTTP status codes and response formatting should be consistent without contaminating business/database logic. Controllers read validated values, await services and send JSON. The shared response helper supplies success/message/data and optional pagination metadata.

**Why this approach:** Two small controller functions are sufficient. There is no generic controller superclass, repository or injection container. Schema-derived input types document the middleware/controller handoff. The assertions at this boundary depend on validation actually being attached to every route.

**Interactions and request behavior:** `getStores` calls `listStores`, receives `{ data, meta }` and sends 200. `getStore` calls the detail service. Express 5 forwards any rejected async promise to error middleware.

**Mistakes to avoid:** Catching an error and sending 200 anyway, querying Prisma inside a controller, sending two responses, or returning database internals directly without considering field selection.

**Before the next module:** Distinguish HTTP concerns (status, JSON) from business rules (active visibility). Know why services do not accept Express Request or Response objects.

## 5. Store service: filters, pagination and visibility

**File:** `store.service.ts`.

**Problem and purpose:** Public lists and detail reads must never reveal inactive stores or owner secrets. The service owns those rules and the Prisma queries. It selects a fixed public Store field list and never includes the owner relation.

**Why this approach:** List and count share the exact same ACTIVE/keyword filter. `skip = (page - 1) * limit` and `take = limit` implement offset pagination. `createdAt DESC, id DESC` makes ties deterministic. A repeatable-read transaction gives rows and count one snapshot. A unique slug plus the ACTIVE predicate makes `findFirst` a single-resource lookup. An absent/inactive record becomes `AppError(404, 'STORE_NOT_FOUND', 'Store not found')`.

**Interactions and request behavior:** Prisma executes parameterized queries through the adapter. MySQL's case-insensitive column collation makes `fashion` match `Fashion`. LIKE wildcard characters are escaped so `%` and `_` in keywords are literal. The service computes totalPages, then returns plain results rather than HTTP responses.

**Small example:** 11 matches with a limit of 5 means `Math.ceil(11 / 5) = 3` pages. Zero matches means zero pages. Page 20 can legitimately return no rows while total remains 11.

**Mistakes to avoid:** Counting all stores while listing only active ones, filtering inactive rows after pagination, including the complete owner object, omitting the tie-breaker, or assuming snapshot consistency lasts across separate HTTP requests. Keyword search and pagination still need real-MySQL integration verification.

**Before the next module:** Be able to build a Prisma where/select/orderBy object, explain why count differs from the current array length, and identify which data is safe for public reads.

## 6. User service: allowlists protect sensitive fields

**Files:** `user.service.ts`, `user.types.ts`.

**Problem and purpose:** Other modules will eventually need to find users, but callers should never receive a password hash accidentally. Both lookup functions use the same explicit select. `PublicUser` is derived from that select, avoiding a separately maintained interface that could drift.

**Why this approach:** Internal functions return a safe user or null. A missing user is not automatically an HTTP error: the future caller decides what absence means. There are no user routes, controllers, hashing flows or authentication endpoints in Phase 1.

**Interactions and request behavior:** No current public API invokes these functions. A later service can await `findUserById(id)` or `findUserByEmail(email)`; Prisma requests only the selected columns. Tests verify the actual query allowlist as well as returned data.

**Mistakes to avoid:** Fetching full users and hoping JSON serialization removes passwordHash, treating a TypeScript `Omit` as runtime protection, or adding authentication behavior to a simple lookup.

**Before the next module:** Understand that TypeScript types disappear at runtime; database field selection is what prevents a secret from entering the result in the first place.

## 7. App, errors and lifecycle: complete the HTTP boundary

**Files:** `app.ts`, `server.ts`, `error.middleware.ts`, `not-found.middleware.ts`, `app-error.ts`.

**Problem and purpose:** Tests need an app without a listening production server. Every route also needs consistent failures, logs and shutdown behavior. `app.ts` composes logging, JSON parsing, health, routes, unmatched-route handling and final error middleware. `server.ts` owns database startup, listening and signal cleanup.

**Why this approach:** The order matters: routes must run before notFound, and error middleware must be last. Known AppErrors carry deliberate messages; malformed JSON and excessive body sizes get specific client errors. Unexpected exceptions receive a generic 500, even outside production, so secrets are never casually exposed. Logging is intentionally small and omits raw query strings and bodies.

**Interactions and request behavior:** A successful request triggers a finish log. An invalid input or failed lookup flows to error middleware. On shutdown the listener closes first, in-flight requests finish, and then Prisma disconnects. A ten-second deadline prevents an indefinite hang. Startup failure exits unsuccessfully without logging credentials.

**Mistakes to avoid:** Calling `listen` in the imported app module, registering notFound before routes, returning raw exception messages, disconnecting the database while active requests still need it, or treating liveness as a database readiness guarantee.

**Before the next module:** Know how middleware ordering changes behavior and how Express 5 propagates rejected async promises.

## 8. Tests: prove behavior without changing development data

**Files:** `tests/setup.ts`, `stores.test.ts`, `users.test.ts`, `vitest.config.ts`.

**Problem and purpose:** You need repeatable checks without a running MySQL server. The setup replaces the entire database module before the app/services import it. Supertest drives the Express app; Vitest controls Prisma return values and examines the generated query arguments.

**Why this approach:** Tests verify meaningful contracts: response status/body, defaults, offsets, ACTIVE predicates, consistent filters, safe selects and error behavior. The mock transaction resolves mocked query promises; it does not simulate MySQL isolation. Prisma delegates have relation-aware generic promises, so test mock typing narrows them at the mock boundary; application code retains real generated types.

**Interactions and request behavior:** An HTTP test follows the real routing/validation/controller/service chain, then stops at the replaced Prisma module. A service test calls the lookup directly. No migration or live database connection is possible through these mocked operations.

**Mistakes to avoid:** Assuming a mock proves SQL execution, making a test point to your development database, or testing inactive visibility only by checking the mock result. These tests also assert the ACTIVE predicate so a missing filter fails the suite.

**Before the next module:** Understand what each test proves and what needs a dedicated database integration test: migration application, collation, constraints and actual transaction behavior.

## Full execution flow: GET /api/v1/stores?page=2&limit=5

1. After environment validation and database connection, `server.ts` has started the listener. Express receives the request in `app.ts`. Logging attaches a completion callback; JSON parsing has no body to parse for this request.
2. Express matches `/api/v1/stores`, enters `storeRouter`, and matches its GET `/` route.
3. `validate(storeListSchema, 'query')` sees raw `{ page: '2', limit: '5' }`. Zod validates integer text, transforms it to `{ page: 2, limit: 5 }`, checks limits/offset safety and writes it to `res.locals.query`.
4. `getStores` passes the parsed object to `listStores`. The controller does not calculate pagination or construct SQL.
5. `listStores` builds `where = { status: 'ACTIVE' }`, computes `skip = (2 - 1) * 5 = 5`, and requests `take = 5`, a public field select, and ordering by createdAt then id descending.
6. Prisma starts a repeatable-read transaction through the MySQL adapter and executes row and count queries with the same filter. Conceptually the SQL is:

   ```sql
   SELECT id, name, slug, description, logoUrl, bannerUrl, status, createdAt, updatedAt
   FROM Store WHERE status = 'ACTIVE'
   ORDER BY createdAt DESC, id DESC LIMIT 5 OFFSET 5;
   SELECT COUNT(*) FROM Store WHERE status = 'ACTIVE';
   ```

   Prisma generates the actual SQL and handles parameter binding. MySQL returns the second five rows and total matching count from the transaction snapshot.
7. If the total is 12, the service returns the rows plus `{ page: 2, limit: 5, total: 12, totalPages: 3 }`.
8. The controller wraps that result in `{ success: true, message: 'Stores retrieved successfully', data: [...], meta: {...} }` and sends HTTP 200. Date objects become ISO strings during JSON serialization.
9. The response finishes and logging records method, path, status and duration. An invalid page would have stopped at step 3 with 400; an unexpected database failure at step 6 would reach the central 500 handler.

## Three small independent exercises

1. Add a test that requests a valid page beyond the final page. Mock an empty row array and a nonzero count, and assert that the response preserves total/totalPages.
2. Add an optional `sort=oldest` query value. Validate it and choose ascending createdAt/id ordering in the service. Keep the default descending and test both modes.
3. Add a test that a keyword longer than 191 characters receives a field-level 400 and makes no Prisma call.

## Suggested Phase 2 milestone

Design and implement authentication as its own bounded phase: registration, password hashing, login, a safe session/token design, and role-aware authorization. First decide the browser/session threat model, cookie strategy, token lifetime and error semantics. Keep public user responses explicitly selected and test authorization boundaries. Do not begin products, carts or payments until that milestone is reviewed. None of Phase 2 is implemented here.
