import { z } from "zod";
import { currencyCodeSchema } from "@/features/invoices/schemas/invoice";

export const decimalInput = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(\.\d{1,4})?$/.test(value), {
    message: "Enter a non-negative number with up to 4 decimal places",
  });

export const productCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name").max(200),
  sku: z.string().trim().min(1, "Enter a SKU").max(50).transform((value) => value.toUpperCase()),
  description: z.string().trim().max(1000).optional().transform((value) => value || null),
  salePrice: decimalInput.default("0"),
  currencyCode: currencyCodeSchema.default("INR"),
  hsnSac: z.string().trim().max(20).optional().nullable(),
  unitOfMeasure: z.string().trim().min(1).max(20).default("ea"),
  isTaxable: z.boolean().default(true),
});

export type ProductCreateInput = z.input<typeof productCreateSchema>;
export type ProductCreateOutput = z.output<typeof productCreateSchema>;

export const productSearchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ProductSearchInput = z.input<typeof productSearchSchema>;
