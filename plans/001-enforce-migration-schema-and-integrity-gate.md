# Plan 001: Enforce migration, schema parity, and integrity before deployment

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, report back instead of improvising.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: migration | security | deployment
- **Planned at**: commit `31692a4`

## Why this matters

`20260106000000_production_hardening` is applied, but deployment currently only checks for unfinished `_prisma_migrations` rows. It cannot detect a deployed build whose code expects a column that is absent, a failed backfill, a missing unique index, or corrupt relationships. A production-grade ERP must fail deployment when the database contract is not satisfied.

## Current state

- `vercel.json:2` runs `npm run preflight && npm run build`.
- `scripts/production-preflight.ts:3-10` exits non-zero when any readiness check fails.
- `src/lib/health/production-readiness.ts:39-55` checks only `finished_at IS NULL`.
- `scripts/dependency-audit.ts:7-57` checks 17 relationships and 5 invariants but is not wired into preflight.
- Hosted verification at commit `31692a4`: migrations up to date; all audit checks `0`.
- `src/app/api/health/route.ts:6-14` exposes readiness details publicly.

## Scope

**In scope**: `src/lib/health/production-readiness.ts`, `scripts/production-preflight.ts`, `scripts/dependency-audit.ts`, `scripts/production-schema-audit.ts` (new), `src/app/api/health/route.ts`, `vercel.json`, `package.json`, `tests/unit/production-readiness.test.ts` (new).

**Out of scope**: business logic changes, UI redesign, applying data fixes beyond schema/invariant checks.

## Steps

### Step 1: Add a database contract check

Create `scripts/production-schema-audit.ts` that queries `information_schema` / `pg_indexes` and verifies at minimum:

- `EmailOutbox.idempotencyKey` exists, is `NOT NULL`, and has a unique index.
- Invoice/customer/product unique indexes required by the domain exist.
- `Invoice.dueDate >= invoiceDate` CHECK exists in the database.
- All schema-declared foreign keys exist.
- No `_prisma_migrations` row has `finished_at IS NULL` or a non-empty `rolled_back_at`/error.
- The applied migration list contains `20260106000000_production_hardening`.

The script must print only safe names/status and exit non-zero on any failure.

**Verify**: `node scripts/run-with-vercel-env.cjs npx tsx scripts/production-schema-audit.ts` → `ok: true`, exit `0`.

### Step 2: Wire data integrity into preflight

Make `checkDatabaseIntegrity()` in `production-readiness.ts` execute the same queries as `scripts/dependency-audit.ts` through a shared module, not by duplicating SQL. Add it as a required check named `integrity`.

**Verify**: `npm run preflight` → includes `PASS integrity: ...` when hosted data is clean.

### Step 3: Add schema/parity check to readiness

Add `checkSchemaContract()` to `production-readiness.ts` and require it in `runProductionReadinessChecks()`. Keep `checkMigrations()` for pending migration detection.

**Verify**: `npm run preflight` → includes `PASS schema: Database contract is satisfied.`

### Step 4: Protect health details

Require `x-health-token` for `/api/health` when `HEALTH_CHECK_TOKEN` is set. Return a minimal `{ ok, score }` body for unauthenticated requests. Never return raw SQL errors or pending migration names publicly.

**Verify**: unauthenticated request returns only status/score; authenticated request returns full checks.

### Step 5: Enforce HTTPS and capability checks

In `checkEmail()` and `checkStorage()`, require `https:` URLs. For SES/S3, validate credentials or IAM role capability via an SDK call or a bridge `/health` endpoint that reports capability without secrets.

**Verify**: readiness fails for `http://` values and for configured-but-unusable providers.

### Step 6: Add regression tests

In `tests/unit/production-readiness.test.ts`, inject fake prisma/config dependencies and assert:

- pending migration → check fails;
- missing `idempotencyKey` → schema check fails;
- orphan row → integrity check fails;
- `http://` provider URL → check fails;
- demo `AUTH_MODE` → auth fails;
- all valid → `report.ok === true`, score `100`.

Use the existing Vitest style in `tests/unit/invoice-email.test.ts`.

**Verify**: `npm test` → all tests pass, including new ones.

### Step 7: Update deployment gate

Keep `vercel.json` build command as `npm run preflight && npm run build`. Optionally add `npm run check:schema` as a separate script, but do not remove preflight.

**Verify**: `npm run preflight` exits `0` only when all checks pass.

## Anti-collision analysis

- **Dependencies**: none; all checks are read-only.
- **Upstream**: no changes to data writes.
- **Downstream**: stricter deployments; invalid environments fail fast.
- **Database**: read-only metadata/invariant queries.
- **API/UI**: health response shape becomes safer.
- **Email/PDF/Storage**: no behavior change beyond gating.
- **Future refactoring**: shared SQL module prevents drift between preflight and audit.

## Test plan

- New unit tests with injected dependencies.
- Existing `npm run db:audit` remains the hosted data-integrity oracle.
- Verification: `npm test`, `npm run typecheck`, `npm run lint`, `npm run preflight`.

## Done criteria

- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm test` exits 0.
- [ ] `npm run preflight` exits 1 until auth/email/storage are configured, and exits 0 when fully configured.
- [ ] Hosted `npm run db:audit` reports `ok: true`.
- [ ] No files outside scope modified.

## STOP conditions

- Any verification command fails twice after a reasonable fix attempt.
- A schema check requires mutating production data.
- Health endpoint consumers require full details without authentication; escalate before changing the contract.
