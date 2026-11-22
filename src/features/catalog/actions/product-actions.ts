"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROUTES } from "@/config/app";
import { ErrorCodes, fail, type FieldErrors, type Result } from "@/lib/errors/result";
import { productCreateSchema, productSearchSchema } from "../schemas/product";
import { createProduct, listProducts, searchProducts } from "../server/product-service";
import type { ProductListItem, ProductOption } from "../types/product";

function validationFailure(error: z.ZodError): Result<never> {
  return fail(
    ErrorCodes.VALIDATION,
    "Please correct the highlighted fields.",
    error.flatten().fieldErrors as FieldErrors,
  );
}

export async function searchProductsAction(values: unknown): Promise<Result<ProductOption[]>> {
  const parsed = productSearchSchema.safeParse(values ?? {});
  if (!parsed.success) return validationFailure(parsed.error);
  return searchProducts(parsed.data.q, parsed.data.limit);
}

export async function listProductsAction(): Promise<Result<ProductListItem[]>> {
  return listProducts();
}

export async function createProductAction(values: unknown): Promise<Result<ProductOption>> {
  const parsed = productCreateSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await createProduct(parsed.data);
  if (result.ok) {
    revalidatePath(ROUTES.products);
    revalidatePath(ROUTES.invoiceNew);
  }
  return result;
}
