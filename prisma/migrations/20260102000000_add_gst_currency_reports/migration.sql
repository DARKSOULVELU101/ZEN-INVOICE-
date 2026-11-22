-- CreateEnum
CREATE TYPE "TaxComponent" AS ENUM ('CGST', 'SGST', 'IGST', 'GST', 'VAT', 'SALES_TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('INR', 'USD', 'EUR', 'GBP', 'AED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('SALES', 'REVENUE', 'GST', 'OUTSTANDING', 'CUSTOMER_REVENUE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('READY', 'GENERATING', 'FAILED');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'REPORT';

-- DropForeignKey
ALTER TABLE "ExchangeRate" DROP CONSTRAINT "ExchangeRate_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_productId_fkey";

-- DropIndex
DROP INDEX "Customers_organizationId_displayName_trgm_idx";

-- DropIndex
DROP INDEX "ExchangeRate_fromCurrencyCode_toCurrencyCode_rateDate_key";

-- DropIndex
DROP INDEX "ExchangeRate_organizationId_rateDate_idx";

-- DropIndex
DROP INDEX "Invoices_organizationId_invoiceNumber_trgm_idx";

-- DropIndex
DROP INDEX "PaymentApplication_invoiceId_idx";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "gstin" VARCHAR(15),
ADD COLUMN     "stateCode" VARCHAR(2);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "gstin" VARCHAR(15),
ADD COLUMN     "stateCode" VARCHAR(2);

ALTER TABLE "Customer" ALTER COLUMN "currencyCode" TYPE "CurrencyCode" USING "currencyCode"::"CurrencyCode";
ALTER TABLE "Customer" ALTER COLUMN "currencyCode" SET DEFAULT 'INR';

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "stateCode" VARCHAR(2);

-- AlterTable
ALTER TABLE "ExchangeRate" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ExchangeRate" ALTER COLUMN "fromCurrencyCode" TYPE "CurrencyCode" USING "fromCurrencyCode"::"CurrencyCode";
ALTER TABLE "ExchangeRate" ALTER COLUMN "toCurrencyCode" TYPE "CurrencyCode" USING "toCurrencyCode"::"CurrencyCode";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cgstAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "destinationStateCode" VARCHAR(2),
ADD COLUMN     "gstin" VARCHAR(15),
ADD COLUMN     "igstAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placeOfSupplyCode" VARCHAR(2),
ADD COLUMN     "roundOffAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "sourceStateCode" VARCHAR(2),
ADD COLUMN     "taxableAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;

ALTER TABLE "Invoice" ALTER COLUMN "currencyCode" TYPE "CurrencyCode" USING "currencyCode"::"CurrencyCode";
ALTER TABLE "Invoice" ALTER COLUMN "baseCurrencyCode" TYPE "CurrencyCode" USING "baseCurrencyCode"::"CurrencyCode";

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "cgstAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "hsnSac" VARCHAR(20),
ADD COLUMN     "igstAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceItemTax" ADD COLUMN     "component" "TaxComponent",
ADD COLUMN     "taxableAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "gstin" VARCHAR(15),
ADD COLUMN     "stateCode" VARCHAR(2);

ALTER TABLE "Organization" ALTER COLUMN "baseCurrencyCode" TYPE "CurrencyCode" USING "baseCurrencyCode"::"CurrencyCode";

-- AlterTable
ALTER TABLE "OrganizationSetting" ALTER COLUMN "defaultCurrencyCode" TYPE "CurrencyCode" USING "defaultCurrencyCode"::"CurrencyCode";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "amountInBaseCurrency" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "baseCurrencyCode" "CurrencyCode" NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchangeRate" DECIMAL(19,8) NOT NULL DEFAULT 1,
ADD COLUMN     "invoiceId" UUID;

ALTER TABLE "Payment" ALTER COLUMN "currencyCode" TYPE "CurrencyCode" USING "currencyCode"::"CurrencyCode";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hsnSac" VARCHAR(20);

ALTER TABLE "Product" ALTER COLUMN "currencyCode" TYPE "CurrencyCode" USING "currencyCode"::"CurrencyCode";

-- AlterTable
ALTER TABLE "Tax" ADD COLUMN     "component" "TaxComponent",
ADD COLUMN     "stateCode" VARCHAR(2);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "name" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'READY',
    "generatedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportInvoice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_organizationId_type_createdAt_idx" ON "Report"("organizationId", "type", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Report_organizationId_deletedAt_idx" ON "Report"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "ReportInvoice_organizationId_invoiceId_idx" ON "ReportInvoice"("organizationId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportInvoice_reportId_invoiceId_key" ON "ReportInvoice"("reportId", "invoiceId");

-- CreateIndex
CREATE INDEX "ExchangeRate_organizationId_toCurrencyCode_rateDate_idx" ON "ExchangeRate"("organizationId", "toCurrencyCode", "rateDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_organizationId_fromCurrencyCode_toCurrencyCode_key" ON "ExchangeRate"("organizationId", "fromCurrencyCode", "toCurrencyCode", "rateDate");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_issueDate_id_idx" ON "Invoice"("organizationId", "issueDate" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Invoice_organizationId_invoiceNumber_idx" ON "Invoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_total_idx" ON "Invoice"("organizationId", "total" DESC);

-- CreateIndex
CREATE INDEX "Invoice_organizationId_deletedAt_issueDate_idx" ON "Invoice"("organizationId", "deletedAt", "issueDate" DESC);

-- CreateIndex
CREATE INDEX "InvoiceItem_organizationId_productId_idx" ON "InvoiceItem"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "InvoiceItemTax_organizationId_component_idx" ON "InvoiceItemTax"("organizationId", "component");

-- CreateIndex
CREATE INDEX "Payment_organizationId_invoiceId_paidAt_idx" ON "Payment"("organizationId", "invoiceId", "paidAt" DESC);

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_paidAt_idx" ON "Payment"("organizationId", "status", "paidAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentApplication_organizationId_invoiceId_idx" ON "PaymentApplication"("organizationId", "invoiceId");

-- CreateIndex
CREATE INDEX "PaymentApplication_organizationId_paymentId_idx" ON "PaymentApplication"("organizationId", "paymentId");

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportInvoice" ADD CONSTRAINT "ReportInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportInvoice" ADD CONSTRAINT "ReportInvoice_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportInvoice" ADD CONSTRAINT "ReportInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restore search indexes after enum column rewrites.
CREATE INDEX IF NOT EXISTS "Invoices_organizationId_invoiceNumber_trgm_idx"
  ON "Invoice" USING gin ("organizationId", "invoiceNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Customers_organizationId_displayName_trgm_idx"
  ON "Customer" USING gin ("organizationId", "displayName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Products_organizationId_name_sku_trgm_idx"
  ON "Product" USING gin ("organizationId", "name" gin_trgm_ops, "sku" gin_trgm_ops);

-- Partial unique indexes for soft-deleted records.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_org_number_active_key"
  ON "Invoice" ("organizationId", "invoiceNumber") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_org_number_active_key"
  ON "Customer" ("organizationId", "customerNumber") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_org_sku_active_key"
  ON "Product" ("organizationId", "sku") WHERE "deletedAt" IS NULL;
