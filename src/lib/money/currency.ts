import { Decimal, roundMoney, toDecimal } from "./decimal";

const RATE_PRECISION = 8;

function assertPositiveRate(rate: Decimal.Value): Decimal {
  const value = toDecimal(rate);
  if (!value.isFinite() || !value.gt(0)) {
    throw new Error("A document-to-base exchange rate must be positive.");
  }
  return value;
}

export function convertDocumentAmountToBase(amount: Decimal.Value, rate: Decimal.Value): Decimal {
  return roundMoney(toDecimal(amount).times(assertPositiveRate(rate)));
}

export function invertLegacyExchangeRate(rate: Decimal.Value): Decimal {
  return new Decimal(1)
    .div(assertPositiveRate(rate))
    .toDecimalPlaces(RATE_PRECISION, Decimal.ROUND_HALF_UP);
}
