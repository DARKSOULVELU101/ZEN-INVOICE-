# Plan 003: Repair email delivery recovery and status integrity

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, report back instead of improvising.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 001 (deployment gate), Plan 002 (PDF runtime assets)
- **Category**: bug | email | security
- **Planned at**: commit `31692a4`

## Why this matters

Failed sends are currently unrecoverable because the failure outbox row stores no attachment bytes, while the retry worker skips rows without attachments. Separately, a bounce/complaint sets `FAILED` but retains `providerMessageId`; the retry worker treats that ID as proof of delivery and rewrites the invoice as `DELIVERED`. These are silent revenue/communication integrity failures.

## Current state

- `src/features/invoices/server/invoice-service.ts:1319-1355` writes failure rows without `attachmentData`.
- `src/features/invoices/server/invoice-service.ts:1393-1405` generates the PDF separately in the success path.
- `src/app/api/cron/retry-email/route.ts:70-88` reconciles any `providerMessageId` as delivered.
- `src/app/api/cron/retry-email/route.ts:91-94` skips rows with no attachment.
- `src/app/api/email-events/route.ts:66-70` keeps `providerMessageId` on bounce/complaint.
- `src/app/api/email-events/route.ts:47-56` checks duplicates outside the write transaction.
- `services/email-api/app.py:84` uses `idempotencyKey` only for Message-ID; no provider-side dedupe store exists.
- `src/app/api/cron/retry-email/route.ts:10-22` expects `x-cron-secret`; `vercel.json` has no cron schedule and Vercel Cron sends `Authorization: Bearer`.

## Scope

**In scope**: `src/features/invoices/server/invoice-service.ts`, `src/app/api/cron/retry-email/route.ts`, `src/app/api/email-events/route.ts`, `src/features/email/server/providers/*`, `services/email-api/app.py`, `prisma/schema.prisma`, new migration under `prisma/migrations/`, `vercel.json`, `package.json`, `tests/unit/invoice-email.test.ts`, new tests under `tests/unit/`.

**Out of scope**: changing providers away from SES, adding new email templates, changing invoice PDF content.

## Steps

### Step 1: Generate and persist the PDF once per send attempt

Refactor `sendInvoice()` so the PDF is generated after authorization and before provider selection/outbox writes. Reuse the same bytes for:

- the stored `InvoiceDocument` snapshot;
- the provider attachment;
- `EmailOutbox.attachmentData` on both success and failure paths.

**Verify**: `tests/unit/invoice-email.test.ts` plus a new service-level test prove the failure row has non-empty attachment bytes.

### Step 2: Make retry rows claimable

Add a migration that adds a unique constraint on `AuditLog.correlationId` where non-null and uses `EmailOutbox.lockedAt` (already present) with `FOR UPDATE SKIP LOCKED` or an atomic conditional claim. Reject duplicate webhook events inside the same transaction as the status update.

**Verify**: concurrency test with two simultaneous webhook deliveries creates one event/audit set.

### Step 3: Stop false delivery reconciliation

Only reconcile a `providerMessageId` as delivered when the outbox has no terminal failure event and no `emailLastError` bounce/complaint. Add an explicit `DELIVERY_FAILED` terminal state or use `lastError` plus event type; choose one and document it.

**Verify**: test where webhook sets bounce, then retry runs, asserts status remains failed and invoice delivery status is not overwritten.

### Step 4: Make retries idempotent at provider boundary

Persist provider idempotency results. The FastAPI bridge must store the `idempotencyKey → providerMessageId` mapping in a durable table and return the original message ID for duplicates before calling SES. Direct SES must use the same semantic key.

**Verify**: duplicate provider calls produce one SES send and the same provider message ID.

### Step 5: Add a dead-letter path

When `attempts >= limit`, mark the outbox row as `DEAD_LETTER` (or equivalent existing enum value if present) and write an `EMAIL_FAILED` invoice event with the reason. Do not silently skip rows.

**Verify**: test with `attempts = limit` asserts terminal state and event.

### Step 6: Configure Vercel Cron correctly

Add a schedule in `vercel.json` for `/api/cron/retry-email`. Accept the Vercel `Authorization: Bearer <CRON_SECRET>` header while preserving `x-cron-secret` for compatibility.

**Verify**: route tests accept both headers and reject missing/invalid tokens.

### Step 7: Add provider capability verification

Extend readiness and the bridge `/health` to verify SES send capability without printing secrets. Require HTTPS callback and API URLs.

**Verify**: plan 001 preflight passes only with a capable provider.

## Anti-collision analysis

- **Dependencies**: Plan 002 must land first so attachments render in production.
- **Upstream**: invoice send service is the only producer of invoice email outbox rows.
- **Downstream**: webhook, retry, invoice events, reports/dashboard delivery status.
- **Database**: new unique constraint and possible enum value require migration; no data deletion.
- **API**: webhook/cron contracts remain backward compatible.
- **UI**: no changes expected.
- **Reports**: only delivery-status displays change, never financial totals.
- **Email/PDF/Storage**: email reuse of stored PDF bytes reduces repeated generation.
- **Future refactoring**: single send-attempt record becomes the source of truth.

## Test plan

- Failed send with attachment persists bytes and retries successfully.
- Bounce/complaint is not overwritten by retry.
- Duplicate webhook events are idempotent under concurrency.
- Provider duplicate idempotency returns original message ID.
- Dead-letter path is observable.
- Cron auth accepts Vercel bearer header.

## Done criteria

- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm test` exits 0.
- [ ] `python -m py_compile app.py` exits 0 in `services/email-api`.
- [ ] Hosted send → SES delivery → SNS event → status update works.
- [ ] Failed send retries and delivers without user re-upload.
- [ ] No files outside scope modified.

## STOP conditions

- A fix would require replacing SES with another provider.
- Migration would delete or rewrite financial records.
- Provider idempotency cannot be made durable; stop and escalate.
