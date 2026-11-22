import { APP } from "@/config/app";
import { toDecimal, type DecimalInput } from "@/lib/money/decimal";

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string) {
  const key = `${locale}:${currency}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

export function formatMoney(value: DecimalInput, currency: string, locale = APP.defaultLocale): string {
  return getFormatter(locale, currency).format(toDecimal(value).toNumber());
}

export function formatNumber(value: DecimalInput, locale = APP.defaultLocale, fractionDigits = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toDecimal(value).toNumber());
}

export function formatDate(
  value: Date | string,
  locale = APP.defaultLocale,
  timeZone = APP.defaultTimezone,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", timeZone,
  }).format(date);
}

export function formatDateTime(
  value: Date | string,
  locale = APP.defaultLocale,
  timeZone = APP.defaultTimezone,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone,
  }).format(date);
}
