import { describe, expect, it } from "vitest";
import { isValidEmailAddress } from "@/features/email/domain/address";
import { loadEmailConfig } from "@/features/email/server/config";
import { buildInvoiceEmail } from "@/features/invoices/server/invoice-email-template";

describe("invoice delivery primitives", () => {
  it("validates recipient addresses", () => {
    expect(isValidEmailAddress("customer@example.com")).toBe(true);
    expect(isValidEmailAddress(" customer@example.com ")).toBe(true);
    expect(isValidEmailAddress("not-an-email")).toBe(false);
    expect(isValidEmailAddress("a@b")).toBe(false);
  });

  it("requires explicit provider configuration", () => {
    expect(() => loadEmailConfig({})).toThrow(/EMAIL_PROVIDER/);
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: "RESEND" })).toThrow(/EMAIL_FROM/);
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: "RESEND", EMAIL_FROM: "billing@example.com" }))
      .toThrow(/RESEND_API_KEY/);
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: "EMAIL_API" })).toThrow(/EMAIL_API_URL/);
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: "EMAIL_API", EMAIL_API_URL: "not-a-url" }))
      .toThrow(/valid URL/);
    expect(loadEmailConfig({
      EMAIL_PROVIDER: "EMAIL_API",
      EMAIL_API_URL: "https://email.example.com",
      EMAIL_API_TOKEN: "test-token",
    })).toMatchObject({ provider: "EMAIL_API" });
  });

  it("builds a Zoho-style invoice email", () => {
    const message = buildInvoiceEmail({
      invoiceNumber: "INV-2026-001",
      customerName: "Aarav",
      customerCompany: "Acme Traders",
      companyName: "Zenbook ERP",
      amount: "INR 10,000.00",
      dueDate: "01-12-2026",
    });

    expect(message.subject).toBe("Invoice INV-2026-001 from Zenbook ERP");
    expect(message.text).toContain("Dear Aarav");
    expect(message.text).toContain("Acme Traders");
    expect(message.text).toContain("INV-2026-001");
    expect(message.text).toContain("INR 10,000.00");
    expect(message.text).toContain("01-12-2026");
    expect(message.html).toContain("<strong>INV-2026-001</strong>");
  });
});
