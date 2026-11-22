-- AlterTable
ALTER TABLE "Invoice"
  ADD COLUMN "invoiceDate" DATE,
  ADD COLUMN "paymentTerms" INTEGER NOT NULL DEFAULT 30;

-- Backfill canonical invoice date from the legacy issue date.
UPDATE "Invoice" SET "invoiceDate" = "issueDate" WHERE "invoiceDate" IS NULL;

ALTER TABLE "Invoice" ALTER COLUMN "invoiceDate" SET NOT NULL;

UPDATE "Invoice" SET "issueDate" = "invoiceDate" WHERE "issueDate" <> "invoiceDate";
UPDATE "Invoice" SET "dueDate" = ("invoiceDate" + INTERVAL '30 days')::date WHERE "dueDate" < "invoiceDate";

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dueDate_not_before_invoiceDate" CHECK ("dueDate" >= "invoiceDate");

ALTER TABLE "Invoice" ALTER COLUMN "currencyCode" SET DEFAULT 'INR';
ALTER TABLE "Invoice" ALTER COLUMN "baseCurrencyCode" SET DEFAULT 'INR';
ALTER TABLE "Organization" ALTER COLUMN "baseCurrencyCode" SET DEFAULT 'INR';
ALTER TABLE "OrganizationSetting" ALTER COLUMN "defaultCurrencyCode" SET DEFAULT 'INR';
ALTER TABLE "Payment" ALTER COLUMN "currencyCode" SET DEFAULT 'INR';
ALTER TABLE "Product" ALTER COLUMN "currencyCode" SET DEFAULT 'INR';

-- CreateIndex
CREATE INDEX "Invoice_organizationId_invoiceDate_id_idx" ON "Invoice"("organizationId", "invoiceDate" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Invoice_organizationId_deletedAt_invoiceDate_idx" ON "Invoice"("organizationId", "deletedAt", "invoiceDate" DESC);
