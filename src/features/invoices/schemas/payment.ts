import { z } from "zod";

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => /^\d+(\.\d{1,4})?$/.test(value) && Number(value) > 0, {
      message: "Enter an amount greater than zero",
    }),
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .transform((value) => new Date(`${value}T00:00:00.000Z`)),
  method: z.enum(["CASH", "BANK_TRANSFER", "CREDIT_CARD", "DEBIT_CARD", "CHECK", "ONLINE", "OTHER"]),
  reference: z.string().trim().max(100).optional().nullable(),
});

export type RecordPaymentInput = z.output<typeof recordPaymentSchema>;
export type RecordPaymentFormValues = z.input<typeof recordPaymentSchema>;
