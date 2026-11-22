import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencyCode, Prisma } from "@prisma/client";

const { requireSessionMock, getTenantDbMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  getTenantDbMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
}));

vi.mock("@/lib/db/tenant", () => ({
  getTenantDb: getTenantDbMock,
}));

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

const session = {
  sessionId: "00000000-0000-4000-8000-00000000000a",
  user: { id: USER_ID, name: "Test Admin", email: "admin@example.test" },
  organizationId: ORGANIZATION_ID,
  organizationName: "Test Organization",
  roles: ["ADMIN"],
  permissions: [
    "customer:view",
    "customer:create",
    "product:view",
    "product:create",
    "invoice:view",
    "invoice:send",
    "invoice:cancel",
    "payment:record",
  ],
};

type CustomerRecord = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  customerNumber: string;
  currencyCode: CurrencyCode | null;
  stateCode: string | null;
  gstin: string | null;
  status: string;
};

type ProductRecord = {
  id: string;
  name: string;
  description: string | null;
  salePrice: Prisma.Decimal;
  currencyCode: CurrencyCode;
  unitOfMeasure: string;
  isTaxable: boolean;
  sku: string;
  hsnSac: string | null;
  status: string;
  type: string;
};

function buildInvoiceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    invoiceNumber: "INV-2026-000001",
    status: "SENT",
    version: 1,
    reference: null,
    notes: null,
    createdById: USER_ID,
    organizationId: ORGANIZATION_ID,
    customerId: "00000000-0000-4000-8000-000000000003",
    total: new Prisma.Decimal("1000"),
    amountPaid: new Prisma.Decimal("0"),
    balanceDue: new Prisma.Decimal("1000"),
    exchangeRate: new Prisma.Decimal("1"),
    customer: { displayName: "Test Customer" },
    items: [],
    events: [],
    applications: [],
    revisions: [],
    documents: [],
    ...overrides,
  };
}

describe("service workflow regression", () => {
  let customerService: typeof import("@/features/partners/server/customer-service");
  let productService: typeof import("@/features/catalog/server/product-service");
  let invoiceService: typeof import("@/features/invoices/server/invoice-service");

  beforeAll(async () => {
    customerService = await import("@/features/partners/server/customer-service");
    productService = await import("@/features/catalog/server/product-service");
    invoiceService = await import("@/features/invoices/server/invoice-service");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValue(session);
  });

  it("creates a customer and immediately finds it by search", async () => {
    const customers: CustomerRecord[] = [];
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ nextNumber: 0 }]),
      customer: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const record: CustomerRecord = {
            id: `00000000-0000-4000-8000-${String(customers.length + 1).padStart(12, "0")}`,
            displayName: String(data.displayName),
            email: (data.email as string | null) ?? null,
            phone: (data.phone as string | null) ?? null,
            customerNumber: String(data.customerNumber),
            currencyCode: (data.currencyCode as CurrencyCode) ?? null,
            stateCode: (data.stateCode as string | null) ?? null,
            gstin: (data.gstin as string | null) ?? null,
            status: "ACTIVE",
          };
          customers.push(record);
          return record;
        }),
        findMany: vi.fn(async ({ where }: { where?: { OR?: Array<Record<string, { contains: string }>> } }) => {
          const query = where?.OR?.[0]?.displayName?.contains?.toLowerCase() ?? "";
          return customers.filter((customer) => customer.displayName.toLowerCase().includes(query));
        }),
      },
    };
    getTenantDbMock.mockResolvedValue(db);

    const created = await customerService.createCustomer({
      displayName: "Regression Customer",
      email: "customer@example.test",
      phone: null,
      currencyCode: CurrencyCode.INR,
      stateCode: "KA",
      gstin: null,
    });
    expect(created).toMatchObject({ ok: true, data: { label: "Regression Customer" } });

    const found = await customerService.searchCustomers("regression", 10);
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.data.map((item) => item.label)).toContain("Regression Customer");
  });

  it("creates a product and immediately finds it by search", async () => {
    const products: ProductRecord[] = [];
    const db = {
      product: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const record: ProductRecord = {
            id: `00000000-0000-4000-8000-${String(products.length + 1).padStart(12, "0")}`,
            name: String(data.name),
            description: (data.description as string | null) ?? null,
            salePrice: data.salePrice as Prisma.Decimal,
            currencyCode: data.currencyCode as CurrencyCode,
            unitOfMeasure: String(data.unitOfMeasure),
            isTaxable: Boolean(data.isTaxable),
            sku: String(data.sku),
            hsnSac: (data.hsnSac as string | null) ?? null,
            status: "ACTIVE",
            type: String(data.type),
          };
          products.push(record);
          return record;
        }),
        findMany: vi.fn(async ({ where }: { where?: { OR?: Array<Record<string, { contains: string }>> } }) => {
          const query = where?.OR?.[0]?.name?.contains?.toLowerCase() ?? "";
          return products.filter((product) => product.name.toLowerCase().includes(query));
        }),
      },
    };
    getTenantDbMock.mockResolvedValue(db);

    const created = await productService.createProduct({
      name: "Regression Product",
      sku: "reg-prod-001",
      description: "Test product",
      salePrice: "125.50",
      currencyCode: CurrencyCode.INR,
      hsnSac: null,
      unitOfMeasure: "ea",
      isTaxable: true,
    });
    expect(created).toMatchObject({ ok: true, data: { label: "Regression Product" } });

    const found = await productService.searchProducts("regression", 10);
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.data.map((item) => item.label)).toContain("Regression Product");
  });

  it("uses a conditional claim when marking an invoice as viewed", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      invoice: { updateMany },
      invoiceEvent: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      invoice: { findFirst: vi.fn().mockResolvedValue(buildInvoiceRecord()) },
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    getTenantDbMock.mockResolvedValue(db);

    const result = await invoiceService.markInvoiceViewed("00000000-0000-4000-8000-000000000010");

    expect(result).toMatchObject({ ok: true, data: { status: "VIEWED" } });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "00000000-0000-4000-8000-000000000010",
          status: "SENT",
          version: 1,
        },
      }),
    );
  });

  it("reports a conflict when the invoice claim loses a race", async () => {
    const tx = {
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      invoiceEvent: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const db = {
      invoice: { findFirst: vi.fn().mockResolvedValue(buildInvoiceRecord()) },
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    getTenantDbMock.mockResolvedValue(db);

    const result = await invoiceService.markInvoiceViewed("00000000-0000-4000-8000-000000000010");

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(tx.invoiceEvent.create).not.toHaveBeenCalled();
  });

  it("blocks cancellation after a payment has been applied", async () => {
    const tx = {
      invoice: { updateMany: vi.fn() },
      invoiceEvent: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const db = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          buildInvoiceRecord({
            amountPaid: new Prisma.Decimal("250"),
            balanceDue: new Prisma.Decimal("750"),
          }),
        ),
      },
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    getTenantDbMock.mockResolvedValue(db);

    const result = await invoiceService.cancelInvoice("00000000-0000-4000-8000-000000000010", "Duplicate");

    expect(result).toMatchObject({ ok: false, error: { code: "INVARIANT" } });
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });
});
