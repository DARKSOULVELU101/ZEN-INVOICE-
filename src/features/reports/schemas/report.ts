import { z } from "zod";

const reportDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const reportTypes = ["SALES", "REVENUE", "GST", "OUTSTANDING", "CUSTOMER_REVENUE"] as const;

export const reportQuerySchema = z.object({
  type: z.enum(reportTypes).default("SALES"),
  from: reportDate.optional(),
  to: reportDate.optional(),
  customerId: z.string().uuid().optional(),
});

export type ReportQueryInput = z.input<typeof reportQuerySchema>;
export type ReportQuery = z.output<typeof reportQuerySchema>;
