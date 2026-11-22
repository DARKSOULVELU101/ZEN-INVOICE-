import { requireSession } from "@/lib/auth/session";
import { getTenantDb } from "@/lib/db/tenant";
import { toResultAsync, type Result } from "@/lib/errors/result";
import { APP } from "@/config/app";
import type { CustomerOption } from "@/features/partners/types/customer";
import type { ProductOption } from "@/features/catalog/types/product";

export type { CustomerOption, ProductOption };

export interface TaxOption {
  id: string;
  label: string;
  rate: string;
  component: string | null;
  type: string;
  stateCode: string | null;
  isCompound: boolean;
  isInclusive: boolean;
}

export interface ExchangeRateOption {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: string;
}

export interface InvoiceFormOptions {
  customers: CustomerOption[];
  products: ProductOption[];
  taxes: TaxOption[];
  currencyCode: string;
  exchangeRates: ExchangeRateOption[];
  organizationStateCode: string | null;
  organizationGstin: string | null;
}

export async function getInvoiceFormOptions(): Promise<Result<InvoiceFormOptions>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    const db = await getTenantDb();

    const [customers, products, taxes, settings, organization, exchangeRates] = await Promise.all([
      db.customer.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: {
          id: true, displayName: true, email: true, currencyCode: true, stateCode: true, gstin: true,
        },
        orderBy: { displayName: "asc" },
        take: 1000,
      }),
      db.product.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: {
          id: true, name: true, description: true, salePrice: true, currencyCode: true,
          unitOfMeasure: true, isTaxable: true, sku: true, hsnSac: true,
        },
        orderBy: { name: "asc" },
        take: 1000,
      }),
      db.tax.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: {
          id: true, name: true, rate: true, isCompound: true, isInclusive: true,
          component: true, type: true, stateCode: true,
        },
        orderBy: { name: "asc" },
        take: 200,
      }),
      db.organizationSetting.findUnique({ where: { organizationId: session.organizationId } }),
      db.organization.findUnique({
        where: { id: session.organizationId },
        select: { stateCode: true, gstin: true },
      }),
      db.exchangeRate.findMany({
        where: { organizationId: session.organizationId },
        select: { fromCurrencyCode: true, toCurrencyCode: true, rate: true, rateDate: true },
        orderBy: { rateDate: "desc" },
        take: 200,
      }),
    ]);

    const latestRates = new Map<string, ExchangeRateOption>();
    for (const rate of exchangeRates) {
      const key = `${rate.fromCurrencyCode}-${rate.toCurrencyCode}`;
      if (!latestRates.has(key)) {
        latestRates.set(key, {
          fromCurrencyCode: rate.fromCurrencyCode,
          toCurrencyCode: rate.toCurrencyCode,
          rate: rate.rate.toString(),
        });
      }
    }

    return {
      customers: customers.map((customer) => ({
        id: customer.id,
        label: customer.displayName,
        email: customer.email,
        currencyCode: customer.currencyCode,
        stateCode: customer.stateCode,
        gstin: customer.gstin,
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
        sku: product.sku,
        hsnSac: product.hsnSac,
      })),
      taxes: taxes.map((tax) => ({
        id: tax.id,
        label: `${tax.name} (${tax.rate.toString()}%)`,
        rate: tax.rate.toString(),
        component: tax.component,
        type: tax.type,
        stateCode: tax.stateCode,
        isCompound: tax.isCompound,
        isInclusive: tax.isInclusive,
      })),
      currencyCode: settings?.defaultCurrencyCode ?? APP.defaultCurrency,
      exchangeRates: [...latestRates.values()],
      organizationStateCode: organization?.stateCode ?? null,
      organizationGstin: organization?.gstin ?? null,
    };
  });
}
