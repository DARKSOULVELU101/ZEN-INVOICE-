"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROUTES } from "@/config/app";
import { ErrorCodes, fail, type FieldErrors, type Result } from "@/lib/errors/result";
import { customerCreateSchema, customerSearchSchema } from "../schemas/customer";
import type { CustomerOption } from "../types/customer";
import { createCustomer, listCustomers, searchCustomers } from "../server/customer-service";
import type { CustomerListItem } from "../types/customer";

function validationFailure(error: z.ZodError): Result<never> {
  return fail(
    ErrorCodes.VALIDATION,
    "Please correct the highlighted fields.",
    error.flatten().fieldErrors as FieldErrors,
  );
}

export async function searchCustomersAction(values: unknown): Promise<Result<CustomerOption[]>> {
  const parsed = customerSearchSchema.safeParse(values ?? {});
  if (!parsed.success) return validationFailure(parsed.error);
  return searchCustomers(parsed.data.q, parsed.data.limit);
}

export async function listCustomersAction(): Promise<Result<CustomerListItem[]>> {
  return listCustomers();
}

export async function createCustomerAction(values: unknown): Promise<Result<CustomerOption>> {
  const parsed = customerCreateSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await createCustomer(parsed.data);
  if (result.ok) {
    revalidatePath(ROUTES.customers);
    revalidatePath(ROUTES.invoiceNew);
  }
  return result;
}
