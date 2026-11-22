import { prisma } from "./client";
import { isTenantModel } from "@/lib/tenancy/registry";

type MutableArgs = Record<string, unknown>;

function isRecord(value: unknown): value is MutableArgs {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withOrg(where: unknown, organizationId: string): MutableArgs {
  return { ...(isRecord(where) ? where : {}), organizationId };
}

function injectTenant(operation: string, args: unknown, organizationId: string): unknown {
  const next: MutableArgs = isRecord(args) ? { ...args } : {};

  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
    case "update":
    case "delete":
    case "upsert": {
      next.where = withOrg(next.where, organizationId);
      if (operation === "upsert") {
        next.create = { ...(isRecord(next.create) ? next.create : {}), organizationId };
      }
      break;
    }
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
    case "aggregate":
    case "groupBy":
    case "updateMany":
    case "deleteMany":
      next.where = withOrg(next.where, organizationId);
      break;
    case "create":
      next.data = { ...(isRecord(next.data) ? next.data : {}), organizationId };
      break;
    case "createMany":
    case "createManyAndReturn": {
      const data = next.data;
      next.data = Array.isArray(data)
        ? data.map((item) => ({ ...(isRecord(item) ? item : {}), organizationId }))
        : { ...(isRecord(data) ? data : {}), organizationId };
      break;
    }
    default:
      break;
  }

  return next;
}

export function tenantPrisma(organizationId: string) {
  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !isTenantModel(model)) {
            return query(args);
          }
          return query(injectTenant(operation, args, organizationId) as never);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantPrisma>;
