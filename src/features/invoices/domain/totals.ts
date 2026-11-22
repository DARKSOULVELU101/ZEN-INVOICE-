import { Decimal, roundMoney, sum, toDecimal, type DecimalInput } from "@/lib/money/decimal";

export interface TaxRateInput {
  rate: DecimalInput;
  isCompound?: boolean;
}

export interface TotalsLineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  discountPercent?: DecimalInput;
  taxes?: readonly TaxRateInput[];
}

export interface LineTotals {
  gross: Decimal;
  discountAmount: Decimal;
  net: Decimal;
  taxAmount: Decimal;
  amount: Decimal;
  taxBreakdown: Decimal[];
}

export interface InvoiceTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  lines: LineTotals[];
}

export function calculateLineTotals(line: TotalsLineInput): LineTotals {
  const quantity = toDecimal(line.quantity);
  const unitPrice = toDecimal(line.unitPrice);
  const discountPercent = toDecimal(line.discountPercent ?? 0);

  const gross = roundMoney(quantity.times(unitPrice));
  const discountAmount = roundMoney(gross.times(discountPercent).div(100));
  const net = roundMoney(gross.minus(discountAmount));

  const ordinary = (line.taxes ?? []).filter((tax) => !tax.isCompound);
  const compound = (line.taxes ?? []).filter((tax) => tax.isCompound);

  const ordinaryAmounts = ordinary.map((tax) => roundMoney(net.times(toDecimal(tax.rate)).div(100)));
  const ordinaryTotal = sum(ordinaryAmounts);

  let runningBase = net.plus(ordinaryTotal);
  const compoundAmounts = compound.map((tax) => {
    const amount = roundMoney(runningBase.times(toDecimal(tax.rate)).div(100));
    runningBase = runningBase.plus(amount);
    return amount;
  });

  const taxBreakdown = [...ordinaryAmounts, ...compoundAmounts];
  const taxAmount = roundMoney(sum(taxBreakdown));
  const amount = roundMoney(net.plus(taxAmount));

  return { gross, discountAmount, net, taxAmount, amount, taxBreakdown };
}

export function calculateInvoiceTotals(lines: readonly TotalsLineInput[]): InvoiceTotals {
  const calculated = lines.map(calculateLineTotals);
  const subtotal = roundMoney(sum(calculated.map((line) => line.net)));
  const discountAmount = roundMoney(sum(calculated.map((line) => line.discountAmount)));
  const taxAmount = roundMoney(sum(calculated.map((line) => line.taxAmount)));
  const total = roundMoney(subtotal.plus(taxAmount));

  return { subtotal, discountAmount, taxAmount, total, lines: calculated };
}
