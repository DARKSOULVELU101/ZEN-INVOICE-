import { PaymentStatus, Prisma, ReportType } from "@prisma/client";
import { APP } from "@/config/app";
import { requireSession } from "@/lib/auth/session";
import { getTenantDb } from "@/lib/db/tenant";
import { DomainError, ErrorCodes, toResultAsync, type Result } from "@/lib/errors/result";
import { Decimal, roundMoney } from "@/lib/money/decimal";
import { requirePermission } from "@/lib/rbac/guard";
import { toCalendarDateInput } from "@/features/invoices/domain/dates";
import type { ReportQuery } from "../schemas/report";
import type { ReportColumn, ReportResult } from "../types/report";

type Db = Awaited<ReturnType<typeof getTenantDb>>;

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  status: string;
  customerId: string;
  customer: { displayName: string };
  total: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal;
  currencyCode: string;
  baseCurrencyCode: string;
  placeOfSupplyCode: string | null;
};

type ReportInvoiceRow = InvoiceRow & {
  paidAmount: Decimal;
  balanceAmount: Decimal;
};

const invoiceReportSelect = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  dueDate: true,
  status: true,
  customerId: true,
  customer: { select: { displayName: true } },
  total: true,
  taxableAmount: true,
  cgstAmount: true,
  sgstAmount: true,
  igstAmount: true,
  taxAmount: true,
  exchangeRate: true,
  currencyCode: true,
  baseCurrencyCode: true,
  placeOfSupplyCode: true,
} satisfies Prisma.InvoiceSelect;

function money(value: Prisma.Decimal, rate: Prisma.Decimal): Decimal {
  const multiplier = new Decimal(rate.toString());
  if (!multiplier.gt(0)) {
    throw new DomainError(ErrorCodes.INVARIANT, "A stored invoice exchange rate is invalid.");
  }
  return roundMoney(new Decimal(value.toString()).times(multiplier));
}

function monthKey(date: Date): string {
  return toCalendarDateInput(date).slice(0, 7);
}

function columnsFor(reportType: ReportType): ReportColumn[] {
  switch (reportType) {
    case "SALES":
      return [
        { key: "period", label: "Period" },
        { key: "invoices", label: "Invoices", numeric: true },
        { key: "sales", label: "Sales", numeric: true },
        { key: "tax", label: "Tax", numeric: true },
        { key: "paid", label: "Collected", numeric: true },
        { key: "outstanding", label: "Outstanding", numeric: true },
      ];
    case "REVENUE":
      return [
        { key: "period", label: "Period" },
        { key: "billed", label: "Billed", numeric: true },
        { key: "collected", label: "Collected", numeric: true },
        { key: "outstanding", label: "Outstanding", numeric: true },
      ];
    case "GST":
      return [
        { key: "state", label: "Place of supply" },
        { key: "taxable", label: "Taxable value", numeric: true },
        { key: "cgst", label: "CGST", numeric: true },
        { key: "sgst", label: "SGST", numeric: true },
        { key: "igst", label: "IGST", numeric: true },
        { key: "totalTax", label: "Total tax", numeric: true },
      ];
    case "OUTSTANDING":
      return [
        { key: "invoice", label: "Invoice" },
        { key: "customer", label: "Customer" },
        { key: "dueDate", label: "Due date" },
        { key: "total", label: "Total", numeric: true },
        { key: "paid", label: "Paid", numeric: true },
        { key: "balance", label: "Balance", numeric: true },
        { key: "status", label: "Status" },
      ];
    case "CUSTOMER_REVENUE":
      return [
        { key: "customer", label: "Customer" },
        { key: "invoices", label: "Invoices", numeric: true },
        { key: "billed", label: "Billed", numeric: true },
        { key: "paid", label: "Paid", numeric: true },
        { key: "balance", label: "Balance", numeric: true },
      ];
  }
}

interface Totals {
  billed: Decimal;
  tax: Decimal;
  paid: Decimal;
  outstanding: Decimal;
  taxable: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
}

function emptyTotals(): Totals {
  return {
    billed: new Decimal(0),
    tax: new Decimal(0),
    paid: new Decimal(0),
    outstanding: new Decimal(0),
    taxable: new Decimal(0),
    cgst: new Decimal(0),
    sgst: new Decimal(0),
    igst: new Decimal(0),
  };
}

function addTotals(target: Totals, row: ReportInvoiceRow): Totals {
  return {
    billed: target.billed.plus(money(row.total, row.exchangeRate)),
    tax: target.tax.plus(money(row.taxAmount, row.exchangeRate)),
    paid: target.paid.plus(money(row.paidAmount, row.exchangeRate)),
    outstanding: target.outstanding.plus(money(row.balanceAmount, row.exchangeRate)),
    taxable: target.taxable.plus(money(row.taxableAmount, row.exchangeRate)),
    cgst: target.cgst.plus(money(row.cgstAmount, row.exchangeRate)),
    sgst: target.sgst.plus(money(row.sgstAmount, row.exchangeRate)),
    igst: target.igst.plus(money(row.igstAmount, row.exchangeRate)),
  };
}

function summaryFrom(totals: Totals): Record<string, string> {
  return {
    billed: roundMoney(totals.billed).toString(),
    tax: roundMoney(totals.tax).toString(),
    paid: roundMoney(totals.paid).toString(),
    outstanding: roundMoney(totals.outstanding).toString(),
    taxable: roundMoney(totals.taxable).toString(),
    cgst: roundMoney(totals.cgst).toString(),
    sgst: roundMoney(totals.sgst).toString(),
    igst: roundMoney(totals.igst).toString(),
  };
}

async function loadInvoices(db: Db, where: Prisma.InvoiceWhereInput): Promise<InvoiceRow[]> {
  const rows: InvoiceRow[] = [];
  const batchSize = 1000;
  let cursor: string | undefined;

  while (true) {
    const batch = await db.invoice.findMany({
      where,
      select: invoiceReportSelect,
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }) as InvoiceRow[];
    if (!batch.length) break;
    rows.push(...batch);
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  return rows;
}

async function loadPaidAmounts(db: Db, organizationId: string): Promise<Map<string, Decimal>> {
  const groups = await db.paymentApplication.groupBy({
    by: ["invoiceId"],
    where: {
      organizationId,
      payment: { status: PaymentStatus.COMPLETED, deletedAt: null },
    },
    _sum: { amount: true },
  });
  return new Map(groups.map((group) => [
    group.invoiceId,
    roundMoney(new Decimal(group._sum.amount?.toString() ?? "0")),
  ]));
}

function groupKey(row: ReportInvoiceRow, type: ReportType): string {
  if (type === "CUSTOMER_REVENUE") return row.customer.displayName;
  if (type === "GST") return row.placeOfSupplyCode ?? "UNKNOWN";
  return monthKey(row.invoiceDate);
}

export async function getReport(query: ReportQuery): Promise<Result<ReportResult>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "report:view");
    const db = await getTenantDb();
    const organization = await db.organization.findUnique({
      where: { id: session.organizationId },
      select: {
        baseCurrencyCode: true,
        settings: { select: { defaultCurrencyCode: true } },
      },
    });
    const currency = organization?.settings?.defaultCurrencyCode
      ?? organization?.baseCurrencyCode
      ?? APP.defaultCurrency;

    const where: Prisma.InvoiceWhereInput = {
      organizationId: session.organizationId,
      deletedAt: null,
      baseCurrencyCode: currency,
    };
    if (query.from || query.to) {
      where.invoiceDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.customerId) where.customerId = query.customerId;
    if (query.type === "OUTSTANDING") {
      where.status = { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] };
    } else {
      where.status = { notIn: ["DRAFT", "CANCELLED"] };
    }

    const paidAmounts = await loadPaidAmounts(db, session.organizationId);
    let rows: ReportInvoiceRow[] = (await loadInvoices(db, where)).map((row) => {
      const paidAmount = paidAmounts.get(row.id) ?? new Decimal(0);
      return {
        ...row,
        paidAmount,
        balanceAmount: roundMoney(new Decimal(row.total.toString()).minus(paidAmount)),
      };
    });
    if (query.type === "OUTSTANDING") {
      rows = rows.filter((row) => row.balanceAmount.gt(0));
    }

    const base = {
      type: query.type,
      currency,
      columns: columnsFor(query.type),
    };

    if (query.type === "OUTSTANDING") {
      const totals = rows.reduce(addTotals, emptyTotals());
      return {
        ...base,
        title: "Outstanding invoices",
        description: "Unpaid and partially paid invoices converted to the base currency.",
        rows: rows.map((row) => ({
          invoice: row.invoiceNumber,
          customer: row.customer.displayName,
          dueDate: toCalendarDateInput(row.dueDate),
          total: money(row.total, row.exchangeRate).toString(),
          paid: money(row.paidAmount, row.exchangeRate).toString(),
          balance: money(row.balanceAmount, row.exchangeRate).toString(),
          status: row.status,
        })),
        summary: summaryFrom(totals),
      };
    }

    const grouped = new Map<string, Totals>();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = groupKey(row, query.type);
      grouped.set(key, addTotals(grouped.get(key) ?? emptyTotals(), row));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const summary = rows.reduce(addTotals, emptyTotals());
    const entries = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));

    if (query.type === "SALES" || query.type === "REVENUE") {
      return {
        ...base,
        title: query.type === "SALES" ? "Sales report" : "Revenue report",
        description: "Issued invoice values by month, converted using each invoice’s snapshotted exchange rate.",
        rows: entries.map(([period, totals]) => ({
          period,
          invoices: counts.get(period) ?? 0,
          sales: roundMoney(totals.billed).toString(),
          tax: roundMoney(totals.tax).toString(),
          billed: roundMoney(totals.billed).toString(),
          collected: roundMoney(totals.paid).toString(),
          paid: roundMoney(totals.paid).toString(),
          outstanding: roundMoney(totals.outstanding).toString(),
        })),
        summary: summaryFrom(summary),
      };
    }

    if (query.type === "GST") {
      return {
        ...base,
        title: "GST report",
        description: "Taxable value and GST components by place of supply.",
        rows: entries.map(([state, totals]) => ({
          state,
          taxable: roundMoney(totals.taxable).toString(),
          cgst: roundMoney(totals.cgst).toString(),
          sgst: roundMoney(totals.sgst).toString(),
          igst: roundMoney(totals.igst).toString(),
          totalTax: roundMoney(totals.cgst.plus(totals.sgst).plus(totals.igst)).toString(),
        })),
        summary: summaryFrom(summary),
      };
    }

    return {
      ...base,
      title: "Customer revenue report",
      description: "Billed, collected and outstanding values by customer.",
      rows: entries.map(([customer, totals]) => ({
        customer,
        invoices: counts.get(customer) ?? 0,
        billed: roundMoney(totals.billed).toString(),
        paid: roundMoney(totals.paid).toString(),
        balance: roundMoney(totals.outstanding).toString(),
      })),
      summary: summaryFrom(summary),
    };
  });
}
