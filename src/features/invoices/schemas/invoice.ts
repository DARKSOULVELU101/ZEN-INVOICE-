import { z } from "zod";
import { APP } from "@/config/app";
import { INVOICE_STATUSES } from "../domain/status";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const decimalValue = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(\.\d{1,4})?$/.test(value), {
    message: "Enter a non-negative number with up to 4 decimal places",
  });

export const invoiceLineSchema = z
  .object({
    key: z.string().optional(),
    productId: z.string().uuid().nullable().optional(),
    description: z.string().trim().min(1, "Description is required").max(500),
    quantity: decimalValue.refine((value) => Number(value) > 0, "Quantity must be greater than zero"),
    unitPrice: decimalValue,
    discountPercent: decimalValue
      .optional()
      .default("0")
      .refine((value) => Number(value) <= 100, "Discount cannot exceed 100%"),
    taxable: z.boolean().default(true),
    taxIds: z.array(z.string().uuid()).default([]),
  })
  .strict();

export const invoiceFormSchema = z
  .object({
    customerId: z.string().uuid("Select a customer"),
    currencyCode: z.string().trim().length(3).toUpperCase(),
    issueDate: isoDate,
    dueDate: isoDate,
    reference: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(APP.maxStringLength).optional().nullable(),
    terms: z.string().trim().max(APP.maxStringLength).optional().nullable(),
    footer: z.string().trim().max(APP.maxStringLength).optional().nullable(),
    changeReason: z.string().trim().max(500).optional().nullable(),
    lines: z.array(invoiceLineSchema).min(1, "Add at least one line item").max(APP.maxLineItems),
  })
  .strict()
  .refine((value) => value.dueDate.getTime() >= value.issueDate.getTime(), {
    message: "Due date cannot be before the issue date",
    path: ["dueDate"],
  });

export type InvoiceFormValues = z.input<typeof invoiceFormSchema>;
export type InvoiceFormOutput = z.output<typeof invoiceFormSchema>;

export const invoiceSortFields = ["createdAt", "dueDate", "invoiceNumber", "total", "status"] as const;

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  customerId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(invoiceSortFields).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(APP.maxPageSize).default(APP.defaultPageSize),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export function parseInvoiceListQuery(params: URLSearchParams): InvoiceListQuery {
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) raw[key] = value;

  const parsed = invoiceListQuerySchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  return invoiceListQuerySchema.parse({});
}

export function queryToSearchParams(query: InvoiceListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.overdue !== undefined) params.set("overdue", String(query.overdue));
  if (query.customerId) params.set("customerId", query.customerId);
  if (query.from) params.set("from", query.from.toISOString().slice(0, 10));
  if (query.to) params.set("to", query.to.toISOString().slice(0, 10));
  if (query.sort !== "createdAt") params.set("sort", query.sort);
  if (query.dir !== "desc") params.set("dir", query.dir);
  if (query.limit !== APP.defaultPageSize) params.set("limit", String(query.limit));
  return params;
}
