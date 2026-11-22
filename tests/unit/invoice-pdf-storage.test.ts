import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("invoice PDF storage primitives", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("INVOICE_PDF_BUCKET", "invoice-pdfs");
    vi.stubEnv("AWS_REGION", "ap-south-1");
    vi.stubEnv("INVOICE_PDF_PREFIX", "/secure/invoices/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds versioned private object keys and S3 URIs", async () => {
    const storage = await import("@/features/invoices/server/invoice-storage");
    const key = storage.buildInvoicePdfKey({
      organizationId: "org-1",
      invoiceId: "inv-1",
      invoiceNumber: "INV-2026-000001",
      version: 2,
      hash: "abcdef1234567890",
    });

    expect(storage.isInvoicePdfStorageConfigured()).toBe(true);
    expect(key).toBe("secure/invoices/org-1/inv-1/INV-2026-000001-v2-abcdef123456.pdf");
    expect(storage.buildInvoicePdfUri(key)).toBe(`s3://invoice-pdfs/${key}`);
  });

  it("requires bucket and region configuration", async () => {
    vi.stubEnv("INVOICE_PDF_BUCKET", "");
    vi.stubEnv("AWS_REGION", "");
    vi.resetModules();
    const storage = await import("@/features/invoices/server/invoice-storage");

    expect(storage.isInvoicePdfStorageConfigured()).toBe(false);
    expect(() => storage.buildInvoicePdfUri("invoices/test.pdf"))
      .toThrow(/AWS_REGION and INVOICE_PDF_BUCKET/);
  });
});
