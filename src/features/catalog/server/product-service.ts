import { CurrencyCode, Prisma, ProductType } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { getTenantDb } from "@/lib/db/tenant";
import { toResultAsync, type Result } from "@/lib/errors/result";
import { roundMoney } from "@/lib/money/decimal";
import { requirePermission } from "@/lib/rbac/guard";
import type { ProductCreateOutput } from "../schemas/product";
import type { ProductListItem, ProductOption } from "../types/product";

function toOption(record: {
  id: string;
  name: string;
  description: string | null;
  salePrice: Prisma.Decimal;
  currencyCode: CurrencyCode;
  unitOfMeasure: string;
  isTaxable: boolean;
  sku: string;
  hsnSac: string | null;
}): ProductOption {
  return {
    id: record.id,
    label: record.name,
    description: record.description,
    unitPrice: record.salePrice.toString(),
    currencyCode: record.currencyCode,
    unitOfMeasure: record.unitOfMeasure,
    isTaxable: record.isTaxable,
    defaultTaxIds: [],
    sku: record.sku,
    hsnSac: record.hsnSac,
  };
}

export async function searchProducts(query: string, limit = 20): Promise<Result<ProductOption[]>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "product:view");
    const db = await getTenantDb();
    const rows = await db.product.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { sku: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        salePrice: true,
        currencyCode: true,
        unitOfMeasure: true,
        isTaxable: true,
        sku: true,
        hsnSac: true,
      },
      orderBy: { name: "asc" },
      take: limit,
    });
    return rows.map(toOption);
  });
}

export async function listProducts(): Promise<Result<ProductListItem[]>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "product:view");
    const db = await getTenantDb();
    const rows = await db.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        salePrice: true,
        currencyCode: true,
        unitOfMeasure: true,
        isTaxable: true,
        sku: true,
        hsnSac: true,
        status: true,
        type: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((row) => ({ ...toOption(row), status: row.status, type: row.type }));
  });
}

export async function createProduct(input: ProductCreateOutput): Promise<Result<ProductOption>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "product:create");
    const db = await getTenantDb();

    try {
      const created = await db.product.create({
        data: {
          organizationId: session.organizationId,
          name: input.name,
          sku: input.sku,
          description: input.description,
          salePrice: roundMoney(input.salePrice),
          currencyCode: input.currencyCode,
          hsnSac: input.hsnSac,
          unitOfMeasure: input.unitOfMeasure,
          isTaxable: input.isTaxable,
          type: ProductType.SERVICE,
        },
        select: {
          id: true,
          name: true,
          description: true,
          salePrice: true,
          currencyCode: true,
          unitOfMeasure: true,
          isTaxable: true,
          sku: true,
          hsnSac: true,
        },
      });
      return toOption(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("A product with this SKU already exists.");
      }
      throw error;
    }
  });
}
