"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROUTES } from "@/config/app";
import { ErrorCodes, fail, type FieldErrors, type Result } from "@/lib/errors/result";
import { invoiceFormSchema } from "../schemas/invoice";
import { recordPaymentSchema } from "../schemas/payment";
import type { InvoiceDetail } from "../types/invoice";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  listPayments,
  recordPayment,
  sendInvoice,
  updateInvoice,
} from "../server/invoice-service";

function validationFailure(error: z.ZodError): Result<never> {
  return fail(
    ErrorCodes.VALIDATION,
    "Please correct the highlighted fields.",
    error.flatten().fieldErrors as FieldErrors,
  );
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
  const parsed = invoiceFormSchema.safeParse(values);
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
  const parsed = invoiceFormSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await updateInvoice(id, parsed.data, expectedVersion);
  if (result.ok) revalidateInvoicePaths(result.data.id);
  return result;
}

export async function saveDraftAction(
  values: unknown,
  id?: string,
): Promise<Result<InvoiceDetail>> {
  const parsed = invoiceFormSchema.safeParse(values);
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
  const result = await deleteInvoice(id);
  if (result.ok) {
    revalidateInvoicePaths(id);
    revalidatePath(ROUTES.invoiceDetail(id));
  }
  return result;
}

export async function sendInvoiceAction(
  id: string,
): Promise<Result<{ status: "DRAFT" | "SENT" | "VIEWED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED"; emailQueued: boolean }>> {
  const result = await sendInvoice(id);
  if (result.ok) revalidateInvoicePaths(id);
  return result;
}

export async function cancelInvoiceAction(
  id: string,
  reason: string,
): Promise<Result<{ status: "DRAFT" | "SENT" | "VIEWED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" }>> {
  const parsed = z.string().trim().min(3, "Provide a reason of at least 3 characters").max(500).safeParse(reason);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await cancelInvoice(id, parsed.data);
  if (result.ok) revalidateInvoicePaths(id);
  return result;
}

export async function duplicateInvoiceAction(id: string): Promise<Result<InvoiceDetail>> {
  const result = await duplicateInvoice(id);
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
