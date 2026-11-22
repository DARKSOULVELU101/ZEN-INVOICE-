# Plan 002: Complete React-PDF Vercel packaging

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, report back instead of improvising.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug | deployment
- **Planned at**: commit `31692a4`

## Why this matters

The deployed PDF failure was `Cannot find module .../@react-pdf/font/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs`. The current config fixed that path, but `@react-pdf/renderer` imports its own nested `pdfkit` (`node_modules/@react-pdf/renderer/node_modules/pdfkit`, `package-lock.json:3179-3192`). That nested copy is externalized but not included in the generated server trace, leaving a second production `MODULE_NOT_FOUND` waiting to happen.

## Current state

- `next.config.ts:5` externalizes `@react-pdf/renderer`, `@react-pdf/font`, and `pdfkit`.
- `next.config.ts:6-11` traces only `@react-pdf/font/node_modules/pdfkit/js/standard-fonts/**/*` and root `pdfkit/js/standard-fonts/**/*`.
- `node_modules/@react-pdf/renderer/lib/react-pdf.js:5-7` imports `@react-pdf/font` and `pdfkit`.
- `src/features/invoices/pdf/invoice-document.tsx:15-33` loads NotoSans TTF files via `process.cwd()` and `fs.existsSync`.
- Current build traces already include the TTF files, so they should remain protected, not removed.
- `tests/unit/next-config.test.ts:15-24` asserts only the two currently configured font paths.

## Scope

**In scope**: `next.config.ts`, `tests/unit/next-config.test.ts`, `scripts/check-pdf-trace.cjs` (new), `package.json`, `vercel.json` only if a post-build check is added.

**Out of scope**: PDF layout/content changes, font substitution, storage/email changes.

## Steps

### Step 1: Add the missing renderer-nested trace path

Add to `outputFileTracingIncludes["/*"]`:

- `./node_modules/@react-pdf/renderer/node_modules/pdfkit/js/standard-fonts/**/*`

Keep the existing font-package and root pdfkit paths.

**Verify**: `npm test` → `tests/unit/next-config.test.ts` passes after being updated.

### Step 2: Strengthen the config regression test

Update `tests/unit/next-config.test.ts` to require all three standard-font paths and all three externalized packages. Do not assert only one nested copy.

**Verify**: `npx vitest run tests/unit/next-config.test.ts` → 2 tests pass.

### Step 3: Add a post-build trace verifier

Create `scripts/check-pdf-trace.cjs` that reads:

- `.next/server/app/(platform)/invoices/[id]/page.js.nft.json`
- `.next/server/app/invoices/[id]/print/route.js.nft.json`
- `.next/server/app/(platform)/invoices/page.js.nft.json`

For each trace, assert it contains at least:

- `@react-pdf/font/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs`
- `@react-pdf/renderer/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs`
- `pdfkit/js/standard-fonts/Helvetica.cjs`
- `public/fonts/invoice/NotoSans-Regular.ttf`
- `public/fonts/invoice/NotoSans-Bold.ttf`

Normalize both `/` and `\\` separators before matching.

**Verify**: `npm run check:pdf-trace` → exit `0` after `npm run build`.

### Step 4: Wire the verifier into the deployment build

Add `"check:pdf-trace": "node scripts/check-pdf-trace.cjs"` to `package.json`. In `vercel.json`, use:

`npm run preflight && npm run build && npm run check:pdf-trace`

**Verify**: full command exits `0`.

### Step 5: Prove the runtime-relevant route is covered

Run the trace verifier and inspect the invoice detail and print traces manually once.

**Verify**: both traces report all required assets present.

## Anti-collision analysis

- **Dependencies**: depends on existing npm tree shape; path assertions must be normalized.
- **Upstream**: no application-call changes.
- **Downstream**: only deployment artifact size increases slightly.
- **Database**: none.
- **API/UI**: no behavior change.
- **Email/PDF/Storage**: email attachments gain the same runtime safety as preview/download.
- **Future refactoring**: trace verifier fails if a dependency layout changes and the include list is not updated.

## Test plan

- Keep real PDF render test in `tests/unit/invoice-pdf.test.ts`.
- Extend `tests/unit/next-config.test.ts`.
- Add post-build trace verifier; no source mocks.

## Done criteria

- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm test` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `npm run check:pdf-trace` exits 0.
- [ ] Hosted preview/download/print/send all render a PDF.
- [ ] No files outside scope modified.

## STOP conditions

- The built trace omits any required asset after includes are added.
- The dependency tree changes so nested pdfkit paths no longer exist; investigate the actual module resolution before changing code.
- A trace verifier requires production secrets; it must not.
