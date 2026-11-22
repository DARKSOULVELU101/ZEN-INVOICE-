import type { PrismaClient } from "@prisma/client";

type QueryableDb = Pick<PrismaClient, "$queryRaw">;

export interface SchemaColumn {
  table_name: string;
  column_name: string;
  is_nullable: string;
}

export interface SchemaAuditInput {
  columns: SchemaColumn[];
  indexes: string[];
  constraints: string[];
  migrations: string[];
  pendingMigrations: number;
  foreignKeys: number;
}

export interface AuditEvaluation {
  ok: boolean;
  failures: string[];
}

export interface IntegrityAuditResult extends AuditEvaluation {
  relationships: Record<string, number>;
  invariants: Record<string, number>;
}

const REQUIRED_MIGRATIONS = [
  "20260107000000_normalize_exchange_rate_direction",
  "20260108000000_email_delivery_recovery",
  "20260109000000_auth_workflow_guards",
];
const REQUIRED_UNIQUE_INDEXES = [
  "EmailOutbox_org_idempotency_key",
  "AuditLog_organizationId_correlationId_key",
];
const REQUIRED_CONSTRAINTS = [
  "Invoice_dueDate_not_before_invoiceDate",
  "Invoice_exchange_rate_positive",
  "Invoice_base_currency_rate_is_one",
  "Payment_exchange_rate_positive",
  "Payment_base_currency_rate_is_one",
];

export function evaluateSchemaAudit(input: SchemaAuditInput): AuditEvaluation {
  const failures: string[] = [];
  const idempotencyKey = input.columns.find(
    (column) => column.table_name === "EmailOutbox" && column.column_name === "idempotencyKey",
  );
  if (!idempotencyKey) failures.push("EmailOutbox.idempotencyKey is missing.");
  if (idempotencyKey && idempotencyKey.is_nullable !== "NO") {
    failures.push("EmailOutbox.idempotencyKey must be NOT NULL.");
  }
  for (const index of REQUIRED_UNIQUE_INDEXES) {
    if (!input.indexes.includes(index)) failures.push(`${index} must be unique.`);
  }
  for (const constraint of REQUIRED_CONSTRAINTS) {
    if (!input.constraints.includes(constraint)) failures.push(`Constraint ${constraint} is missing.`);
  }
  if (input.pendingMigrations > 0) failures.push("One or more migrations are pending.");
  for (const migration of REQUIRED_MIGRATIONS) {
    if (!input.migrations.includes(migration)) {
      failures.push(`Migration ${migration} is not applied.`);
    }
  }
  if (input.foreignKeys < 15) failures.push("Expected database foreign keys are missing.");
  return { ok: failures.length === 0, failures };
}

export function evaluateIntegrityAudit(
  relationships: Record<string, number>,
  invariants: Record<string, number>,
): AuditEvaluation {
  const failures = [...Object.entries(relationships), ...Object.entries(invariants)]
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${key}=${value}`);
  return { ok: failures.length === 0, failures };
}

export async function runSchemaAudit(db: QueryableDb): Promise<AuditEvaluation> {
  const [columns, indexes, constraints, migrations, pending, foreignKeys] = await Promise.all([
    db.$queryRaw<SchemaColumn[]>`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `,
    db.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema()
    `,
    db.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name FROM pg_constraint WHERE connamespace = current_schema()::regnamespace
    `,
    db.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `,
    db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NULL
    `,
    db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM pg_constraint
      WHERE contype = 'f' AND connamespace = current_schema()::regnamespace
    `,
  ]);

  return evaluateSchemaAudit({
    columns,
    indexes: indexes.map((index) => index.name),
    constraints: constraints.map((constraint) => constraint.name),
    migrations: migrations.map((migration) => migration.migration_name),
    pendingMigrations: Number(pending[0]?.count ?? 0),
    foreignKeys: Number(foreignKeys[0]?.count ?? 0),
  });
}

export async function runIntegrityAudit(db: QueryableDb): Promise<IntegrityAuditResult> {
  const [relationships, invariants] = await Promise.all([
    db.$queryRaw<Record<string, number>[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "Invoice" i LEFT JOIN "Customer" c ON c.id = i.customer_id WHERE c.id IS NULL) AS invoices_missing_customer,
        (SELECT COUNT(*)::int FROM "Invoice" i LEFT JOIN "Organization" o ON o.id = i.organization_id WHERE o.id IS NULL) AS invoices_missing_organization,
        (SELECT COUNT(*)::int FROM "Invoice" i LEFT JOIN "User" u ON u.id = i.created_by_id WHERE u.id IS NULL) AS invoices_missing_creator,
        (SELECT COUNT(*)::int FROM "InvoiceItem" ii LEFT JOIN "Invoice" i ON i.id = ii."invoiceId" WHERE i.id IS NULL) AS items_missing_invoice,
        (SELECT COUNT(*)::int FROM "InvoiceItem" ii LEFT JOIN "Product" p ON p.id = ii."productId" WHERE ii."productId" IS NOT NULL AND p.id IS NULL) AS items_missing_product,
        (SELECT COUNT(*)::int FROM "Payment" p LEFT JOIN "Customer" c ON c.id = p."customerId" WHERE c.id IS NULL) AS payments_missing_customer,
        (SELECT COUNT(*)::int FROM "Payment" p LEFT JOIN "Invoice" i ON i.id = p."invoiceId" WHERE p."invoiceId" IS NOT NULL AND i.id IS NULL) AS payments_missing_invoice,
        (SELECT COUNT(*)::int FROM "PaymentApplication" pa LEFT JOIN "Payment" p ON p.id = pa."paymentId" WHERE p.id IS NULL) AS applications_missing_payment,
        (SELECT COUNT(*)::int FROM "PaymentApplication" pa LEFT JOIN "Invoice" i ON i.id = pa."invoiceId" WHERE i.id IS NULL) AS applications_missing_invoice,
        (SELECT COUNT(*)::int FROM "InvoiceDocument" d LEFT JOIN "Invoice" i ON i.id = d.invoice_id WHERE i.id IS NULL) AS documents_missing_invoice,
        (SELECT COUNT(*)::int FROM "EmailOutbox" e LEFT JOIN "Organization" o ON o.id = e."organizationId" WHERE o.id IS NULL) AS outbox_missing_organization,
        (SELECT COUNT(*)::int FROM "EmailOutbox" e LEFT JOIN "Invoice" i ON i.id = e."invoiceId" WHERE e."invoiceId" IS NOT NULL AND i.id IS NULL) AS outbox_missing_invoice,
        (SELECT COUNT(*)::int FROM "Report" r LEFT JOIN "Organization" o ON o.id = r."organizationId" WHERE o.id IS NULL) AS reports_missing_organization,
        (SELECT COUNT(*)::int FROM "ReportInvoice" ri LEFT JOIN "Report" r ON r.id = ri."reportId" WHERE r.id IS NULL) AS report_invoices_missing_report,
        (SELECT COUNT(*)::int FROM "ReportInvoice" ri LEFT JOIN "Invoice" i ON i.id = ri."invoiceId" WHERE i.id IS NULL) AS report_invoices_missing_invoice,
        (SELECT COUNT(*)::int FROM "OrganizationMembership" m LEFT JOIN "User" u ON u.id = m."userId" WHERE u.id IS NULL) AS memberships_missing_user,
        (SELECT COUNT(*)::int FROM "OrganizationMembership" m LEFT JOIN "Organization" o ON o.id = m."organizationId" WHERE o.id IS NULL) AS memberships_missing_organization
    `,
    db.$queryRaw<Record<string, number>[]>`
      SELECT
        (SELECT COUNT(*)::int FROM (
          SELECT organization_id, invoice_number FROM "Invoice"
          GROUP BY organization_id, invoice_number HAVING COUNT(*) > 1
        ) duplicates) AS duplicate_invoice_numbers,
        (SELECT COUNT(*)::int FROM (
          SELECT "organizationId", "idempotencyKey" FROM "EmailOutbox"
          GROUP BY "organizationId", "idempotencyKey" HAVING COUNT(*) > 1
        ) duplicates) AS duplicate_outbox_keys,
        (SELECT COUNT(*)::int FROM "Invoice" i
          WHERE i.deleted_at IS NULL
          AND ABS(i.balance_due - (i.total - COALESCE((
            SELECT SUM(pa.amount) FROM "PaymentApplication" pa WHERE pa."invoiceId" = i.id
          ), 0))) > 0.0001) AS invoice_balance_mismatches,
        (SELECT COUNT(*)::int FROM "Payment" p
          WHERE COALESCE((SELECT SUM(pa.amount) FROM "PaymentApplication" pa WHERE pa."paymentId" = p.id), 0) > p.amount + 0.0001) AS over_applied_payments,
        (SELECT COUNT(*)::int FROM "EmailOutbox" WHERE "idempotencyKey" IS NULL OR "idempotencyKey" = '') AS invalid_outbox_keys,
        (SELECT COUNT(*)::int FROM "Invoice" WHERE "exchange_rate" <= 0) AS invalid_invoice_rates,
        (SELECT COUNT(*)::int FROM "Payment" WHERE "exchangeRate" <= 0) AS invalid_payment_rates
    `,
  ]);

  return {
    ...evaluateIntegrityAudit(relationships[0] ?? {}, invariants[0] ?? {}),
    relationships: relationships[0] ?? {},
    invariants: invariants[0] ?? {},
  };
}
