# Implementation Plans

Generated on 2026-11-22 at commit `31692a4`.

The reverse-engineering map and full health report are in `plans/00-current-system-map-and-health-report.md`.

## Health summary

- Overall score: **58/100**
- Go-live status: **BLOCKED**
- Migrations `20260106000000_production_hardening`: **APPLIED**
- Migrations `20260107000000_normalize_exchange_rate_direction`, `20260108000000_email_delivery_recovery`, and `20260109000000_auth_workflow_guards`: **PENDING**
- Hosted data integrity: **CLEAN**
- Production readiness preflight: **40%**, intentionally failing on auth/email/storage and pending migrations
- Verification gates: typecheck, lint, 56 tests, build, PDF trace check, and `git diff --check` pass

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|
| 001 | Enforce migration, schema parity, and integrity before deployment | P1 | M | none | DONE |
| 002 | Complete React-PDF Vercel packaging | P0 | S | none | DONE |
| 003 | Repair email delivery recovery and status integrity | P1 | L | 001, 002 | DONE |
| 004 | Normalize currency conversion semantics | P0 | L | none | DONE |
| 005 | Harden authentication, authorization, and workflow boundaries | P1 | L | 001 | DONE |
| 006 | Add CI enforcement, regression protection, and dependency governance | P1 | L | 001-005 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED | REJECTED.

## Dependency graph

```text
001 ─┬─ 003 ─┐
002 ─┘      │
004 ────────┼─ 006
001 ── 005 ─┘
```

Recommended execution:

1. `002` first — smallest, fixes the known production PDF failure.
2. `004` next — P0 money correctness; do before CI/E2E assertions lock in wrong behavior.
3. `001` — deployment/integrity gate.
4. `003` — email recovery, depends on reliable PDF and deployment gate.
5. `005` — security/workflow hardening.
6. `006` — CI/E2E/dependency governance after behavior is correct.

## Top findings covered

1. P0 — renderer-nested PDFKit assets are not traced on Vercel (`next.config.ts:6-11`, `package-lock.json:3179-3192`).
2. P0 — exchange-rate direction is inverted in reports, payments, dashboard, and repair tooling (`invoice-service.ts:753-760`, `report-service.ts:59-65`).
3. P1 — deployment gate detects pending migrations but not schema/integrity drift (`production-readiness.ts:39-55`).
4. P1 — failed email rows cannot retry and bounce/complaint can be overwritten (`invoice-service.ts:1327-1355`, `retry-email/route.ts:70-94`, `email-events/route.ts:66-70`).
5. P1 — missing production secrets keep readiness at 40%.
6. P1 — no CI, E2E, coverage thresholds, or high-risk service tests.

## Explicitly deferred

These are real but lower-leverage issues recorded in the health report, not included as standalone plans:

- soft-delete unique index contradiction;
- dead/unconstrained master data;
- redundant index cleanup;
- search trigram expansion;
- timeline pagination/AuditLog viewer;
- product inline creation and product tax defaults;
- shipping tax enablement and reverse-charge calculation.

They should be scheduled after the P0/P1 plans land and are covered by regression tests.

## Execution rule

No source-code changes were made during this audit. Execute one plan at a time in a separate work item, run its verification gates, and update the status table only after all done criteria pass.
