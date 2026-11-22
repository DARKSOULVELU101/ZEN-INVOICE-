import { APP } from "@/config/app";

export const INVOICE_TIME_ZONE = APP.defaultTimezone;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = CALENDAR_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function toCalendarDateInput(value: Date, timeZone: string = INVOICE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function todayCalendarDate(timeZone: string = INVOICE_TIME_ZONE): string {
  return toCalendarDateInput(new Date(), timeZone);
}

export function formatCalendarDate(
  value: Date,
  locale: string = APP.defaultLocale,
  timeZone: string = INVOICE_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export function addCalendarDays(value: Date, days: number): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate() + days,
  ));
}

export function deriveInvoiceDates(invoiceDate: Date, paymentTermsDays: number) {
  const canonical = new Date(Date.UTC(
    invoiceDate.getUTCFullYear(),
    invoiceDate.getUTCMonth(),
    invoiceDate.getUTCDate(),
  ));
  return {
    invoiceDate: canonical,
    issueDate: canonical,
    dueDate: addCalendarDays(canonical, paymentTermsDays),
  };
}
