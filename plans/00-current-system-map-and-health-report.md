# Current System Map and Production Health Report

Planned at commit `31692a4`.

## Scope and method

Read-only reverse engineering followed by read-only validation. No production secrets were printed. No source code was changed during this audit.

Validation commands executed:

- `git rev-parse --short HEAD` → `31692a4`
- `npx prisma validate` → schema valid
- `node scripts/run-with-vercel-env.cjs npx prisma migrate status` → 7 migrations found; `Database schema is up to date!`
- `npm run db:audit` → relationships and invariants all `0`; `ok: true`
- `npm run preflight` → database PASS, migrations PASS, auth FAIL, email FAIL, storage FAIL; score `40%`; exit `1`
- `npm run typecheck` → PASS
- `npm run lint` → PASS
- `npm test` → 9 files, 40 tests PASS
- `npm run build` → PASS
- `git diff --check` → PASS

## Migration and data validation

`20260106000000_production_hardening` is applied. Evidence:

- `prisma migrate status` reports all 7 migrations applied.
- `EmailOutbox.idempotencyKey` exists and is queried successfully by `scripts/dependency-audit.ts:34-45`.
- `prisma/migrations/20260106000000_production_hardening/migration.sql:3-11` adds, backfills, enforces NOT NULL, and uniquely indexes the column.

Post-migration validation results:

- Foreign-key / relationship checks: 17 checks, all `0`.
- Invariant checks: duplicate invoice numbers `0`, duplicate outbox keys `0`, invoice balance mismatches `0`, over-applied payments `0`, invalid outbox keys `0`.
- No orphan customers, organizations, creators, products, payments, applications, documents, reports, report links, memberships, or outbox rows.
- No observed data loss during the earlier applied migration; entity counts remained stable.
- Migration safety: apply is safe and complete; rollback is not provided.
- Warnings: schema/index drift, partial and full unique indexes coexisting, raw CHECK and partial indexes absent from `schema.prisma`, and no CI drift gate.

## Current system map

### Database

- PostgreSQL via Prisma; 34 models and 24 enums.
- Tenant root: `Organization`, `User`, `OrganizationMembership`, `Role`, `Permission`.
- Masters: `Customer`, `Product`, `Tax`, `Currency`, `ExchangeRate`, `NumberSequence`.
- Documents: `Invoice`, `InvoiceItem`, `InvoiceItemTax`, `InvoiceRevision`, `InvoiceDocument`, `InvoiceEvent`, `EmailOutbox`.
- Money: `Payment`, `PaymentApplication`; invoice caches `amountPaid` and `balanceDue`.
- Ops: `Report`, `ReportInvoice`, `AuditLog`, `Attachment`, `BankAccount`, `BankTransaction`, `Warehouse`, `InventoryMovement`.
- Isolation is application-enforced through Prisma tenant extension (`src/lib/db/tenant-client.ts:14-71`); no Postgres RLS.

### API architecture

- `GET /api/health` returns readiness (`src/app/api/health/route.ts:6-14`).
- `POST /api/cron/retry-email` retries failed/processing outbox rows (`src/app/api/cron/retry-email/route.ts:10-22`).
- `POST /api/email-events` ingests SES delivery events (`src/app/api/email-events/route.ts:19-36`).
- `GET /invoices/[id]/print` wraps a signed PDF URL (`src/app/invoices/[id]/print/route.ts:13-59`).
- Mutations are Next.js server actions with Zod validation; authorization is in services.
- No `/api/v1` REST surface exists despite architecture docs.

### Frontend and state

- Next.js 15 App Router with `(auth)` and `(platform)` route groups.
- Invoice list is RSC + client table with URL-driven filters/cursor.
- Invoice form uses React Hook Form, `useFieldArray`, `watch()`, and local search/dialog state.
- Customer and product forms use local React state.
- `zustand` is installed but unused.

### Authentication and authorization

- Sign-in verifies scrypt password hash, active user, first active membership, and active organization.
- Session is HMAC-signed `zenbook_session` cookie, 8h TTL, httpOnly/Secure/SameSite (`src/features/auth/server/session-token.ts:3-29`).
- `getSession()` fails closed unless `AUTH_MODE === "production"` (`src/lib/auth/session.ts:22-53`).
- RBAC unions static permissions, DB role permissions, and user overrides.
- Services call `requireSession`/`assertAccess`; UI navigation is not permission-aware.
- Demo runtime bypass is removed; demo seed/docs/config remnants remain.
- Platform layout redirects unauthenticated users; no middleware guard exists.

### Invoice workflow

- `DRAFT → SENT → VIEWED → PARTIALLY_PAID → PAID`; alternative `DRAFT → CANCELLED`.
- `PAID` and `CANCELLED` are locked.
- State machine in `src/features/invoices/domain/status.ts:18-64`.
- Edit uses optimistic version claiming; payments lock rows and reject overpayment.
- Send/cancel/payment validate status before final writes, not inside the final update transaction.

### Customer and product relationships

- Customers and products are tenant-scoped, searchable, and selectable from invoice forms.
- Customer selection sets GSTIN, destination state, and supported currency.
- Product selection autofills description, price, HSN/SAC, taxable flag, and a GST tax.
- Customer payment terms are fetched but not applied.
- Inline customer creation is reachable; inline product creation handler exists but the product selector omits `onCreate`.

### GST and currency engines

- Decimal math uses precision 28, HALF_UP, 2dp money, 6dp rate, 4dp percent.
- Same state uses CGST + SGST; different state uses IGST in the totals engine.
- PDF and detail views infer GST mode from state/IGST amount, creating multiple sources of truth.
- Supported currencies: INR, USD, EUR, GBP, AED.
- Exchange rates are stored as base → invoice currency (`src/features/invoices/server/invoice-service.ts:753-760`).
- Reports and payments multiply by that same rate (`src/features/reports/server/report-service.ts:59-65`, `143-153`), producing inverted conversion for non-base invoices.

### PDF workflow

- Preview, export, print, and send all call `generateInvoicePdf`.
- PDF includes company/customer details, invoice/date/due date, lines, GST breakdown, totals, terms, and signature area.
- React PDF rendering uses NotoSans TTF files and PDFKit standard fonts.
- Vercel packaging currently traces `@react-pdf/font/node_modules/pdfkit` and root `pdfkit`, but not `@react-pdf/renderer/node_modules/pdfkit` (`package-lock.json:3179-3192`).
- TTF font files are already present in generated NFT traces.

### Storage workflow

- S3 primary, Supabase Storage fallback.
- Keys are provenance-aware (`s3://`, `supabase://`, bare legacy keys).
- Signed URLs are generated for preview/print.
- Storage health checks any reachable provider, not specifically the primary.
- External URLs are parsed with `new URL()` but not restricted to HTTPS.

### Email workflow

- SES-only delivery via `EMAIL_API` bridge or direct SES.
- Outbox stores template, addresses, attachment bytes, idempotency key, status, attempts, and provider message ID.
- SNS events update outbox/invoice status and write activity/audit rows.
- Retry worker processes failed/processing outbox rows.
- Failed-send records omit `attachmentData`, so retries skip them (`invoice-service.ts:1327-1355`; `retry-email/route.ts:91-94`).
- Bounce/complaint sets `FAILED` but keeps `providerMessageId`; retry then reconciles it as delivered (`email-events/route.ts:66-70`; `retry-email/route.ts:70-88`).

### Reporting and audit timeline

- Reports are computed live from invoices/payments; persisted `Report` models are unused.
- Sales, revenue, customer revenue, outstanding, and GST reports use the same conversion helper.
- Dashboard inherits report summaries.
- Audit logs are written for create/update/send/PDF/payment/auth/webhook/retry paths.
- Activity timeline reads only the latest 50 invoice events; no AuditLog UI exists despite `audit:view` permission.

## System health report

Overall health score: **58/100** — not go-live ready.

| Module | Status | Why |
|---|---|---|
| Database schema | ✅ Healthy | Prisma validate passes; schema is coherent for current models. |
| Migration state | ✅ Healthy | `20260106000000_production_hardening` applied; no pending migrations. |
| Foreign keys / relationships | ✅ Healthy | 17 orphan checks all `0`. |
| Constraints / data integrity | ✅ Healthy | 5 invariant checks all `0`; idempotency column enforced. |
| Indexes | ⚠ Warning | Drift between raw SQL index names and schema; btree used for leading-wildcard ILIKE; redundant indexes. |
| Authentication | ⚠ Warning | Production credential flow works; no middleware, rate limit, revocation, or org switching. |
| Users / roles / permissions | ⚠ Warning | RBAC enforced in services; UI nav ignores permissions. |
| Customers | ✅ Healthy | Create/search/select/load path works; payment terms unused. |
| Products | ⚠ Warning | Search/select/autofill works; inline creation unreachable; tax defaults absent. |
| Invoices | ⚠ Warning | Workflow and calculations work; concurrency and UI/server gate drift remain. |
| Invoice items | ✅ Healthy | Cascade relationship and line math verified; tax snapshot mapping risk. |
| Payments | ⚠ Warning | Locking and overpayment guards exist; FX direction corrupts non-base payments. |
| Reports | ❌ Critical | Exchange-rate direction is inverted; historical currency changes can hide invoices. |
| Dashboard | ❌ Critical | Inherits incorrect report summaries. |
| GST engine | ⚠ Warning | Core CGST/SGST/IGST math correct; multiple sources of truth and snapshot risks. |
| Currency engine | ❌ Critical | P0 conversion inversion and silent unconverted fallback. |
| Email service | ❌ Critical | Retry cannot recover failed sends and can overwrite bounce/complaint status. |
| PDF service | ❌ Critical | Vercel packaging still misses renderer-nested PDFKit assets. |
| Storage service | ⚠ Warning | S3/Supabase implemented; no secrets configured; HTTPS not enforced. |
| Search system | ⚠ Warning | Correct fields queried; key ILIKE paths lack trigram support. |
| Audit logs / timeline | ⚠ Warning | Writes good; reading and pagination incomplete. |
| Test coverage | ⚠ Warning | 40 unit tests pass; no E2E, no high-risk service/payment/report tests. |
| Deployment readiness | ❌ Critical | Preflight correctly fails, but only scores 40%; no secrets and no schema-drift gate. |

## Root cause analysis

### P0 — currency conversion direction inverted

- Problem: non-base invoices, payments, reports, and dashboard are converted by the reciprocal rate.
- Root cause: `exchangeRate` is captured as base → document currency but consumed as document → base.
- Evidence: `invoice-service.ts:753-760`, `report-service.ts:59-65`, `143-153`, `seed.ts:165-173`.
- Impact: wrong revenue, tax, outstanding, and payment values.
- Severity: P0.

### P0 — PDF packaging incomplete on Vercel

- Problem: serverless functions can still omit `@react-pdf/renderer/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs`.
- Root cause: only font-package and root pdfkit assets are traced; renderer-nested pdfkit is externalized but untraced.
- Evidence: `next.config.ts:5-11`, `package-lock.json:3179-3192`, `node_modules/@react-pdf/renderer/lib/react-pdf.js:5-7`.
- Impact: preview/download/print/send fail in production.
- Severity: P0.

### P0/P1 — production infrastructure unavailable

- Problem: preflight fails auth, email, and storage.
- Root cause: required production variables are missing or redacted/unverifiable.
- Evidence: `src/lib/health/production-readiness.ts:57-160`; `npm run preflight` score `40%`.
- Impact: deployment correctly blocked; email/PDF storage/auth cannot operate.
- Severity: P0 for deploy, P1 for runtime.

### P1 — email retry/status integrity defects

- Problem: failed sends are unrecoverable; bounce/complaint can be overwritten as delivered.
- Root cause: failure rows omit attachment bytes; retry treats any `providerMessageId` as proof of delivery.
- Evidence: `invoice-service.ts:1327-1355`; `retry-email/route.ts:70-94`; `email-events/route.ts:66-70`.
- Impact: lost invoice delivery and false delivery status.
- Severity: P1.

### P1 — deployment gate does not detect schema drift

- Problem: migration is applied but a missing column or index would not necessarily fail deployment.
- Root cause: `checkMigrations()` only queries `_prisma_migrations` for unfinished rows.
- Evidence: `production-readiness.ts:39-55`; `vercel.json:2`; `scripts/dependency-audit.ts` is not wired into build.
- Impact: old/deployed code can disagree with hosted schema.
- Severity: P1.

### P2/P3 — architecture and assurance debt

- No middleware auth guard, rate limiting, session revocation, HTTPS allowlists, CI workflow, E2E tests, coverage thresholds, or schema-parity gate.
- Tax snapshots can be misaligned; explicit GST components bypass state logic; product inline creation is unreachable; search indexing is incomplete.
- Root cause: domain semantics evolved faster than operational guards and automated verification.

## Production blockers verified

| Known blocker | Actual status |
|---|---|
| Hosted migration pending | Not pending. Applied and validated. Deployment gate needs stronger schema/integrity verification. |
| Email API configured = false | Real blocker. Missing/redacted production config and missing email-api SES variables. |
| Email provider missing | Real blocker. Preflight fails `EMAIL_PROVIDER`. |
| PDF storage missing | Real blocker. No S3/Supabase storage configuration. |
| AWS variables missing | Real blocker. Missing AWS region/credentials/bucket in local and several hosted values absent from email-api. |
| Demo authentication enabled | Runtime bypass removed; local `AUTH_MODE` is non-production and demo data/docs remain. Preflight correctly fails. |

## Missing environment variables

Invoice project:

- `AUTH_SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `EMAIL_FROM`
- `EMAIL_EVENT_WEBHOOK_TOKEN`
- `CRON_SECRET`
- `AWS_REGION`
- `INVOICE_PDF_BUCKET`
- `PDF_STORAGE_PRIMARY`
- `SUPABASE_URL`
- `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_SERVICE_ROLE_KEY`

Email API project:

- `EMAIL_FROM`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or IAM role
- `EMAIL_EVENT_CALLBACK_URL`
- `EMAIL_EVENT_WEBHOOK_TOKEN`

Redacted and requiring confirmation:

- `AUTH_MODE` must be `production`.
- `EMAIL_PROVIDER` must be `EMAIL_API` or `SES`.
- `EMAIL_API_URL` must be the deployed HTTPS email bridge URL.

## Security risks

- External service URLs allow plaintext `http://` (`email/server/config.ts:29-40`; `invoice-storage.ts:25-35`).
- Public `/api/health` exposes internal errors and pending migration names.
- No middleware-level route guard; every new route must remember service-layer authorization.
- No sign-in rate limiting or server-side session revocation.
- Cron auth header does not match Vercel Cron's bearer header and no cron schedule exists.
- Webhook uses shared static tokens; Next boundary does not validate SNS signatures.
- Webhook duplicate check is non-atomic.
- Audit IP is taken from spoofable `x-forwarded-for`.
- Demo seed and docs remain in production-facing repo.

## Performance risks

- Leading-wildcard `ILIKE` without trigram indexes for key search fields.
- Reports load all matching invoices in memory in 1000-row batches.
- Stored PDFs are regenerated on every preview/download/print.
- Candidate product/customer options cap at 1000 and are snapshotted into client state.
- `serverExternalPackages` increases deployment artifact size but is required for Node runtime assets.

## Deployment checklist

1. Set all missing invoice and email-api environment variables.
2. Confirm redacted `AUTH_MODE`, `EMAIL_PROVIDER`, and `EMAIL_API_URL`.
3. Seed the production admin via `npm run db:seed:admin`.
4. Keep `vercel.json` build command as `npm run preflight && npm run build`.
5. Extend preflight with migration/schema parity, integrity, HTTPS URL, cron, and AWS capability checks.
6. Configure Vercel Cron for email retry with matching auth.
7. Redeploy and require `/api/health` score 100 before traffic switch.
8. Run hosted E2E from customer creation through reports.

## Go-live checklist

- [ ] Preflight score 100 on production deployment.
- [ ] `migrate status` up to date and `db:audit` `ok: true`.
- [ ] HTTPS-only provider URLs.
- [ ] SES verified sender and configured set.
- [ ] S3/Supabase write/read/signed URL validation.
- [ ] PDF preview/download/print/send verified on hosted URL.
- [ ] Email delivery and SNS events verified.
- [ ] Currency conversion regression tests pass.
- [ ] GST intrastate/interstate PDF/report tests pass.
- [ ] Admin sign-in and RBAC verified.
- [ ] CI gates enabled and green.
- [ ] Dependency vulnerabilities reviewed/upgraded.

## Not audited

- Live provider send/receive behavior because secrets are unavailable.
- Browser-level accessibility and visual UI quality.
- Full penetration test.
- Hosted DB `_prisma_migrations` rows individually; status was verified through Prisma and live column queries.
