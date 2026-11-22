import { z } from "zod";
import { parseCalendarDate } from "../domain/dates";

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
    .refine((value) => parseCalendarDate(value) !== null, { message: "Enter a valid date" })
    .transform((value) => parseCalendarDate(value)!),
  method: z.enum(["CASH", "BANK_TRANSFER", "CREDIT_CARD", "DEBIT_CARD", "CHECK", "ONLINE", "OTHER"]),
  reference: z.string().trim().max(100).optional().nullable(),
});

export type RecordPaymentInput = z.output<typeof recordPaymentSchema>;
export type RecordPaymentFormValues = z.input<typeof recordPaymentSchema>;
