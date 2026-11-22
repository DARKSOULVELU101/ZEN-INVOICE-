import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const relationships = await prisma.$queryRaw<Record<string, number>[]>`
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
  `;

  const invariants = await prisma.$queryRaw<Record<string, number>[]>`
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
      (SELECT COUNT(*)::int FROM "EmailOutbox" WHERE "idempotencyKey" IS NULL OR "idempotencyKey" = '') AS invalid_outbox_keys
  `;

  const relationshipFailures = Object.entries(relationships[0]).filter(([, value]) => Number(value) > 0);
  const invariantFailures = Object.entries(invariants[0]).filter(([, value]) => Number(value) > 0);

  console.log(JSON.stringify({
    relationships: relationships[0],
    invariants: invariants[0],
    ok: relationshipFailures.length === 0 && invariantFailures.length === 0,
  }, null, 2));

  if (relationshipFailures.length || invariantFailures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
