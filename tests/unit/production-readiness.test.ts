import { describe, expect, it } from "vitest";
import {
  evaluateIntegrityAudit,
  evaluateSchemaAudit,
} from "@/lib/health/schema-audit";

describe("production database audit", () => {
  it("accepts a database that satisfies the required contract", () => {
    const result = evaluateSchemaAudit({
      columns: [{ table_name: "EmailOutbox", column_name: "idempotencyKey", is_nullable: "NO" }],
      indexes: [
        "EmailOutbox_org_idempotency_key",
        "AuditLog_organizationId_correlationId_key",
      ],
      constraints: [
        "Invoice_dueDate_not_before_invoiceDate",
        "Invoice_exchange_rate_positive",
        "Invoice_base_currency_rate_is_one",
        "Payment_exchange_rate_positive",
        "Payment_base_currency_rate_is_one",
      ],
      migrations: [
        "20260107000000_normalize_exchange_rate_direction",
        "20260108000000_email_delivery_recovery",
        "20260109000000_auth_workflow_guards",
      ],
      pendingMigrations: 0,
      foreignKeys: 20,
    });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports missing schema contract elements", () => {
    const result = evaluateSchemaAudit({
      columns: [{ table_name: "EmailOutbox", column_name: "idempotencyKey", is_nullable: "YES" }],
      indexes: [],
      constraints: [],
      migrations: [],
      pendingMigrations: 1,
      foreignKeys: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("EmailOutbox.idempotencyKey must be NOT NULL.");
    expect(result.failures).toContain("EmailOutbox_org_idempotency_key must be unique.");
    expect(result.failures).toContain("AuditLog_organizationId_correlationId_key must be unique.");
    expect(result.failures).toContain("One or more migrations are pending.");
    expect(result.failures).toContain("Migration 20260107000000_normalize_exchange_rate_direction is not applied.");
    expect(result.failures).toContain("Migration 20260108000000_email_delivery_recovery is not applied.");
    expect(result.failures).toContain("Migration 20260109000000_auth_workflow_guards is not applied.");
  });

  it("fails integrity audit when counts are non-zero", () => {
    const result = evaluateIntegrityAudit(
      { invoices_missing_customer: 1, invoices_missing_organization: 0 },
      { duplicate_outbox_keys: 0, invoice_balance_mismatches: 2 },
    );
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["invoices_missing_customer=1", "invoice_balance_mismatches=2"]);
  });
});
