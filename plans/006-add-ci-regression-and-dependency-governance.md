# Plan 006: Add CI enforcement, regression protection, and dependency governance

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, report back instead of improvising.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 001-005 (tests should cover the fixed behavior)
- **Category**: tests | dx | dependencies | deployment
- **Planned at**: commit `31692a4`

## Why this matters

The current suite has 40 passing unit tests, but no CI workflow, E2E coverage, coverage thresholds, schema-drift tests, or tests for high-risk payment/report/email service paths. Dependency audit reports 13 vulnerabilities total, including 2 critical dev-toolchain issues and 6 high production issues. Without enforced gates, fixed defects can silently return.

## Current state

- `vitest.config.ts:5-8` includes only `tests/unit/**/*.test.ts`.
- No `.github/` directory exists.
- `package.json` scripts have no combined `verify` command.
- `npm test` → 9 files / 40 tests pass; `npm audit` → 13 vulnerabilities (2 critical, 7 high, 4 moderate).
- `npm audit --omit=dev` → 7 vulnerabilities (1 moderate, 6 high).
- No Playwright/E2E setup, no coverage provider, no Python test config.
- Existing tests cover totals/status/dates/PDF guards but not customer/product services, payment ledger, reports, webhook/cron, FastAPI bridge, or deployment gates.

## Scope

**In scope**: `.github/workflows/ci.yml` (new), `package.json`, `vitest.config.ts`, `tests/**`, `services/email-api/**` test config, `docs/**`, dependency lockfile updates only through reviewed upgrades.

**Out of scope**: new product features, major framework upgrades without a separate compatibility plan.

## Steps

### Step 1: Add a single verification script

Add `verify` that runs:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm audit --omit=dev --audit-level=high`

Fail on any error.

**Verify**: `npm run verify` exits 0 after dependency issues are resolved or explicitly waived.

### Step 2: Add GitHub Actions CI

Create `.github/workflows/ci.yml` that runs `npm ci`, `npm run verify`, and `python -m pytest` for `services/email-api` on pull requests and pushes to the working branch. Add Postgres service only if service tests require it; otherwise keep DB tests read-only against a disposable test DB.

**Verify**: workflow file parses and dry-run checks pass.

### Step 3: Add service-level regression tests

Add tests for:

- customer create → search → invoice selector option;
- product create → search → invoice autofill;
- invoice create → PDF bytes → storage key → signed URL;
- send → outbox → retry → delivery status;
- webhook delivery/bounce/duplicate;
- record payment → partial/full → balance/report totals;
- GST intrastate/interstate in invoice, PDF guard, and GST report;
- currency conversion in report/dashboard/payment ledger;
- search by exact invoice number;
- deployment readiness checks.

Follow existing Vitest style in `tests/unit/invoice-pdf.test.ts` and `tests/unit/invoice-email.test.ts`.

**Verify**: `npm test` exits 0 and test count increases.

### Step 4: Add E2E happy path with Playwright

Add Playwright with a seeded test tenant and cover:

`Create Customer → Create Product → Create Invoice → Preview PDF → Export PDF → Print → Send → Record Payment → Reports`.

Use a dedicated test database and mocked email provider at the network boundary only; do not mock domain logic.

**Verify**: `npm run test:e2e` exits 0.

### Step 5: Add coverage thresholds

Add `@vitest/coverage-v8`, a `coverage` script, and thresholds for critical domains: totals, status, money, conversion, invoice service, report service, readiness. Start at realistic thresholds and ratchet upward.

**Verify**: `npm run coverage` exits 0 and meets thresholds.

### Step 6: Upgrade vulnerable dependencies

Review and upgrade:

- `vitest` / `vite` / `tinypool` critical/dev issues;
- `zod`;
- `prisma` / `@prisma/config`;
- `next` / nested `postcss`.

Run full gates after each logical group. Do not use `npm audit fix --force` blindly.

**Verify**: `npm audit --omit=dev --audit-level=high` exits 0; full `npm audit` findings documented if dev-only waivers remain.

### Step 7: Add Python tests for the email bridge

Add `pytest` config and tests for token auth, PDF validation, SES send via injected client, SNS signature verification, topic allowlist, and idempotency mapping.

**Verify**: `python -m pytest services/email-api` exits 0.

## Anti-collision analysis

- **Dependencies**: depends on all functional fixes being merged first.
- **Upstream**: CI only reads code.
- **Downstream**: failed gates block merges/deploys.
- **Database**: E2E requires isolated test DB; never use production.
- **API/UI**: E2E may reveal needed selectors; do not change production code solely for brittle tests without architectural justification.
- **Email/PDF/Storage**: network boundaries can be mocked; domain logic cannot.
- **Reports**: tests must assert exact money values.
- **Future refactoring**: combined `verify` becomes the single quality contract.

## Test plan

- All new tests must fail before their corresponding fix and pass after.
- E2E uses isolated data and cleans up.
- CI must be required before merge.

## Done criteria

- [ ] `npm run verify` exits 0.
- [ ] CI workflow exists and runs on PR/push.
- [ ] `npm run test:e2e` exits 0 against a disposable DB.
- [ ] `npm run coverage` meets thresholds.
- [ ] `npm audit --omit=dev --audit-level=high` exits 0 or documented approved waiver exists.
- [ ] Python email bridge tests pass.
- [ ] No files outside scope modified.

## STOP conditions

- Upgrade requires a breaking major framework change.
- E2E cannot use an isolated database.
- Any new test requires production secrets; stop and redesign with injected fakes.
