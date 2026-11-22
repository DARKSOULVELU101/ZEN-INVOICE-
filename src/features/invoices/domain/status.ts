import { DomainError, ErrorCodes } from "@/lib/errors/result";
import { toCalendarDateInput } from "./dates";

export const INVOICE_STATUSES = [
  "DRAFT", "SENT", "VIEWED", "PARTIALLY_PAID", "PAID", "CANCELLED",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type DisplayInvoiceStatus = InvoiceStatus | "OVERDUE";

export const INVOICE_ACTIONS = [
  "SAVE", "SEND", "VIEW", "RECORD_PAYMENT", "PAY", "EDIT", "CANCEL", "DELETE",
] as const;

export type InvoiceAction = (typeof INVOICE_ACTIONS)[number];

const TRANSITIONS: Record<InvoiceStatus, Partial<Record<InvoiceAction, InvoiceStatus>>> = {
  DRAFT: {
    SAVE: "DRAFT",
    EDIT: "DRAFT",
    SEND: "SENT",
    CANCEL: "CANCELLED",
    DELETE: "DRAFT",
  },
  SENT: {
    VIEW: "VIEWED",
    EDIT: "SENT",
    RECORD_PAYMENT: "PARTIALLY_PAID",
    PAY: "PAID",
    CANCEL: "CANCELLED",
  },
  VIEWED: {
    EDIT: "VIEWED",
    RECORD_PAYMENT: "PARTIALLY_PAID",
    PAY: "PAID",
    CANCEL: "CANCELLED",
  },
  PARTIALLY_PAID: {
    EDIT: "PARTIALLY_PAID",
    RECORD_PAYMENT: "PARTIALLY_PAID",
    PAY: "PAID",
  },
  PAID: {},
  CANCELLED: {},
};

export function canTransition(from: InvoiceStatus, action: InvoiceAction): boolean {
  return TRANSITIONS[from][action] !== undefined;
}

export function transition(from: InvoiceStatus, action: InvoiceAction): InvoiceStatus {
  const next = TRANSITIONS[from][action];
  if (!next) {
    throw new DomainError(
      ErrorCodes.INVALID_TRANSITION,
      `Cannot ${action.toLowerCase()} an invoice in ${from} status.`,
    );
  }
  return next;
}

export function isEditable(status: InvoiceStatus): boolean {
  return canTransition(status, "EDIT");
}

export function isDeletable(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}

export function isOverdue(
  status: InvoiceStatus,
  dueDate: Date,
  balanceDue: { gt: (value: number) => boolean },
  asOf: Date = new Date(),
): boolean {
  if (!["SENT", "VIEWED", "PARTIALLY_PAID"].includes(status)) return false;
  return toCalendarDateInput(dueDate) < toCalendarDateInput(asOf) && balanceDue.gt(0);
}

export function displayStatus(
  status: InvoiceStatus,
  dueDate: Date,
  balanceDue: { gt: (value: number) => boolean },
  asOf: Date = new Date(),
): DisplayInvoiceStatus {
  return isOverdue(status, dueDate, balanceDue, asOf) ? "OVERDUE" : status;
}
