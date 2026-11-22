import { describe, expect, it } from "vitest";
import {
  calculateInvoiceTotals, calculateLineTotals,
} from "@/features/invoices/domain/totals";

describe("invoice totals", () => {
  it("computes discount and ordinary tax", () => {
    const line = calculateLineTotals({
      quantity: "2",
      unitPrice: "100",
      discountPercent: "10",
      taxes: [{ rate: "10" }],
    });
    expect(line.gross.toString()).toBe("200");
    expect(line.discountAmount.toString()).toBe("20");
    expect(line.net.toString()).toBe("180");
    expect(line.taxAmount.toString()).toBe("18");
    expect(line.amount.toString()).toBe("198");
  });

  it("applies compound tax after ordinary tax", () => {
    const line = calculateLineTotals({
      quantity: "1",
      unitPrice: "100",
      taxes: [{ rate: "10" }, { rate: "5", isCompound: true }],
    });
    expect(line.taxBreakdown.map((amount) => amount.toString())).toEqual(["10", "5.5"]);
    expect(line.amount.toString()).toBe("115.5");
  });

  it("totals multiple lines without float drift", () => {
    const totals = calculateInvoiceTotals([
      { quantity: "3", unitPrice: "0.1", taxes: [{ rate: "7.5" }] },
      { quantity: "1", unitPrice: "19.99", taxes: [{ rate: "7.5" }] },
    ]);
    expect(totals.subtotal.toString()).toBe("20.29");
    expect(totals.taxAmount.toString()).toBe("1.52");
    expect(totals.total.toString()).toBe("21.81");
  });
});
