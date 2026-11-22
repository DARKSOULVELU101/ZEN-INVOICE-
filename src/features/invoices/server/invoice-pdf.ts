import { createElement, type ComponentProps, type ReactElement } from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import { SUPPORTED_CURRENCIES } from "../schemas/invoice";
import { Decimal } from "@/lib/money/decimal";
import { DomainError, ErrorCodes } from "@/lib/errors/result";
import {
  InvoicePdfDocument,
  type InvoicePdfData,
} from "../pdf/invoice-document";

export type { InvoicePdfData, InvoicePdfLine } from "../pdf/invoice-document";

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

export function assertInvoiceReadyForPdf(data: InvoicePdfData): void {
  if (!hasText(data.companyName)) {
    throw new DomainError(ErrorCodes.INVARIANT, "Configure the organization name before exporting an invoice.");
  }
  if (!hasText(data.invoiceNumber)) {
    throw new DomainError(ErrorCodes.INVARIANT, "Save the invoice before exporting its PDF.");
  }
  if (data.lines.length === 0) {
    throw new DomainError(ErrorCodes.INVARIANT, "Add at least one line item before exporting this invoice.");
  }
  if (!SUPPORTED_CURRENCIES.includes(data.currencyCode as (typeof SUPPORTED_CURRENCIES)[number])) {
    throw new DomainError(ErrorCodes.INVARIANT, `Unsupported invoice currency: ${data.currencyCode}.`);
  }
  if (new Decimal(data.total).lt(0)) {
    throw new DomainError(ErrorCodes.INVARIANT, "Invoice total cannot be negative.");
  }
  if (data.companyGstin && !/^[0-9A-Z]{15}$/.test(data.companyGstin)) {
    throw new DomainError(ErrorCodes.INVARIANT, "The organization GSTIN is invalid.");
  }
  if (data.customerGstin && !/^[0-9A-Z]{15}$/.test(data.customerGstin)) {
    throw new DomainError(ErrorCodes.INVARIANT, "The customer GSTIN is invalid.");
  }

  const source = data.sourceStateCode?.trim().toUpperCase();
  const destination = data.destinationStateCode?.trim().toUpperCase();
  const taxAmount = new Decimal(data.taxAmount);
  const hasGstin = Boolean(data.companyGstin || data.customerGstin);

  if (hasGstin && source && destination && taxAmount.gt(0)) {
    if (source !== destination && new Decimal(data.igstAmount).lte(0) && !data.isReverseCharge) {
      throw new DomainError(ErrorCodes.INVARIANT, "Inter-state invoices require IGST.");
    }
    if (source === destination && new Decimal(data.cgstAmount).plus(data.sgstAmount).lte(0) && !data.isReverseCharge) {
      throw new DomainError(ErrorCodes.INVARIANT, "Intra-state invoices require CGST and SGST.");
    }
  }
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  assertInvoiceReadyForPdf(data);
  const element = createElement(InvoicePdfDocument, { data }) as ReactElement<ComponentProps<typeof Document>>;
  const rendered = await renderToBuffer(element);
  return Buffer.from(rendered);
}
