import { CurrencyCode, Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { getTenantDb } from "@/lib/db/tenant";
import { toResultAsync, type Result } from "@/lib/errors/result";
import { requirePermission } from "@/lib/rbac/guard";
import type { CustomerCreateOutput } from "../schemas/customer";
import type { CustomerListItem, CustomerOption } from "../types/customer";

function toOption(record: {
  id: string;
  displayName: string;
  email: string | null;
  currencyCode: CurrencyCode | null;
  stateCode: string | null;
  gstin: string | null;
}): CustomerOption {
  return {
    id: record.id,
    label: record.displayName,
    email: record.email,
    currencyCode: record.currencyCode,
    stateCode: record.stateCode,
    gstin: record.gstin,
  };
}

export async function searchCustomers(query: string, limit = 20): Promise<Result<CustomerOption[]>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "customer:view");
    const db = await getTenantDb();
    const rows = await db.customer.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        ...(query
          ? {
              OR: [
                { displayName: { contains: query, mode: "insensitive" } },
                { customerNumber: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        currencyCode: true,
        stateCode: true,
        gstin: true,
      },
      orderBy: { displayName: "asc" },
      take: limit,
    });
    return rows.map(toOption);
  });
}

export async function listCustomers(): Promise<Result<CustomerListItem[]>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "customer:view");
    const db = await getTenantDb();
    const rows = await db.customer.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        customerNumber: true,
        currencyCode: true,
        stateCode: true,
        gstin: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((row) => ({
      ...toOption(row),
      customerNumber: row.customerNumber,
      phone: row.phone,
      status: row.status,
    }));
  });
}

export async function createCustomer(input: CustomerCreateOutput): Promise<Result<CustomerOption>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "customer:create");
    const db = await getTenantDb();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const count = await db.customer.count({ where: { organizationId: session.organizationId } });
      const customerNumber = `CUS-${String(count + 1 + attempt).padStart(5, "0")}`;
      try {
        const created = await db.customer.create({
          data: {
            organizationId: session.organizationId,
            customerNumber,
            displayName: input.displayName,
            email: input.email,
            phone: input.phone,
            currencyCode: input.currencyCode,
            stateCode: input.stateCode,
            gstin: input.gstin,
          },
          select: {
            id: true,
            displayName: true,
            email: true,
            currencyCode: true,
            stateCode: true,
            gstin: true,
          },
        });
        return toOption(created);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
    throw new Error("Unable to allocate a customer number.");
  });
}
