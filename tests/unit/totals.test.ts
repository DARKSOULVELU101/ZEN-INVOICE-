import { describe, expect, it } from "vitest";
import {
  calculateInvoiceTotals, calculateLineTotals, calculateRoundOff,
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

  it("splits intra-state GST into CGST and SGST", () => {
    const totals = calculateInvoiceTotals(
      [{ quantity: "1", unitPrice: "1000", taxes: [{ rate: "18", component: "GST", type: "GST" }] }],
      { sourceStateCode: "MH", destinationStateCode: "MH" },
    );
    expect(totals.isInterState).toBe(false);
    expect(totals.cgstAmount.toString()).toBe("90");
    expect(totals.sgstAmount.toString()).toBe("90");
    expect(totals.igstAmount.toString()).toBe("0");
    expect(totals.total.toString()).toBe("1180");
  });

  it("uses IGST for inter-state supplies", () => {
    const totals = calculateInvoiceTotals(
      [{ quantity: "1", unitPrice: "1000", taxes: [{ rate: "18", component: "GST", type: "GST" }] }],
      { sourceStateCode: "MH", destinationStateCode: "KA" },
    );
    expect(totals.isInterState).toBe(true);
    expect(totals.cgstAmount.toString()).toBe("0");
    expect(totals.sgstAmount.toString()).toBe("0");
    expect(totals.igstAmount.toString()).toBe("180");
    expect(totals.total.toString()).toBe("1180");
  });

  it("extracts tax from inclusive prices", () => {
    const totals = calculateInvoiceTotals(
      [{ quantity: "1", unitPrice: "1180", taxes: [{ rate: "18", component: "GST", isInclusive: true }] }],
      { sourceStateCode: "MH", destinationStateCode: "KA" },
    );
    expect(totals.taxableAmount.toString()).toBe("1000");
    expect(totals.igstAmount.toString()).toBe("180");
    expect(totals.total.toString()).toBe("1180");
  });

  it("applies shipping and round off", () => {
    const totals = calculateInvoiceTotals(
      [{ quantity: "1", unitPrice: "1000" }],
      { shippingAmount: "49.5", roundOffAmount: calculateRoundOff("1049.5") },
    );
    expect(totals.shippingAmount.toString()).toBe("49.5");
    expect(totals.roundOffAmount.toString()).toBe("0.5");
    expect(totals.total.toString()).toBe("1050");
  });
});
