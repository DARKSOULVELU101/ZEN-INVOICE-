ALTER TYPE "OutboxStatus" ADD VALUE 'DEAD_LETTER';

CREATE UNIQUE INDEX "AuditLog_organizationId_correlationId_key"
  ON "AuditLog"("organizationId", "correlationId");
