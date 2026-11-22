import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type DecimalInput = Decimal.Value;

export function toDecimal(value: DecimalInput): Decimal {
  return new Decimal(value ?? 0);
}

export function roundMoney(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function roundRate(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

export function roundPercent(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function sum(values: readonly DecimalInput[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(toDecimal(value)), new Decimal(0));
}

export function isPositive(value: DecimalInput): boolean {
  return toDecimal(value).gt(0);
}

export function isNegative(value: DecimalInput): boolean {
  return toDecimal(value).lt(0);
}

export function clampNonNegative(value: DecimalInput): Decimal {
  const decimal = toDecimal(value);
  return decimal.isNegative() ? new Decimal(0) : decimal;
}

export function toDbDecimal(value: DecimalInput): Decimal {
  return roundMoney(value);
}

export { Decimal };
