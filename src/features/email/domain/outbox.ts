import { EntityType, OutboxStatus } from "@prisma/client";

export interface FailedInvoiceOutboxInput {
  invoiceId: string;
  toAddress: string;
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachmentName: string;
  attachmentData: Uint8Array<ArrayBuffer> | null;
  providerName?: string;
  lastError: string;
}

export function buildFailedInvoiceOutboxData(input: FailedInvoiceOutboxInput) {
  return {
    entityType: EntityType.INVOICE,
    entityId: input.invoiceId,
    invoiceId: input.invoiceId,
    toAddress: input.toAddress,
    ccAddresses: input.ccAddresses,
    bccAddresses: input.bccAddresses,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    templateKey: "invoice-delivery-v1",
    attachmentName: input.attachmentName,
    attachmentMimeType: "application/pdf",
    attachmentData: input.attachmentData,
    provider: input.providerName ?? null,
    lastError: input.lastError.slice(0, 500),
    status: OutboxStatus.FAILED,
    purpose: "INVOICE_SEND",
    nextAttemptAt: new Date(),
  };
}

export function canReconcileEmailAsDelivered(input: {
  providerMessageId?: string | null;
  lastError?: string | null;
  invoiceLastError?: string | null;
}): boolean {
  const terminalFailure = [input.lastError, input.invoiceLastError]
    .some((value) => /bounce|complaint|suppress|delivery failed|rejected/i.test(value ?? ""));
  return Boolean(input.providerMessageId) && !terminalFailure;
}
