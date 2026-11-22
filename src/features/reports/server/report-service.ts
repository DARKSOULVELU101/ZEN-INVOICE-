import { Prisma, ReportType } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { getTenantDb } from "@/lib/db/tenant";
import { toResultAsync, type Result } from "@/lib/errors/result";
import { Decimal, roundMoney } from "@/lib/money/decimal";
import { requirePermission } from "@/lib/rbac/guard";
import { toCalendarDateInput } from "@/features/invoices/domain/dates";
import type { ReportQuery } from "../schemas/report";
import type { ReportColumn, ReportResult } from "../types/report";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  status: string;
  customerId: string;
  customer: { displayName: string };
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal;
  currencyCode: string;
  placeOfSupplyCode: string | null;
};

function money(value: Prisma.Decimal, rate: Prisma.Decimal): Decimal {
  const divisor = new Decimal(rate.toString());
  return roundMoney(new Decimal(value.toString()).div(divisor.isZero() ? 1 : divisor));
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

function addTotals(target: Totals, row: InvoiceRow): Totals {
  return {
    billed: target.billed.plus(money(row.total, row.exchangeRate)),
    tax: target.tax.plus(money(row.taxAmount, row.exchangeRate)),
    paid: target.paid.plus(money(row.amountPaid, row.exchangeRate)),
    outstanding: target.outstanding.plus(money(row.balanceDue, row.exchangeRate)),
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

export async function getReport(query: ReportQuery): Promise<Result<ReportResult>> {
  return toResultAsync(async () => {
    const session = await requireSession();
    requirePermission(session, "report:view");
    const db = await getTenantDb();
    const organization = await db.organization.findFirst({ select: { baseCurrencyCode: true } });

    const where: Prisma.InvoiceWhereInput = { deletedAt: null };
    if (query.from || query.to) {
      where.invoiceDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (query.customerId) where.customerId = query.customerId;
    if (query.type === "OUTSTANDING") {
      where.balanceDue = { gt: 0 };
      where.status = { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] };
    } else {
      where.status = { notIn: ["DRAFT", "CANCELLED"] };
    }

    const rows = await db.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        customerId: true,
        customer: { select: { displayName: true } },
        total: true,
        amountPaid: true,
        balanceDue: true,
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        taxAmount: true,
        exchangeRate: true,
        currencyCode: true,
        placeOfSupplyCode: true,
      },
      orderBy: { invoiceDate: "desc" },
      take: 10000,
    }) as InvoiceRow[];

    const base = {
      type: query.type,
      currency: organization?.baseCurrencyCode ?? "INR",
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
          paid: money(row.amountPaid, row.exchangeRate).toString(),
          balance: money(row.balanceDue, row.exchangeRate).toString(),
          status: row.status,
        })),
        summary: summaryFrom(totals),
      };
    }

    const grouped = new Map<string, Totals>();
    for (const row of rows) {
      const key = query.type === "CUSTOMER_REVENUE"
        ? row.customer.displayName
        : query.type === "GST"
          ? (row.placeOfSupplyCode ?? "UNKNOWN")
          : monthKey(row.invoiceDate);
      grouped.set(key, addTotals(grouped.get(key) ?? emptyTotals(), row));
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
          invoices: rows.filter((row) => monthKey(row.invoiceDate) === period).length,
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
        invoices: rows.filter((row) => row.customer.displayName === customer).length,
        billed: roundMoney(totals.billed).toString(),
        paid: roundMoney(totals.paid).toString(),
        balance: roundMoney(totals.outstanding).toString(),
      })),
      summary: summaryFrom(summary),
    };
  });
}
