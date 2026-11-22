import { requireSession } from "@/lib/auth/session";
import { getTenantDb } from "@/lib/db/tenant";
import { toResultAsync, type Result } from "@/lib/errors/result";
import { APP } from "@/config/app";

export interface CustomerOption {
  id: string;
  label: string;
  email: string | null;
  currencyCode: string | null;
}

export interface ProductOption {
  id: string;
  label: string;
  description: string | null;
  unitPrice: string;
  currencyCode: string;
  unitOfMeasure: string;
  isTaxable: boolean;
  defaultTaxIds: string[];
}

export interface TaxOption {
  id: string;
  label: string;
  rate: string;
  isCompound: boolean;
}

export interface InvoiceFormOptions {
  customers: CustomerOption[];
  products: ProductOption[];
  taxes: TaxOption[];
  currencyCode: string;
}

export async function getInvoiceFormOptions(): Promise<Result<InvoiceFormOptions>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    const db = await getTenantDb();

    const [customers, products, taxes, settings] = await Promise.all([
      db.customer.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: { id: true, displayName: true, email: true, currencyCode: true },
        orderBy: { displayName: "asc" },
        take: 1000,
      }),
      db.product.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: {
          id: true, name: true, description: true, salePrice: true,
          currencyCode: true, unitOfMeasure: true, isTaxable: true,
        },
        orderBy: { name: "asc" },
        take: 1000,
      }),
      db.tax.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: { id: true, name: true, rate: true, isCompound: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
      db.organizationSetting.findUnique({ where: { organizationId: session.organizationId } }),
    ]);

    return {
      customers: customers.map((customer) => ({
        id: customer.id,
        label: customer.displayName,
        email: customer.email,
        currencyCode: customer.currencyCode,
      })),
      products: products.map((product) => ({
        id: product.id,
        label: product.name,
        description: product.description,
        unitPrice: product.salePrice.toString(),
        currencyCode: product.currencyCode,
        unitOfMeasure: product.unitOfMeasure,
        isTaxable: product.isTaxable,
        defaultTaxIds: [],
      })),
      taxes: taxes.map((tax) => ({
        id: tax.id,
        label: `${tax.name} (${tax.rate.toString()}%)`,
        rate: tax.rate.toString(),
        isCompound: tax.isCompound,
      })),
      currencyCode: settings?.defaultCurrencyCode ?? APP.defaultCurrency,
    };
  });
}
