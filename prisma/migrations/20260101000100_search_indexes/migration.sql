CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Tenant-leading trigram indexes for fuzzy search on high-volume lists.
CREATE INDEX IF NOT EXISTS "Invoices_organizationId_invoiceNumber_trgm_idx"
  ON "Invoice" USING gin ("organizationId", "invoiceNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Customers_organizationId_displayName_trgm_idx"
  ON "Customer" USING gin ("organizationId", "displayName" gin_trgm_ops);

-- Partial index for the default (non-deleted) invoice list.
CREATE INDEX IF NOT EXISTS "Invoices_org_active_created_idx"
  ON "Invoice" ("organizationId", "createdAt" DESC, "id" DESC)
  WHERE "deletedAt" IS NULL;
