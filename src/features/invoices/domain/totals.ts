import { Decimal, roundMoney, sum, toDecimal, type DecimalInput } from "@/lib/money/decimal";

export type TaxComponent =
  | "CGST"
  | "SGST"
  | "IGST"
  | "GST"
  | "VAT"
  | "SALES_TAX"
  | "OTHER";

export interface TaxRateInput {
  rate: DecimalInput;
  component?: TaxComponent | string | null;
  type?: string | null;
  isCompound?: boolean;
  isInclusive?: boolean;
}

export interface TotalsLineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  discountPercent?: DecimalInput;
  taxes?: readonly TaxRateInput[];
}

export interface GstBreakdown {
  cgstAmount: Decimal;
  sgstAmount: Decimal;
  igstAmount: Decimal;
}

export interface LineTotals {
  gross: Decimal;
  discountAmount: Decimal;
  net: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
  amount: Decimal;
  taxBreakdown: Decimal[];
  gst: GstBreakdown;
}

export interface InvoiceTotalsOptions {
  shippingAmount?: DecimalInput;
  shippingTaxable?: boolean;
  shippingTaxRates?: readonly TaxRateInput[];
  roundOffAmount?: DecimalInput;
  sourceStateCode?: string | null;
  destinationStateCode?: string | null;
  isReverseCharge?: boolean;
}

export interface InvoiceTotals {
  subtotal: Decimal;
  netSubtotal: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  shippingAmount: Decimal;
  cgstAmount: Decimal;
  sgstAmount: Decimal;
  igstAmount: Decimal;
  taxAmount: Decimal;
  roundOffAmount: Decimal;
  total: Decimal;
  isInterState: boolean;
  lines: LineTotals[];
}

const ZERO_GST: GstBreakdown = {
  cgstAmount: new Decimal(0),
  sgstAmount: new Decimal(0),
  igstAmount: new Decimal(0),
};

function isInterState(source?: string | null, destination?: string | null): boolean {
  if (!source || !destination) return false;
  return source.toUpperCase() !== destination.toUpperCase();
}

export function taxComponentFor(tax: TaxRateInput, interstate: boolean): TaxComponent {
  const component = typeof tax.component === "string" ? tax.component.toUpperCase() : "";
  if (component === "CGST" || component === "SGST" || component === "IGST") {
    return component as TaxComponent;
  }
  if (interstate) return "IGST";
  const type = typeof tax.type === "string" ? tax.type.toUpperCase() : "";
  return type === "GST" || !component ? "GST" : (component as TaxComponent);
}

function splitGst(amount: Decimal, tax: TaxRateInput, interstate: boolean): GstBreakdown {
  const component = typeof tax.component === "string" ? tax.component.toUpperCase() : "";

  if (component === "IGST") return { cgstAmount: new Decimal(0), sgstAmount: new Decimal(0), igstAmount: amount };
  if (component === "CGST") return { cgstAmount: amount, sgstAmount: new Decimal(0), igstAmount: new Decimal(0) };
  if (component === "SGST") return { cgstAmount: new Decimal(0), sgstAmount: amount, igstAmount: new Decimal(0) };

  if (interstate) return { cgstAmount: new Decimal(0), sgstAmount: new Decimal(0), igstAmount: amount };

  const half = roundMoney(amount.div(2));
  return { cgstAmount: half, sgstAmount: roundMoney(amount.minus(half)), igstAmount: new Decimal(0) };
}

function addGst(target: GstBreakdown, addition: GstBreakdown): GstBreakdown {
  return {
    cgstAmount: target.cgstAmount.plus(addition.cgstAmount),
    sgstAmount: target.sgstAmount.plus(addition.sgstAmount),
    igstAmount: target.igstAmount.plus(addition.igstAmount),
  };
}

export function calculateLineTotals(line: TotalsLineInput, interstate = false): LineTotals {
  const quantity = toDecimal(line.quantity);
  const unitPrice = toDecimal(line.unitPrice);
  const discountPercent = toDecimal(line.discountPercent ?? 0);

  const gross = roundMoney(quantity.times(unitPrice));
  const discountAmount = roundMoney(gross.times(discountPercent).div(100));
  const net = roundMoney(gross.minus(discountAmount));

  const taxes = line.taxes ?? [];
  const ordinary = taxes.filter((tax) => !tax.isCompound);
  const compound = taxes.filter((tax) => tax.isCompound);
  const taxBreakdown: Decimal[] = [];
  const exclusiveAmounts: Decimal[] = [];
  let gst: GstBreakdown = { ...ZERO_GST };
  let runningBase = net;

  const applyTax = (tax: TaxRateInput, base: Decimal) => {
    const rate = toDecimal(tax.rate);
    const isInclusive = Boolean(tax.isInclusive);
    const amount = isInclusive
      ? roundMoney(base.minus(base.div(rate.plus(100).div(100))))
      : roundMoney(base.times(rate).div(100));

    taxBreakdown.push(amount);
    if (!isInclusive) exclusiveAmounts.push(amount);

    const component = typeof tax.component === "string" ? tax.component.toUpperCase() : "";
    const type = typeof tax.type === "string" ? tax.type.toUpperCase() : "";
    if (component.startsWith("GST") || type === "GST" || !component) {
      gst = addGst(gst, splitGst(amount, tax, interstate));
    }

    return amount;
  };

  for (const tax of ordinary) {
    const amount = applyTax(tax, net);
    runningBase = runningBase.plus(amount);
  }

  for (const tax of compound) {
    const amount = applyTax(tax, runningBase);
    runningBase = runningBase.plus(amount);
  }

  const taxAmount = roundMoney(sum(taxBreakdown));
  const amount = roundMoney(net.plus(sum(exclusiveAmounts)));
  const taxableAmount = taxBreakdown.length > 0 && taxes.some((tax) => tax.isInclusive)
    ? roundMoney(net.minus(taxAmount))
    : net;

  return {
    gross,
    discountAmount,
    net,
    taxableAmount: taxableAmount.isNegative() ? new Decimal(0) : taxableAmount,
    taxAmount,
    amount,
    taxBreakdown,
    gst,
  };
}

export function calculateRoundOff(amount: DecimalInput, nearest: DecimalInput = 1): Decimal {
  const step = toDecimal(nearest);
  if (step.lte(0)) return new Decimal(0);
  const rounded = toDecimal(amount).div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(step);
  return roundMoney(rounded.minus(amount));
}

export function calculateInvoiceTotals(
  lines: readonly TotalsLineInput[],
  options: InvoiceTotalsOptions = {},
): InvoiceTotals {
  const interstate = isInterState(options.sourceStateCode, options.destinationStateCode);
  const calculated = lines.map((line) => calculateLineTotals(line, interstate));
  const subtotal = roundMoney(sum(calculated.map((line) => line.gross)));
  const discountAmount = roundMoney(sum(calculated.map((line) => line.discountAmount)));
  const netSubtotal = roundMoney(subtotal.minus(discountAmount));
  const shippingAmount = roundMoney(options.shippingAmount ?? 0);

  let shippingTax: LineTotals | null = null;
  if (options.shippingTaxable && options.shippingTaxRates?.length && shippingAmount.gt(0)) {
    shippingTax = calculateLineTotals(
      { quantity: 1, unitPrice: shippingAmount, taxes: options.shippingTaxRates },
      interstate,
    );
  }

  const taxableAmount = roundMoney(sum(calculated.map((line) => line.taxableAmount)).plus(shippingTax?.taxableAmount ?? 0));
  const cgstAmount = roundMoney(sum(calculated.map((line) => line.gst.cgstAmount)).plus(shippingTax?.gst.cgstAmount ?? 0));
  const sgstAmount = roundMoney(sum(calculated.map((line) => line.gst.sgstAmount)).plus(shippingTax?.gst.sgstAmount ?? 0));
  const igstAmount = roundMoney(sum(calculated.map((line) => line.gst.igstAmount)).plus(shippingTax?.gst.igstAmount ?? 0));
  const taxAmount = roundMoney(sum(calculated.map((line) => line.taxAmount)).plus(shippingTax?.taxAmount ?? 0));
  const roundOffAmount = roundMoney(options.roundOffAmount ?? 0);
  const lineTotal = roundMoney(sum(calculated.map((line) => line.amount)));
  const shippingTotal = shippingTax ? shippingTax.amount : shippingAmount;
  const total = roundMoney(lineTotal.plus(shippingTotal).plus(roundOffAmount));

  return {
    subtotal,
    netSubtotal,
    discountAmount,
    taxableAmount,
    shippingAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount,
    roundOffAmount,
    total,
    isInterState: interstate,
    lines: calculated,
  };
}
