import { describe, expect, it } from "vitest";
import {
  buildFailedInvoiceOutboxData,
  canReconcileEmailAsDelivered,
} from "@/features/email/domain/outbox";

describe("email outbox recovery", () => {
  it("stores the PDF on failed send rows so retries can resend it", () => {
    const pdf = Uint8Array.from(Buffer.from("%PDF-1.7"));
    const data = buildFailedInvoiceOutboxData({
      invoiceId: "invoice-1",
      toAddress: "customer@example.com",
      ccAddresses: [],
      bccAddresses: [],
      subject: "Invoice INV-2026-001",
      bodyText: "Please pay",
      bodyHtml: "<p>Please pay</p>",
      attachmentName: "INV-2026-001.pdf",
      attachmentData: pdf,
      providerName: "SES",
      lastError: "Email delivery is not configured.",
    });
    expect(data.attachmentData).toBe(pdf);
    expect(data.attachmentName).toBe("INV-2026-001.pdf");
  });

  it("does not reconcile a bounce or complaint as delivered", () => {
    expect(canReconcileEmailAsDelivered({
      providerMessageId: "ses-message-id",
      lastError: "Email bounce: mailbox does not exist",
      invoiceLastError: null,
    })).toBe(false);
    expect(canReconcileEmailAsDelivered({
      providerMessageId: "ses-message-id",
      lastError: "Email complaint: spam",
      invoiceLastError: null,
    })).toBe(false);
  });

  it("reconciles provider messages without a terminal failure", () => {
    expect(canReconcileEmailAsDelivered({
      providerMessageId: "ses-message-id",
      lastError: null,
      invoiceLastError: null,
    })).toBe(true);
    expect(canReconcileEmailAsDelivered({
      providerMessageId: null,
      lastError: null,
      invoiceLastError: null,
    })).toBe(false);
  });
});
