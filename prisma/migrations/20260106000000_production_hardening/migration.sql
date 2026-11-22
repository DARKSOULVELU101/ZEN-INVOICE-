ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CUSTOMER';

ALTER TABLE "EmailOutbox" ADD COLUMN "idempotencyKey" VARCHAR(64);

UPDATE "EmailOutbox"
SET "idempotencyKey" = MD5("id"::text || "createdAt"::text)
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "EmailOutbox" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "EmailOutbox_org_idempotency_key" ON "EmailOutbox"("organizationId", "idempotencyKey");
