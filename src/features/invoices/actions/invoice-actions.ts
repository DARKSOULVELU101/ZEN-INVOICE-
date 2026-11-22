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
  downloadInvoicePdf,
  duplicateInvoice,
  listPayments,
  markInvoiceViewed,
  previewInvoicePdf,
  printInvoicePdf,
  recordPayment,
  sendInvoice,
  updateInvoice,
  type InvoicePdfResult,
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

const composerSchema = z.object({
  to: z.string().trim().email("Enter a valid recipient email address.").optional(),
  cc: z.array(z.string().trim().email()).max(10).optional(),
  bcc: z.array(z.string().trim().email()).max(10).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().max(2000).optional(),
}).strict();

type ComposerInput = z.infer<typeof composerSchema>;

function parsedComposer(value: unknown): ComposerInput | null {
  if (value === undefined || value === null) return null;
  const parsed = composerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

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

export async function sendInvoiceAction(
  id: string,
  composer?: unknown,
): Promise<Result<SendInvoiceResult>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const parsedComposerValue = parsedComposer(composer);
  if (composer !== undefined && composer !== null && !parsedComposerValue) {
    return fail(ErrorCodes.VALIDATION, "Check the email recipient, subject and message.");
  }
  const result = await sendInvoice(invoiceId, { composer: parsedComposerValue ?? undefined });
  if (result.ok) revalidateInvoicePaths(invoiceId);
  return result;
}

export async function resendInvoiceAction(
  id: string,
  composer?: unknown,
): Promise<Result<SendInvoiceResult>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const parsedComposerValue = parsedComposer(composer);
  if (composer !== undefined && composer !== null && !parsedComposerValue) {
    return fail(ErrorCodes.VALIDATION, "Check the email recipient, subject and message.");
  }
  const result = await sendInvoice(invoiceId, {
    resend: true,
    composer: parsedComposerValue ?? undefined,
  });
  if (result.ok) revalidateInvoicePaths(invoiceId);
  return result;
}

export async function previewInvoicePdfAction(id: string): Promise<Result<InvoicePdfResult>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  return previewInvoicePdf(invoiceId);
}

export async function downloadInvoicePdfAction(id: string): Promise<Result<InvoicePdfResult>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await downloadInvoicePdf(invoiceId);
  if (result.ok) revalidateInvoicePaths(invoiceId);
  return result;
}

export async function printInvoicePdfAction(id: string): Promise<Result<InvoicePdfResult>> {
  const invoiceId = parsedInvoiceId(id);
  if (!invoiceId) return fail(ErrorCodes.VALIDATION, "Invalid invoice reference.");
  const result = await printInvoicePdf(invoiceId);
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
