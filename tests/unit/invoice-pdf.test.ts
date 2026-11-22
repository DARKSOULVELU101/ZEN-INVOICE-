import { describe, expect, it } from "vitest";
import {
  assertInvoiceReadyForPdf,
  generateInvoicePdf,
  type InvoicePdfData,
} from "@/features/invoices/server/invoice-pdf";

function pdfData(overrides: Partial<InvoicePdfData> = {}): InvoicePdfData {
  return {
    companyName: "Zenbook ERP",
    companyLegalName: "Zenbook ERP Pvt Ltd",
    companyLogoUrl: null,
    companyGstin: "27AABCU9603R1ZM",
    companyAddressLines: ["1 Main Street", "Pune 411001 MH"],
    customerName: "Acme Traders",
    customerCompany: "Acme Traders LLP",
    customerGstin: "24AABCA9603R1ZM",
    customerEmail: "acme@example.com",
    customerAddressLines: ["2 Market Road", "Ahmedabad 380001 GJ"],
    invoiceNumber: "INV-2026-000001",
    status: "Sent",
    sourceStateCode: "27",
    destinationStateCode: "24",
    placeOfSupplyCode: "24",
    isReverseCharge: false,
    issueDate: "2026-01-05",
    invoiceDate: "2026-01-05",
    dueDate: "2026-02-04",
    reference: null,
    currencyCode: "INR",
    subtotal: "10000.00",
    discountAmount: "0.00",
    taxableAmount: "10000.00",
    shippingAmount: "0.00",
    cgstAmount: "0.00",
    sgstAmount: "0.00",
    igstAmount: "1800.00",
    taxAmount: "1800.00",
    roundOffAmount: "0.00",
    total: "11800.00",
    amountPaid: "0.00",
    balanceDue: "11800.00",
    notes: null,
    terms: null,
    footer: null,
    lines: [{
      description: "Consulting services",
      hsnSac: "998311",
      quantity: "1",
      unitPrice: "10000.00",
      discountAmount: "0.00",
      taxAmount: "1800.00",
      amount: "11800.00",
      taxNames: ["IGST 18%"],
    }],
    ...overrides,
  };
}

describe("invoice PDF validation", () => {
  it("accepts a valid interstate taxable invoice", () => {
    expect(() => assertInvoiceReadyForPdf(pdfData())).not.toThrow();
  });

  it("renders a real PDF document", async () => {
    const bytes = await generateInvoicePdf(pdfData());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("requires a saved invoice and line items", () => {
    expect(() => assertInvoiceReadyForPdf(pdfData({ invoiceNumber: "" })))
      .toThrow(/save the invoice/i);
    expect(() => assertInvoiceReadyForPdf(pdfData({ lines: [] })))
      .toThrow(/line item/i);
  });

  it("requires the correct GST component for the supply type", () => {
    expect(() => assertInvoiceReadyForPdf(pdfData({ igstAmount: "0.00", taxAmount: "1800.00" })))
      .toThrow(/IGST/i);

    expect(() => assertInvoiceReadyForPdf(pdfData({
      sourceStateCode: "27",
      destinationStateCode: "27",
      igstAmount: "0.00",
      cgstAmount: "0.00",
      sgstAmount: "0.00",
    }))).toThrow(/CGST and SGST/i);
  });

  it("allows reverse-charge invoices without tax components", () => {
    expect(() => assertInvoiceReadyForPdf(pdfData({
      isReverseCharge: true,
      igstAmount: "0.00",
      cgstAmount: "0.00",
      sgstAmount: "0.00",
    }))).not.toThrow();
  });
});
