"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorSummary, FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { SearchableSelect, type SearchableOption } from "@/components/shared/searchable-select";
import { formatMoney } from "@/lib/format/format";
import { Decimal, roundMoney } from "@/lib/money/decimal";
import { ROUTES, APP } from "@/config/app";
import { calculateInvoiceTotals, calculateRoundOff } from "../../domain/totals";
import {
  invoiceFormSchema, SUPPORTED_CURRENCIES,
  type InvoiceFormValues,
} from "../../schemas/invoice";
import type { InvoiceFormOptions } from "../../server/form-options";
import type { CustomerOption } from "@/features/partners/types/customer";
import type { ProductOption } from "@/features/catalog/types/product";
import type { InvoiceDetail } from "../../types/invoice";
import {
  createInvoiceAction, saveDraftAction, sendInvoiceAction, updateInvoiceAction,
} from "../../actions/invoice-actions";
import { createCustomerAction, searchCustomersAction } from "@/features/partners/actions/customer-actions";
import { createProductAction, searchProductsAction } from "@/features/catalog/actions/product-actions";

type Currency = (typeof SUPPORTED_CURRENCIES)[number];
type Intent = "save" | "send";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultInvoiceValues(options: InvoiceFormOptions): InvoiceFormValues {
  const today = new Date();
  const due = new Date(today.getTime() + APP.defaultInvoiceDueDays * 86_400_000);
  return {
    customerId: "",
    currencyCode: options.currencyCode as Currency,
    gstin: options.organizationGstin,
    sourceStateCode: options.organizationStateCode,
    destinationStateCode: options.organizationStateCode,
    isReverseCharge: false,
    shippingAmount: "0",
    roundOffAmount: "0",
    issueDate: toIsoDate(today),
    dueDate: toIsoDate(due),
    reference: "",
    notes: "",
    terms: "",
    footer: "",
    lines: [
      {
        productId: "",
        description: "",
        quantity: "1",
        unitPrice: "0",
        discountPercent: "0",
        taxable: true,
        taxIds: [],
      },
    ],
  };
}

function lineValuesFromDetail(detail: InvoiceDetail): InvoiceFormValues["lines"] {
  if (detail.items.length === 0) return defaultInvoiceValues({
    customers: [], products: [], taxes: [], currencyCode: detail.currencyCode,
    exchangeRates: [], organizationStateCode: null, organizationGstin: null,
  }).lines;
  return detail.items.map((item) => ({
    productId: item.productId ?? "",
    hsnSac: item.hsnSac,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountPercent: item.discountPercent,
    taxable: item.taxable,
    taxIds: item.taxes.map((tax) => tax.id),
  }));
}

function moneyString(value: number | string): string {
  try {
    return roundMoney(value).toString();
  } catch {
    return "0";
  }
}

export function InvoiceForm({
  options,
  mode,
  detail,
}: {
  options: InvoiceFormOptions;
  mode: "create" | "edit";
  detail?: InvoiceDetail;
}) {
  const router = useRouter();
  const [intentError, setIntentError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState<Intent | null>(null);
  const [customerOptions, setCustomerOptions] = React.useState<CustomerOption[]>(options.customers);
  const [productOptions, setProductOptions] = React.useState<ProductOption[]>(options.products);
  const [customerResults, setCustomerResults] = React.useState<CustomerOption[]>(options.customers);
  const [productResults, setProductResults] = React.useState<ProductOption[]>(options.products);
  const [customerDialogOpen, setCustomerDialogOpen] = React.useState(false);
  const [productDialogOpen, setProductDialogOpen] = React.useState(false);
  const [newCustomer, setNewCustomer] = React.useState({ displayName: "", email: "", stateCode: "", gstin: "" });
  const [newProduct, setNewProduct] = React.useState({
    name: "", sku: "", salePrice: "0", hsnSac: "", currencyCode: "INR" as Currency,
  });
  const [draftId, setDraftId] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [autoRoundOff, setAutoRoundOff] = React.useState(false);
  const lastSavedRef = React.useRef<string>("");

  const defaultValues = React.useMemo<InvoiceFormValues>(
    () =>
      detail
        ? {
            customerId: detail.customerId,
            currencyCode: detail.currencyCode as Currency,
            gstin: detail.gstin,
            sourceStateCode: detail.sourceStateCode,
            destinationStateCode: detail.destinationStateCode,
            isReverseCharge: detail.isReverseCharge,
            shippingAmount: detail.shippingAmount,
            roundOffAmount: detail.roundOffAmount,
            version: detail.version,
            issueDate: detail.issueDate,
            dueDate: detail.dueDate,
            reference: detail.reference ?? "",
            notes: detail.notes ?? "",
            terms: detail.terms ?? "",
            footer: detail.footer ?? "",
            lines: lineValuesFromDetail(detail),
          }
        : defaultInvoiceValues(options),
    [detail, options],
  );

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema) as Resolver<InvoiceFormValues>,
    defaultValues,
    mode: "onBlur",
  });
  const { control, register, watch, setValue, getValues, setError, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const watched = watch();
  const currency = watched.currencyCode ?? options.currencyCode;

  const convertPrice = React.useCallback(
    (amount: string, from: string, to: string): string => {
      if (from === to) return moneyString(amount);
      const direct = options.exchangeRates.find((rate) => rate.fromCurrencyCode === from && rate.toCurrencyCode === to);
      if (direct) return roundMoney(new Decimal(amount).times(direct.rate)).toString();
      const base = options.currencyCode;
      const fromToBase = options.exchangeRates.find((rate) => rate.fromCurrencyCode === from && rate.toCurrencyCode === base);
      const baseToTarget = options.exchangeRates.find((rate) => rate.fromCurrencyCode === base && rate.toCurrencyCode === to);
      if (fromToBase && baseToTarget && base !== from) {
        return roundMoney(new Decimal(amount).div(fromToBase.rate).times(baseToTarget.rate)).toString();
      }
      return moneyString(amount);
    },
    [options.currencyCode, options.exchangeRates],
  );

  const applyCurrency = React.useCallback(
    (next: Currency) => {
      if (next === watched.currencyCode) return;
      setValue("currencyCode", next, { shouldDirty: true, shouldValidate: true });
      for (const [index, line] of getValues("lines").entries()) {
        const product = productOptions.find((item) => item.id === line.productId);
        if (product) {
          setValue(
            `lines.${index}.unitPrice`,
            convertPrice(product.unitPrice, product.currencyCode, next),
            { shouldDirty: true },
          );
        }
      }
    },
    [convertPrice, getValues, productOptions, setValue, watched.currencyCode],
  );

  const sourceStateCode = watched.sourceStateCode ?? options.organizationStateCode;
  const destinationStateCode = watched.destinationStateCode ?? options.organizationStateCode;

  const buildTotals = React.useCallback(
    (roundOffAmount: string) =>
      calculateInvoiceTotals(
        (watched.lines ?? []).map((line) => ({
          quantity: line.quantity || "0",
          unitPrice: line.unitPrice || "0",
          discountPercent: line.discountPercent || "0",
          taxes: line.taxable === false
            ? []
            : (line.taxIds ?? []).flatMap((id) => {
                const tax = options.taxes.find((item) => item.id === id);
                return tax
                  ? [{
                      rate: tax.rate,
                      component: tax.component,
                      type: tax.type,
                      isCompound: tax.isCompound,
                      isInclusive: tax.isInclusive,
                    }]
                  : [];
              }),
        })),
        {
          shippingAmount: watched.shippingAmount || "0",
          roundOffAmount,
          sourceStateCode,
          destinationStateCode,
        },
      ),
    [destinationStateCode, options.taxes, sourceStateCode, watched.lines, watched.shippingAmount],
  );

  const totals = React.useMemo(() => {
    try {
      const initial = buildTotals("0");
      if (!autoRoundOff) return initial;
      const suggested = calculateRoundOff(initial.total).toString();
      return buildTotals(suggested);
    } catch {
      return null;
    }
  }, [autoRoundOff, buildTotals]);

  const searchCustomerOptions = React.useCallback(
    async (query: string): Promise<SearchableOption[]> => {
      const result = await searchCustomersAction({ q: query, limit: 20 });
      if (!result.ok) return [];
      setCustomerResults(result.data);
      return result.data.map((item) => ({
        id: item.id,
        label: item.label,
        secondary: [item.email, item.stateCode].filter(Boolean).join(" · ") || null,
      }));
    },
    [],
  );

  const searchProductOptions = React.useCallback(
    async (query: string): Promise<SearchableOption[]> => {
      const result = await searchProductsAction({ q: query, limit: 20 });
      if (!result.ok) return [];
      setProductResults(result.data);
      return result.data.map((item) => ({
        id: item.id,
        label: item.label,
        secondary: `${item.sku} · ${item.unitPrice} ${item.currencyCode}`,
      }));
    },
    [],
  );

  const submit = async (values: InvoiceFormValues, selectedIntent: Intent) => {
    setIntentError(null);
    setSubmitting(selectedIntent);
    const result = mode === "create"
      ? await createInvoiceAction(values)
      : await updateInvoiceAction(detail!.id, values, detail!.version);

    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        if (messages[0]) setError(field as never, { type: "server", message: messages[0] });
      }
      setIntentError(result.error.message);
      setSubmitting(null);
      return;
    }

    if (selectedIntent === "send" && mode === "create") {
      const sent = await sendInvoiceAction(result.data.id);
      if (!sent.ok) {
        toast.error(sent.error.message);
        setSubmitting(null);
        router.push(ROUTES.invoiceDetail(result.data.id));
        return;
      }
    }

    toast.success(mode === "create" ? "Invoice created" : "Invoice updated");
    router.push(ROUTES.invoiceDetail(result.data.id));
    router.refresh();
  };

  const onSave = form.handleSubmit((values) => submit(values, "save"));
  const onSaveAndSend = form.handleSubmit((values) => submit(values, "send"));

  React.useEffect(() => {
    if (mode !== "create" || submitting) return;
    const signature = JSON.stringify(watched);
    if (!formState.isDirty || signature === lastSavedRef.current) return;
    if (!watched.customerId || (watched.lines ?? []).some((line) => !line.productId)) return;

    const timer = setTimeout(async () => {
      const result = await saveDraftAction(getValues(), draftId ?? undefined);
      if (result.ok) {
        lastSavedRef.current = signature;
        setDraftId(result.data.id);
        setSavedAt(new Date());
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [draftId, formState.isDirty, getValues, mode, submitting, watched]);

  const submitNewCustomer = async () => {
    const result = await createCustomerAction({
      displayName: newCustomer.displayName,
      email: newCustomer.email,
      currencyCode: currency,
      stateCode: newCustomer.stateCode ? newCustomer.stateCode : null,
      gstin: newCustomer.gstin ? newCustomer.gstin : null,
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setCustomerOptions((current) => [result.data, ...current]);
    setCustomerResults((current) => [result.data, ...current]);
    setValue("customerId", result.data.id, { shouldDirty: true, shouldValidate: true });
    setValue("destinationStateCode", result.data.stateCode ?? options.organizationStateCode, { shouldDirty: true });
    setValue("gstin", result.data.gstin ?? options.organizationGstin, { shouldDirty: true });
    if (result.data.currencyCode && SUPPORTED_CURRENCIES.includes(result.data.currencyCode as Currency)) {
      applyCurrency(result.data.currencyCode as Currency);
    }
    setCustomerDialogOpen(false);
    setNewCustomer({ displayName: "", email: "", stateCode: "", gstin: "" });
    toast.success("Customer created and selected");
  };

  const submitNewProduct = async () => {
    const result = await createProductAction({
      name: newProduct.name,
      sku: newProduct.sku,
      salePrice: newProduct.salePrice,
      currencyCode: newProduct.currencyCode,
      hsnSac: newProduct.hsnSac || null,
      unitOfMeasure: "ea",
      isTaxable: true,
    });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setProductOptions((current) => [result.data, ...current]);
    setProductResults((current) => [result.data, ...current]);
    const index = 0;
    setValue(`lines.${index}.productId`, result.data.id, { shouldDirty: true, shouldValidate: true });
    setValue(`lines.${index}.description`, result.data.label, { shouldDirty: true });
    setValue(`lines.${index}.unitPrice`, convertPrice(result.data.unitPrice, result.data.currencyCode, currency), { shouldDirty: true });
    setValue(`lines.${index}.hsnSac`, result.data.hsnSac, { shouldDirty: true });
    setValue(`lines.${index}.taxable`, result.data.isTaxable, { shouldDirty: true });
    setProductDialogOpen(false);
    setNewProduct({ name: "", sku: "", salePrice: "0", hsnSac: "", currencyCode: "INR" });
    toast.success("Product created and added to this line");
  };

  const errorEntries = Object.entries(formState.errors).filter(([, value]) => Boolean(value));
  const summaryErrors: Record<string, string | undefined> = { ...intentError ? { form: intentError } : {} };
  for (const [field, error] of errorEntries) {
    const message = (error as { message?: string } | undefined)?.message;
    if (message) summaryErrors[field] = message;
  }

  return (
    <form onSubmit={onSave} noValidate className="space-y-6">
      <ErrorSummary errors={summaryErrors} />

      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Customer" htmlFor="customerId" required error={formState.errors.customerId?.message}>
            <SearchableSelect
              ariaLabel="Customer"
              value={watched.customerId}
              options={customerOptions.map((item) => ({
                id: item.id, label: item.label, secondary: item.email ?? item.stateCode,
              }))}
              onSearch={searchCustomerOptions}
              onSelect={(option) => {
                const customer = [...customerOptions, ...customerResults].find((item) => item.id === option.id);
                if (!customer) return;
                setValue("customerId", customer.id, { shouldDirty: true, shouldValidate: true });
                setValue("destinationStateCode", customer.stateCode ?? options.organizationStateCode, { shouldDirty: true });
                setValue("gstin", customer.gstin ?? options.organizationGstin, { shouldDirty: true });
                if (customer.currencyCode && SUPPORTED_CURRENCIES.includes(customer.currencyCode as Currency)) {
                  applyCurrency(customer.currencyCode as Currency);
                }
              }}
              onCreate={() => setCustomerDialogOpen(true)}
              invalid={Boolean(formState.errors.customerId)}
            />
          </FormField>

          <FormField label="Currency" htmlFor="currencyCode" required error={formState.errors.currencyCode?.message}>
            <Select
              value={currency}
              onValueChange={(value) => applyCurrency(value as Currency)}
            >
              <SelectTrigger id="currencyCode" aria-invalid={Boolean(formState.errors.currencyCode)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Issue date" htmlFor="issueDate" required error={formState.errors.issueDate?.message}>
            <Input id="issueDate" type="date" {...register("issueDate")} aria-invalid={Boolean(formState.errors.issueDate)} />
          </FormField>

          <FormField label="Due date" htmlFor="dueDate" required error={formState.errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register("dueDate")} aria-invalid={Boolean(formState.errors.dueDate)} />
          </FormField>

          <FormField label="GSTIN" htmlFor="gstin" error={formState.errors.gstin?.message}>
            <Input id="gstin" maxLength={15} placeholder="27AABCZ1234M1Z5" {...register("gstin")} />
          </FormField>

          <FormField label="Source state" htmlFor="sourceStateCode" error={formState.errors.sourceStateCode?.message}>
            <Input id="sourceStateCode" maxLength={2} placeholder="MH" {...register("sourceStateCode")} />
          </FormField>

          <FormField label="Place of supply" htmlFor="destinationStateCode" error={formState.errors.destinationStateCode?.message}>
            <Input id="destinationStateCode" maxLength={2} placeholder="KA" {...register("destinationStateCode")} />
          </FormField>

          <FormField label="Reference" htmlFor="reference" error={formState.errors.reference?.message}>
            <Input id="reference" placeholder="PO number" {...register("reference")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Line items</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({
              productId: "", description: "", quantity: "1", unitPrice: "0",
              discountPercent: "0", taxable: true, taxIds: [],
            })}
          >
            <Plus aria-hidden="true" /> Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {formState.errors.lines?.message ? (
            <p role="alert" className="text-sm font-medium text-destructive">{formState.errors.lines.message}</p>
          ) : null}

          {fields.map((field, index) => {
            const lineTaxIds = watched.lines?.[index]?.taxIds ?? [];
            return (
              <div
                key={field.id}
                className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-12 md:items-start"
                aria-label={`Line item ${index + 1}`}
              >
                <div className="md:col-span-4 space-y-2">
                  <SearchableSelect
                    ariaLabel={`Product for line ${index + 1}`}
                    value={watched.lines?.[index]?.productId}
                    options={productOptions.map((item) => ({
                      id: item.id, label: item.label, secondary: `${item.sku} · ${item.unitPrice} ${item.currencyCode}`,
                    }))}
                    onSearch={searchProductOptions}
                    onSelect={(option) => {
                      const product = [...productOptions, ...productResults].find((item) => item.id === option.id);
                      if (!product) return;
                      setValue(`lines.${index}.productId`, product.id, { shouldDirty: true, shouldValidate: true });
                      setValue(`lines.${index}.description`, product.label, { shouldDirty: true });
                      setValue(
                        `lines.${index}.unitPrice`,
                        convertPrice(product.unitPrice, product.currencyCode, currency),
                        { shouldDirty: true },
                      );
                      setValue(`lines.${index}.hsnSac`, product.hsnSac, { shouldDirty: true });
                      setValue(`lines.${index}.taxable`, product.isTaxable, { shouldDirty: true });
                      const gstTax = options.taxes.find((tax) => tax.type === "GST");
                      if (product.isTaxable && gstTax) {
                        setValue(`lines.${index}.taxIds`, [gstTax.id], { shouldDirty: true });
                      }
                    }}
                    invalid={Boolean(formState.errors.lines?.[index]?.productId)}
                  />
                  <Input
                    id={`lines.${index}.description`}
                    placeholder="Description"
                    {...register(`lines.${index}.description`)}
                    aria-invalid={Boolean(formState.errors.lines?.[index]?.description)}
                  />
                  {formState.errors.lines?.[index]?.productId?.message ? (
                    <p className="text-xs text-destructive">{formState.errors.lines[index]?.productId?.message}</p>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <FormField label="Qty" htmlFor={`lines.${index}.quantity`} error={formState.errors.lines?.[index]?.quantity?.message}>
                    <Input id={`lines.${index}.quantity`} inputMode="decimal" {...register(`lines.${index}.quantity`)} />
                  </FormField>
                </div>

                <div className="md:col-span-2">
                  <FormField label="Unit price" htmlFor={`lines.${index}.unitPrice`} error={formState.errors.lines?.[index]?.unitPrice?.message}>
                    <MoneyInput
                      id={`lines.${index}.unitPrice`}
                      value={watched.lines?.[index]?.unitPrice ?? "0"}
                      currency={currency}
                      onChange={(value) => setValue(`lines.${index}.unitPrice`, value, { shouldDirty: true })}
                    />
                  </FormField>
                </div>

                <div className="md:col-span-2">
                  <FormField label="Discount %" htmlFor={`lines.${index}.discountPercent`} error={formState.errors.lines?.[index]?.discountPercent?.message}>
                    <Input id={`lines.${index}.discountPercent`} inputMode="decimal" {...register(`lines.${index}.discountPercent`)} />
                  </FormField>
                </div>

                <div className="md:col-span-2">
                  <span className="mb-1.5 block text-sm font-medium">Taxes</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="w-full justify-between">
                        {lineTaxIds.length ? `${lineTaxIds.length} selected` : "Add tax"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 space-y-2">
                      {options.taxes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No taxes configured.</p>
                      ) : (
                        options.taxes.map((tax) => (
                          <label key={tax.id} className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={lineTaxIds.includes(tax.id)}
                              onCheckedChange={(checked) => {
                                const next = checked === true
                                  ? [...lineTaxIds, tax.id]
                                  : lineTaxIds.filter((id) => id !== tax.id);
                                setValue(`lines.${index}.taxIds`, next, { shouldDirty: true, shouldValidate: true });
                              }}
                            />
                            {tax.component && tax.component !== "GST" ? `${tax.component} · ` : ""}{tax.label}
                          </label>
                        ))
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center justify-between md:col-span-12">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={watched.lines?.[index]?.taxable ?? true}
                      onCheckedChange={(checked) => setValue(`lines.${index}.taxable`, checked === true, { shouldDirty: true })}
                    />
                    Taxable
                  </label>
                  <div className="flex items-center gap-4">
                    <span className="num text-sm font-medium" aria-live="polite">
                      {formatMoney(totals?.lines[index]?.amount ?? 0, currency)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader><CardTitle>Additional information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Shipping" htmlFor="shippingAmount" error={formState.errors.shippingAmount?.message}>
                <MoneyInput
                  id="shippingAmount"
                  value={watched.shippingAmount ?? "0"}
                  currency={currency}
                  onChange={(value) => setValue("shippingAmount", value, { shouldDirty: true })}
                />
              </FormField>
              <FormField label="Round off" htmlFor="roundOffAmount" error={formState.errors.roundOffAmount?.message}>
                <MoneyInput
                  id="roundOffAmount"
                  value={autoRoundOff ? (totals?.roundOffAmount.toString() ?? "0") : (watched.roundOffAmount ?? "0")}
                  currency={currency}
                  onChange={(value) => {
                    setAutoRoundOff(false);
                    setValue("roundOffAmount", value, { shouldDirty: true });
                  }}
                />
              </FormField>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={autoRoundOff} onCheckedChange={(checked) => setAutoRoundOff(checked === true)} />
              Round total to nearest whole number
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={watched.isReverseCharge ?? false}
                onCheckedChange={(checked) => setValue("isReverseCharge", checked === true, { shouldDirty: true })}
              />
              Reverse charge
            </label>
            <FormField label="Notes" htmlFor="notes" error={formState.errors.notes?.message}>
              <Textarea id="notes" rows={3} {...register("notes")} />
            </FormField>
            <FormField label="Terms" htmlFor="terms" error={formState.errors.terms?.message}>
              <Textarea id="terms" rows={2} {...register("terms")} />
            </FormField>
            <FormField label="Footer" htmlFor="footer" error={formState.errors.footer?.message}>
              <Input id="footer" {...register("footer")} />
            </FormField>
            {mode === "edit" ? (
              <FormField label="Reason for change" htmlFor="changeReason" error={formState.errors.changeReason?.message}>
                <Input id="changeReason" {...register("changeReason")} />
              </FormField>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3" aria-live="polite">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="num">{formatMoney(totals?.subtotal ?? 0, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="num">-{formatMoney(totals?.discountAmount ?? 0, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxable amount</span>
              <span className="num">{formatMoney(totals?.taxableAmount ?? 0, currency)}</span>
            </div>
            {totals?.isInterState ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IGST</span>
                <span className="num">{formatMoney(totals.igstAmount, currency)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">CGST</span>
                  <span className="num">{formatMoney(totals?.cgstAmount ?? 0, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">SGST</span>
                  <span className="num">{formatMoney(totals?.sgstAmount ?? 0, currency)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span className="num">{formatMoney(totals?.shippingAmount ?? 0, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Round off</span>
              <span className="num">{formatMoney(totals?.roundOffAmount ?? 0, currency)}</span>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <span>Grand total</span>
              <span className="num">{formatMoney(totals?.total ?? 0, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {savedAt ? `Draft saved ${savedAt.toLocaleTimeString()}.` : `All amounts in ${currency}.`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={Boolean(submitting)}>
          Cancel
        </Button>
        <Button type="submit" variant="outline" disabled={Boolean(submitting)}>
          {submitting === "save" ? "Saving…" : mode === "create" ? (draftId ? "Update draft" : "Save draft") : "Save changes"}
        </Button>
        {mode === "create" ? (
          <Button type="button" onClick={onSaveAndSend} disabled={Boolean(submitting)}>
            <Check aria-hidden="true" />
            {submitting === "send" ? "Sending…" : "Save & send"}
          </Button>
        ) : null}
      </div>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input
              aria-label="Customer name"
              placeholder="Customer name"
              value={newCustomer.displayName}
              onChange={(event) => setNewCustomer((current) => ({ ...current, displayName: event.target.value }))}
            />
            <Input
              aria-label="Customer email"
              type="email"
              placeholder="Email"
              value={newCustomer.email}
              onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                aria-label="Customer state code"
                maxLength={2}
                placeholder="State (MH)"
                value={newCustomer.stateCode}
                onChange={(event) => setNewCustomer((current) => ({ ...current, stateCode: event.target.value.toUpperCase() }))}
              />
              <Input
                aria-label="Customer GSTIN"
                maxLength={15}
                placeholder="GSTIN"
                value={newCustomer.gstin}
                onChange={(event) => setNewCustomer((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomerDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={submitNewCustomer}>Create & select</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create product</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input
              aria-label="Product name"
              placeholder="Product name"
              value={newProduct.name}
              onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              aria-label="SKU"
              placeholder="SKU"
              value={newProduct.sku}
              onChange={(event) => setNewProduct((current) => ({ ...current, sku: event.target.value.toUpperCase() }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput
                id="newProductPrice"
                value={newProduct.salePrice}
                currency={newProduct.currencyCode}
                onChange={(value) => setNewProduct((current) => ({ ...current, salePrice: value }))}
              />
              <Input
                aria-label="HSN or SAC"
                placeholder="HSN/SAC"
                value={newProduct.hsnSac}
                onChange={(event) => setNewProduct((current) => ({ ...current, hsnSac: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={submitNewProduct}>Create & add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
