import { describe, expect, it } from "vitest";
import { invoiceFormSchema } from "@/features/invoices/schemas/invoice";
import { permissionsForRoles } from "@/config/permissions";
import { decodeCursor, encodeCursor } from "@/lib/query/cursor";

const valid = {
  customerId: "11111111-1111-4111-8111-111111111111",
  currencyCode: "USD",
  gstin: "27AAPFU0939F1ZV",
  sourceStateCode: "mh",
  destinationStateCode: "MH",
  issueDate: "2026-01-01",
  dueDate: "2026-01-31",
  lines: [
    {
      productId: "22222222-2222-4222-8222-222222222222",
      description: "Consulting",
      quantity: "2",
      unitPrice: "150.50",
      discountPercent: "0",
      taxable: true,
      taxIds: [],
    },
  ],
};

describe("invoice form validation", () => {
  it("accepts a valid invoice and normalizes GST fields", () => {
    const parsed = invoiceFormSchema.parse(valid);
    expect(parsed.currencyCode).toBe("USD");
    expect(parsed.gstin).toBe("27AAPFU0939F1ZV");
    expect(parsed.sourceStateCode).toBe("MH");
    expect(parsed.lines[0]?.description).toBe("Consulting");
  });

  it("rejects unsupported currencies and malformed GSTINs", () => {
    expect(invoiceFormSchema.safeParse({ ...valid, currencyCode: "JPY" }).success).toBe(false);
    expect(invoiceFormSchema.safeParse({ ...valid, gstin: "BAD-GSTIN" }).success).toBe(false);
  });

  it("rejects a due date before the issue date", () => {
    const result = invoiceFormSchema.safeParse({ ...valid, dueDate: "2025-12-31" });
    expect(result.success).toBe(false);
  });

  it("requires a product for every line and rejects duplicate taxes", () => {
    expect(invoiceFormSchema.safeParse({
      ...valid,
      lines: [{ ...valid.lines[0], productId: undefined }],
    }).success).toBe(false);
    expect(invoiceFormSchema.safeParse({
      ...valid,
      lines: [{
        ...valid.lines[0],
        taxIds: ["33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333333"],
      }],
    }).success).toBe(false);
  });

  it("rejects empty line sets and negative quantities", () => {
    expect(invoiceFormSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(
      invoiceFormSchema.safeParse({
        ...valid,
        lines: [{ ...valid.lines[0], quantity: "-1" }],
      }).success,
    ).toBe(false);
  });
});

describe("shared kernel", () => {
  it("grants sales people only scoped invoice permissions", () => {
    const permissions = permissionsForRoles(["SALES_PERSON"]);
    expect(permissions).toContain("invoice:create");
    expect(permissions).not.toContain("invoice:send");
  });

  it("round-trips keyset cursors", () => {
    const encoded = encodeCursor({ createdAt: "2026-01-01T00:00:00.000Z", id: "abc" });
    expect(decodeCursor(encoded)).toEqual({ createdAt: "2026-01-01T00:00:00.000Z", id: "abc" });
    expect(decodeCursor("not-base64")).toBeNull();
  });
});
