import { z } from "zod";
import { currencyCodeSchema } from "@/features/invoices/schemas/invoice";

const stateCodeSchema = z
  .string()
  .trim()
  .length(2, "State code must be two characters")
  .transform((value) => value.toUpperCase());

const gstinSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 alphanumeric characters")
  .transform((value) => value.toUpperCase());

export const customerCreateSchema = z.object({
  displayName: z.string().trim().min(2, "Enter a customer name").max(200),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).transform((value) => value || null),
  phone: z.string().trim().max(30).optional().transform((value) => value || null),
  currencyCode: currencyCodeSchema.default("INR"),
  stateCode: stateCodeSchema.optional().nullable(),
  gstin: gstinSchema.optional().nullable(),
});

export type CustomerCreateInput = z.input<typeof customerCreateSchema>;
export type CustomerCreateOutput = z.output<typeof customerCreateSchema>;

export const customerSearchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CustomerSearchInput = z.input<typeof customerSearchSchema>;
