"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROUTES } from "@/config/app";
import { ErrorCodes, fail, type FieldErrors, type Result } from "@/lib/errors/result";
import { invoicePayloadSchema } from "../schemas/invoice";
import { recordPaymentSchema } from "../schemas/payment";
import type { InvoiceDetail } from "../types/invoice";
import type { InvoiceStatus } from "../domain/status";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  listPayments,
  markInvoiceViewed,
  recordPayment,
  sendInvoice,
  updateInvoice,
  type SendInvoiceResult,
} from "../server/invoice-service";

function validationFailure(error: z.ZodError): Result<never> {
  return fail(
    ErrorCodes.VALIDATION,
    "Please correct the highlighted fields.",
    error.flatten().fieldErrors as FieldErrors,
  );
}

const invoiceIdSchema = z.string().uuid("Invalid invoice reference.");

function parsedInvoiceId(id: unknown): string | null {
  const parsed = invoiceIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

function revalidateInvoicePaths(id?: string) {
  revalidatePath(ROUTES.invoices);
  revalidatePath(ROUTES.invoiceNew);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.reports);
  if (id) {
    revalidatePath(ROUTES.invoiceDetail(id));
    revalidatePath(ROUTES.invoiceEdit(id));
  }
}

export async function createInvoiceAction(values: unknown): Promise<Result<InvoiceDetail>> {
  const parsed = invoicePayloadSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await createInvoice(parsed.data);
  if (result.ok) revalidateInvoicePaths(result.data.id);
  return result;
}

export async function updateInvoiceAction(
  id: string,
  values: unknown,
  expectedVersion: number,
): Promise<Result<InvoiceDetail>> {
  const parsed = invoicePayloadSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await updateInvoice(id, parsed.data, expectedVersion);
  if (result.ok) revalidateInvoicePaths(result.data.id);
  return result;
}

export async function saveDraftAction(
  values: unknown,
  id?: string,
): Promise<Result<InvoiceDetail>> {
  const parsed = invoicePayloadSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = id
    ? await updateInvoice(id, parsed.data, parsed.data.version ?? 1)
    : await createInvoice(parsed.data);
  if (result.ok) revalidateInvoicePaths(result.data.id);
  return result;
}

export async function listPaymentsAction() {
  return listPayments();
}

export async function deleteInvoiceAction(id: string): Promise<Result<{ id: string }>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await deleteInvoice(invoiceId);
  if (result.ok) {
    revalidateInvoicePaths(invoiceId);
    revalidatePath(ROUTES.invoiceDetail(invoiceId));
  }
  return result;
}

export async function sendInvoiceAction(id: string): Promise<Result<SendInvoiceResult>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await sendInvoice(invoiceId);
  if (result.ok) revalidateInvoicePaths(invoiceId);
  return result;
}

export async function resendInvoiceAction(id: string): Promise<Result<SendInvoiceResult>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await sendInvoice(invoiceId, { resend: true });
  if (result.ok) revalidateInvoicePaths(invoiceId);
  return result;
}

export async function markInvoiceViewedAction(
  id: string,
): Promise<Result<{ status: InvoiceStatus }>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await markInvoiceViewed(invoiceId);
  if (result.ok) revalidateInvoicePaths(invoiceId);
  return result;
}

export async function cancelInvoiceAction(
  id: string,
  reason: string,
): Promise<Result<{ status: "DRAFT" | "SENT" | "VIEWED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" }>> {
  const parsed = z.string().trim().min(3, "Provide a reason of at least 3 characters").max(500).safeParse(reason);
  if (!parsed.success) return validationFailure(parsed.error);
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await cancelInvoice(invoiceId, parsed.data);
  if (result.ok) revalidateInvoicePaths(invoiceId);
  return result;
}

export async function duplicateInvoiceAction(id: string): Promise<Result<InvoiceDetail>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await duplicateInvoice(invoiceId);
  if (result.ok) revalidateInvoicePaths(result.data.id);
  return result;
}

export async function recordPaymentAction(values: unknown) {
  const parsed = recordPaymentSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await recordPayment(parsed.data);
  if (result.ok) revalidateInvoicePaths(parsed.data.invoiceId);
  return result;
}
