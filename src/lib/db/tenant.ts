import { cache } from "react";
import { requireSession } from "@/lib/auth/session";
import { tenantPrisma } from "@/lib/db/tenant-client";

export const getTenantDb = cache(async () => {
  const session = await requireSession();
  return tenantPrisma(session.organizationId);
});
