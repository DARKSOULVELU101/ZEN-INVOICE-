CREATE TYPE "ViewStatus" AS ENUM ('UNVIEWED', 'VIEWED');

ALTER TYPE "InvoiceEventType" ADD VALUE IF NOT EXISTS 'PDF_GENERATED';
ALTER TYPE "InvoiceEventType" ADD VALUE IF NOT EXISTS 'PDF_DOWNLOADED';
ALTER TYPE "InvoiceEventType" ADD VALUE IF NOT EXISTS 'PRINTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRINT';

ALTER TABLE "Organization" ADD COLUMN "logo_url" TEXT;

ALTER TABLE "Invoice" RENAME COLUMN "organizationId" TO "organization_id";
ALTER TABLE "Invoice" RENAME COLUMN "customerId" TO "customer_id";
ALTER TABLE "Invoice" RENAME COLUMN "branchId" TO "branch_id";
ALTER TABLE "Invoice" RENAME COLUMN "invoiceNumber" TO "invoice_number";
ALTER TABLE "Invoice" RENAME COLUMN "currencyCode" TO "currency_code";
ALTER TABLE "Invoice" RENAME COLUMN "baseCurrencyCode" TO "base_currency_code";
ALTER TABLE "Invoice" RENAME COLUMN "exchangeRate" TO "exchange_rate";
ALTER TABLE "Invoice" RENAME COLUMN "sourceStateCode" TO "source_state_code";
ALTER TABLE "Invoice" RENAME COLUMN "destinationStateCode" TO "destination_state_code";
ALTER TABLE "Invoice" RENAME COLUMN "placeOfSupplyCode" TO "place_of_supply_code";
ALTER TABLE "Invoice" RENAME COLUMN "isReverseCharge" TO "is_reverse_charge";
ALTER TABLE "Invoice" RENAME COLUMN "invoiceDate" TO "invoice_date";
ALTER TABLE "Invoice" RENAME COLUMN "issueDate" TO "issue_date";
ALTER TABLE "Invoice" RENAME COLUMN "paymentTerms" TO "payment_terms";
ALTER TABLE "Invoice" RENAME COLUMN "dueDate" TO "due_date";
ALTER TABLE "Invoice" RENAME COLUMN "discountAmount" TO "discount_amount";
ALTER TABLE "Invoice" RENAME COLUMN "taxableAmount" TO "taxable_amount";
ALTER TABLE "Invoice" RENAME COLUMN "shippingAmount" TO "shipping_amount";
ALTER TABLE "Invoice" RENAME COLUMN "roundOffAmount" TO "round_off_amount";
ALTER TABLE "Invoice" RENAME COLUMN "cgstAmount" TO "cgst_amount";
ALTER TABLE "Invoice" RENAME COLUMN "sgstAmount" TO "sgst_amount";
ALTER TABLE "Invoice" RENAME COLUMN "igstAmount" TO "igst_amount";
ALTER TABLE "Invoice" RENAME COLUMN "taxAmount" TO "tax_amount";
ALTER TABLE "Invoice" RENAME COLUMN "amountPaid" TO "amount_paid";
ALTER TABLE "Invoice" RENAME COLUMN "balanceDue" TO "balance_due";
ALTER TABLE "Invoice" RENAME COLUMN "sentAt" TO "sent_at";
ALTER TABLE "Invoice" RENAME COLUMN "viewedAt" TO "viewed_at";
ALTER TABLE "Invoice" RENAME COLUMN "cancelledAt" TO "cancelled_at";
ALTER TABLE "Invoice" RENAME COLUMN "cancelReason" TO "cancel_reason";
ALTER TABLE "Invoice" RENAME COLUMN "emailDeliveryStatus" TO "email_status";
ALTER TABLE "Invoice" RENAME COLUMN "emailDeliveredAt" TO "email_delivered_at";
ALTER TABLE "Invoice" RENAME COLUMN "emailLastError" TO "email_last_error";
ALTER TABLE "Invoice" RENAME COLUMN "customerNameSnapshot" TO "customer_name_snapshot";
ALTER TABLE "Invoice" RENAME COLUMN "customerEmailSnapshot" TO "customer_email_snapshot";
ALTER TABLE "Invoice" RENAME COLUMN "customerCompanySnapshot" TO "customer_company_snapshot";
ALTER TABLE "Invoice" RENAME COLUMN "createdById" TO "created_by_id";
ALTER TABLE "Invoice" RENAME COLUMN "approvedById" TO "approved_by_id";
ALTER TABLE "Invoice" RENAME COLUMN "sentById" TO "sent_by_id";
ALTER TABLE "Invoice" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "Invoice" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "Invoice" RENAME COLUMN "deletedAt" TO "deleted_at";

ALTER TABLE "Invoice"
  ADD COLUMN "view_status" "ViewStatus" NOT NULL DEFAULT 'UNVIEWED',
  ADD COLUMN "pdf_url" TEXT,
  ADD COLUMN "pdf_key" TEXT,
  ADD COLUMN "pdf_generated_at" TIMESTAMP(3),
  ADD COLUMN "pdf_hash" VARCHAR(64),
  ADD COLUMN "pdf_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "printed_at" TIMESTAMP(3),
  ADD COLUMN "last_exported_at" TIMESTAMP(3),
  ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';

UPDATE "Invoice" i
SET "view_status" = 'VIEWED'
WHERE i."viewed_at" IS NOT NULL;

UPDATE "Invoice" i
SET "search_text" = lower(concat_ws(' ', i."invoice_number", c."displayName", i."status"::text, i."total"::text, coalesce(i."reference", ''), coalesce(i."notes", '')))
FROM "Customer" c
WHERE c."id" = i."customer_id";

DROP INDEX IF EXISTS "Invoices_organizationId_invoiceNumber_trgm_idx";
DROP INDEX IF EXISTS "Invoices_org_active_created_idx";

CREATE INDEX "Invoice_org_customer_id_idx" ON "Invoice"("organization_id", "customer_id");
CREATE INDEX "Invoice_org_status_idx" ON "Invoice"("organization_id", "status");
CREATE INDEX "Invoice_org_due_date_idx" ON "Invoice"("organization_id", "due_date");
CREATE INDEX "Invoice_org_search_text_trgm_idx" ON "Invoice" USING gin ("organization_id", "search_text" gin_trgm_ops);
CREATE INDEX "Invoices_org_active_created_idx" ON "Invoice"("organization_id", "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL;

CREATE TABLE "InvoiceDocument" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
  "generated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceDocument_invoice_version_key" ON "InvoiceDocument"("invoice_id", "version");
CREATE INDEX "InvoiceDocument_organization_id_invoice_id_idx" ON "InvoiceDocument"("organization_id", "invoice_id");

ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
