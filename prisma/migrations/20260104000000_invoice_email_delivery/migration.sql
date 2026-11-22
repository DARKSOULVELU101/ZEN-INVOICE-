CREATE TYPE "EmailDeliveryStatus" AS ENUM ('NOT_SENT', 'DELIVERED', 'FAILED');

ALTER TYPE "InvoiceEventType" ADD VALUE IF NOT EXISTS 'EMAIL_FAILED';

ALTER TABLE "Invoice"
  ADD COLUMN "emailDeliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "emailDeliveredAt" TIMESTAMP(3),
  ADD COLUMN "emailLastError" TEXT,
  ADD COLUMN "customerNameSnapshot" TEXT,
  ADD COLUMN "customerEmailSnapshot" TEXT,
  ADD COLUMN "customerCompanySnapshot" TEXT;

ALTER TABLE "EmailOutbox"
  ADD COLUMN "fromAddress" TEXT,
  ADD COLUMN "replyTo" TEXT,
  ADD COLUMN "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "bccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "bodyHtml" TEXT,
  ADD COLUMN "templateKey" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentMimeType" TEXT,
  ADD COLUMN "attachmentData" BYTEA,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'INVOICE_SEND';

CREATE INDEX "EmailOutbox_organizationId_status_nextAttemptAt_idx"
  ON "EmailOutbox"("organizationId", "status", "nextAttemptAt");

CREATE INDEX "EmailOutbox_invoiceId_purpose_createdAt_idx"
  ON "EmailOutbox"("invoiceId", "purpose", "createdAt");
