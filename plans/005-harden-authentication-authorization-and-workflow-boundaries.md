# Plan 005: Harden authentication, authorization, and workflow boundaries

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, report back instead of improvising.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 001
- **Category**: security | auth | workflow
- **Planned at**: commit `31692a4`

## Why this matters

Runtime demo auth is removed, but protection relies on layout plus every service remembering to call `requireSession`. Navigation ignores permission flags, sessions cannot be revoked, sign-in has no rate limiting, provider URLs accept plaintext HTTP, and send/cancel/payment validate state before rather than inside final writes. These gaps are acceptable for a prototype, not for a production ERP.

## Current state

- `src/app/(platform)/layout.tsx:9-13` redirects unauthenticated users; no middleware exists.
- `src/features/auth/actions.ts:17-75` signs in users; no lockout/rate limit.
- `src/features/auth/server/session-token.ts:3-29` uses stateless 8h HMAC cookies.
- `src/lib/auth/session.ts:22-88` resolves session/RBAC and fails closed.
- `src/config/navigation.ts:7-17` and `src/components/shared/platform-nav.tsx:28-54` ignore permission flags.
- `src/features/email/server/config.ts:29-40` and `src/features/invoices/server/invoice-storage.ts:25-35` accept any URL protocol.
- Send/cancel/payment validate before final writes: `invoice-service.ts:1249-1250`, `1489-1517`, `1593-1617`, `1777-1873`.
- Demo remnants: `src/config/demo.ts`, demo seed data, docs instructing demo seed, local non-production `AUTH_MODE`.

## Scope

**In scope**: `src/middleware.ts` (new), `src/features/auth/**`, `src/lib/auth/**`, `src/config/navigation.ts`, `src/components/shared/platform-nav.tsx`, `src/features/email/server/config.ts`, `src/features/invoices/server/invoice-storage.ts`, `src/features/invoices/server/invoice-service.ts`, `src/app/api/email-events/route.ts`, `src/app/api/cron/retry-email/route.ts`, `docs/**`, `tests/unit/**`, `prisma/schema.prisma` if session revocation records are added.

**Out of scope**: replacing HMAC sessions with a new identity provider, redesigning RBAC model.

## Steps

### Step 1: Add middleware route guard

Create middleware that verifies the signed session cookie on all `(platform)` routes and API routes except health. Do not duplicate full session resolution; call a lightweight edge-safe verifier.

**Verify**: unauthenticated request to `/invoices` and `/api/health` behaves as expected.

### Step 2: Enforce permission-aware navigation

Filter navigation links by session permissions. Keep service-layer checks as the authoritative boundary.

**Verify**: unit test asserts sales-person nav excludes admin-only links.

### Step 3: Add session revocation and rotation

Add a server-side session record keyed by session ID with expiry and revoked status. On sign-out revoke it. On password/role change revoke all sessions for the user. Rotate ID on sign-in.

**Verify**: revoked token cannot access a protected route.

### Step 4: Add sign-in rate limiting/lockout

Implement durable rate limiting keyed by normalized email and IP, with configurable thresholds. Audit lockouts. Do not trust `x-forwarded-for` without trusted proxy configuration.

**Verify**: repeated bad passwords eventually return 429 and create an audit event.

### Step 5: Require HTTPS for external URLs

`EMAIL_API_URL`, `SUPABASE_URL`, webhook callbacks, and logo URLs must use `https:` in production. Add tests for rejection of `http://`.

**Verify**: config tests fail for HTTP and pass for HTTPS.

### Step 6: Harden webhook/cron authentication

Validate SNS signatures and TopicArn at the Next boundary as well as the bridge. Accept Vercel bearer cron auth. Keep shared tokens only as a secondary header.

**Verify**: invalid signature/topic/token rejected.

### Step 7: Make workflow transitions atomic inside final writes

Move status/version checks into the final Prisma update filters or transactions for send, cancel, mark viewed, and payment. Use conditional updates and re-read/throw on zero affected rows.

**Verify**: concurrent send/cancel/payment tests show exactly one winner.

### Step 8: Remove demo residue

Delete unused demo config, move demo seed to an explicitly dev-only script, and update docs so production setup never instructs demo seeding.

**Verify**: grep finds no demo bypass in production paths; docs preflight section correct.

## Anti-collision analysis

- **Dependencies**: Plan 001 supplies deployment/security readiness checks.
- **Upstream**: auth and config layers.
- **Downstream**: every protected route/service.
- **Database**: session records may add a table/migration; no financial data changes.
- **API/UI**: nav visibility changes; no data contract changes.
- **Reports/Payments/Email/PDF/Storage**: no business-calculation changes; only access control.
- **Future refactoring**: middleware + service checks create defense in depth.

## Test plan

- Middleware route tests.
- RBAC nav tests.
- Session revocation tests.
- Rate-limit tests.
- HTTPS config tests.
- Webhook signature/topic tests.
- Concurrent workflow transition tests.

## Done criteria

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- [ ] Unauthenticated access to protected routes/API returns redirect/401.
- [ ] Revoked session cannot access protected routes.
- [ ] HTTP external URLs rejected in production.
- [ ] Concurrent invalid transitions cannot both succeed.
- [ ] No files outside scope modified.

## STOP conditions

- Middleware cannot call required auth logic without duplicating security-sensitive code.
- Session schema change would require destructive migration.
- A route legitimately needs anonymous access; document and approve before excluding it.
