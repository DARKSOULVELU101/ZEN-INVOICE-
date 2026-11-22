import type { InvoiceStatus } from "@prisma/client";
import type { Decimal } from "@/lib/money/decimal";
import type { DisplayInvoiceStatus } from "../domain/status";

export interface InvoiceLineInput {
  key?: string;
  productId?: string | null;
  hsnSac?: string | null;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  discountPercent?: string | number;
  taxable?: boolean;
  taxIds?: string[];
}

export interface InvoiceInput {
  customerId: string;
  currencyCode: string;
  gstin?: string | null;
  sourceStateCode?: string | null;
  destinationStateCode?: string | null;
  isReverseCharge?: boolean;
  shippingAmount?: string | number;
  roundOffAmount?: string | number;
  issueDate: Date;
  dueDate: Date;
  reference?: string | null;
  notes?: string | null;
  terms?: string | null;
  footer?: string | null;
  changeReason?: string | null;
  lines: InvoiceLineInput[];
}

export interface CustomerSummary {
  id: string;
  displayName: string;
  email: string | null;
}

export interface InvoiceLineDto {
  id: string;
  position: number;
  description: string;
  skuSnapshot: string | null;
  hsnSac: string | null;
  productId: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxable: boolean;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  taxAmount: string;
  amount: string;
  taxes: { id: string; name: string; component: string | null; rate: string; amount: string }[];
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  displayStatus: DisplayInvoiceStatus;
  customerId: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  shippingAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  roundOffAmount: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  createdAt: string;
  version: number;
}

export interface InvoiceEventDto {
  id: string;
  type: string;
  message: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  paymentNumber: string;
  amount: string;
  paidAt: string;
  method: string;
  reference: string | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  baseCurrencyCode: string;
  exchangeRate: string;
  gstin: string | null;
  sourceStateCode: string | null;
  destinationStateCode: string | null;
  isReverseCharge: boolean;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  footer: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  branchId: string | null;
  customerEmail: string | null;
  items: InvoiceLineDto[];
  events: InvoiceEventDto[];
  payments: PaymentDto[];
  revisionCount: number;
}

export interface PaymentListItem {
  id: string;
  paymentNumber: string;
  customerName: string;
  invoiceNumber: string | null;
  amount: string;
  currencyCode: string;
  paidAt: string;
  method: string;
  status: string;
}

export interface InvoiceListResult {
  items: InvoiceListItem[];
  nextCursor?: string;
  total?: number;
}

export interface TotalsSnapshot {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}
