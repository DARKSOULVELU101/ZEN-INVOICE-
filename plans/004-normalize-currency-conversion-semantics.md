# Plan 004: Normalize currency conversion semantics across invoices, payments, and reports

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, report back instead of improvising.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: correctness | money | migration
- **Planned at**: commit `31692a4`

## Why this matters

Exchange rates are persisted as base → document currency (`src/features/invoices/server/invoice-service.ts:753-760`) but reports and payments multiply by that rate as if it were document → base (`src/features/reports/server/report-service.ts:59-65`, `143-153`). For a USD invoice from an INR base, stored `0.012` makes a `$100` invoice report as `₹1.20` instead of `₹8,333.30`. This corrupts revenue, tax, outstanding, dashboard, payment ledger, and repair tooling.

## Current state

- `seed.ts:165-173` seeds `INR → USD = 0.012` and `USD → INR = 83.3333`.
- `invoice-service.ts:463-493` resolves `from → to` rates by date.
- `invoice-service.ts:754-760` calls it with base currency as `from` and invoice currency as `to`.
- `report-service.ts:59-65` multiplies stored document amounts by `exchangeRate`.
- `invoice-service.ts:1834-1852` and `prisma/repair-payment-ledger.ts:45-47` do the same.
- Reports filter by current organization currency (`report-service.ts:217-232`), so historical base-currency changes hide invoices.
- `tests/unit/totals.test.ts` covers GST math but not conversion direction.

## Scope

**In scope**: `prisma/schema.prisma`, new migration under `prisma/migrations/`, `src/features/invoices/server/invoice-service.ts`, `src/features/reports/server/report-service.ts`, `src/features/invoices/schemas/invoice.ts`, `src/features/invoices/components/shared/invoice-form.tsx`, `src/features/invoices/server/form-options.ts`, `prisma/repair-payment-ledger.ts`, `prisma/seed.ts`, `tests/unit/currency-conversion.test.ts` (new), `tests/unit/totals.test.ts`.

**Out of scope**: adding new currencies, changing GST math, UI redesign.

## Steps

### Step 1: Define one canonical rate direction

Add explicit fields to `Invoice`:

- `baseCurrencyCode CurrencyCode`
- `exchangeRateDirection` enum with value `DOCUMENT_TO_BASE`
- keep `exchangeRate` but define it as document → base.

Add a migration that:

1. Backfills `baseCurrencyCode` from the organization's current/default currency where missing.
2. Replaces existing `exchangeRate` with `1 / oldRate` for non-base invoices.
3. Sets `exchangeRateDirection = DOCUMENT_TO_BASE` everywhere.
4. Adds a CHECK that base invoices have rate `1`.

Take a full database backup before applying. Verify row counts before/after.

**Verify**: migration applies on a cloned database; `npm run db:audit` remains `ok: true`.

### Step 2: Use one conversion helper

Add `convertDocumentAmountToBase(amount, invoice)` used by reports, payments, dashboard, and repair tooling. It must read `exchangeRate` as document → base and reject non-positive rates.

**Verify**: unit test `$100 × 83.3333 = ₹8,333.33`.

### Step 3: Persist the new semantics at invoice creation/update

`resolveExchangeRate()` must return document → base. Resolve `input.currencyCode → settings.currency`. Store `baseCurrencyCode = settings.currency`.

**Verify**: new test creates an invoice with USD currency and asserts base currency, direction, and rate.

### Step 4: Remove current-currency report filtering

Filter reports by the stored `baseCurrencyCode`, not current organization settings. Dashboard must use the same summaries.

**Verify**: test where org currency changes after invoice creation still includes the historical invoice.

### Step 5: Fix client rate display

Form options and `convertPrice` must show/use document → base rates. Missing direct rates must throw a visible validation error, never silently pass through unchanged amounts.

**Verify**: test for missing rate shows error and prevents save.

### Step 6: Update seed and repair tooling

Seed both directions with reciprocal values but label them explicitly. Repair script must divide/multiply consistently with the canonical helper and never invent financial records without validation.

**Verify**: repair audit shows zero balance mismatches and no fabricated payments in a fresh clone.

### Step 7: Add regression tests

Create `tests/unit/currency-conversion.test.ts` covering:

- INR→USD → INR report conversion;
- USD→INR → INR report conversion;
- base currency same-rate path;
- invalid rate throws;
- historical currency change still reports old invoice;
- payment ledger conversion matches report conversion.

**Verify**: `npm test` exits 0.

## Anti-collision analysis

- **Dependencies**: none; other plans may depend on this for financial correctness.
- **Upstream**: invoice create/update rate resolution.
- **Downstream**: reports, dashboard, payments, PDF totals, repair tooling.
- **Database**: data migration rewrites `exchangeRate`; backup and row-count verification mandatory.
- **API**: form option DTO changes.
- **UI**: currency selector/rate display changes.
- **Email/PDF/Storage**: no behavior change except totals remain consistent.
- **Reports**: fixes totals; no report schema changes.
- **Future refactoring**: explicit direction prevents another inversion.

## Test plan

- Unit conversion tests.
- Service test for invoice persistence.
- Report test for historical base currency.
- Migration test on database clone with before/after row counts.
- Existing GST/totals tests must remain green.

## Done criteria

- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm test` exits 0.
- [ ] Migration applies cleanly on a clone and `npm run db:audit` reports `ok: true`.
- [ ] Reports reconcile with invoices and payments for INR and USD fixtures.
- [ ] No files outside scope modified.

## STOP conditions

- Migration changes invoice counts or totals unexpectedly.
- Any existing invoice lacks a determinable base currency.
- Finance owner cannot confirm the canonical direction document → base.
