"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Eye, FileText, Plus, Printer, Trash2 } from "lucide-react";
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
import { ErrorSummary, FormField } from "@/components/shared/form-field";
import { PageShell, BreadcrumbTrail } from "@/components/shared/page-shell";
import {
  ComputedField, SectionCard, SummaryPanel, SummaryRow,
} from "@/components/shared/section-card";
import { MoneyInput } from "@/components/shared/money-input";
import { SearchableSelect, type SearchableOption } from "@/components/shared/searchable-select";
import { formatMoney } from "@/lib/format/format";
import { Decimal, roundMoney } from "@/lib/money/decimal";
import { ROUTES } from "@/config/app";
import {
  deriveInvoiceDates, parseCalendarDate, toCalendarDateInput,
} from "../../domain/dates";
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
  createInvoiceAction, downloadInvoicePdfAction, previewInvoicePdfAction,
  saveDraftAction, sendInvoiceAction, updateInvoiceAction,
} from "../../actions/invoice-actions";
import { createCustomerAction, searchCustomersAction } from "@/features/partners/actions/customer-actions";
import { createProductAction, searchProductsAction } from "@/features/catalog/actions/product-actions";

type Currency = (typeof SUPPORTED_CURRENCIES)[number];
type Intent = "save" | "send";

export function defaultInvoiceValues(options: InvoiceFormOptions): InvoiceFormValues {
  return {
    customerId: "",
    currencyCode: options.currencyCode as Currency,
    gstin: options.organizationGstin,
    sourceStateCode: options.organizationStateCode,
    destinationStateCode: options.organizationStateCode,
    isReverseCharge: false,
    shippingAmount: "0",
    roundOffAmount: "0",
    invoiceDate: options.today,
    paymentTerms: options.paymentTermsDays,
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
    paymentTermsDays: detail.paymentTerms, today: detail.invoiceDate,
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
  const draftVersionRef = React.useRef<number | null>(null);
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
            invoiceDate: detail.invoiceDate,
            paymentTerms: detail.paymentTerms,
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
  const derivedDates = React.useMemo(() => {
    const invoiceDate = parseCalendarDate(watched.invoiceDate);
    if (!invoiceDate) return null;
    return deriveInvoiceDates(invoiceDate, watched.paymentTerms ?? options.paymentTermsDays);
  }, [options.paymentTermsDays, watched.invoiceDate, watched.paymentTerms]);

  const convertPrice = React.useCallback(
    (amount: string, from: string, to: string): string => {
      if (from === to) return moneyString(amount);
      const direct = options.exchangeRates.find((rate) => rate.fromCurrencyCode === from && rate.toCurrencyCode === to);
      if (direct) return roundMoney(new Decimal(amount).times(direct.rate)).toString();
      const base = options.currencyCode;
      const fromToBase = options.exchangeRates.find((rate) => rate.fromCurrencyCode === from && rate.toCurrencyCode === base);
      const baseToTarget = options.exchangeRates.find((rate) => rate.fromCurrencyCode === base && rate.toCurrencyCode === to);
      if (fromToBase && baseToTarget) {
        return roundMoney(new Decimal(amount).times(fromToBase.rate).times(baseToTarget.rate)).toString();
      }
      setError("currencyCode", {
        type: "manual",
        message: `No exchange rate is configured for ${from} to ${to}.`,
      });
      return moneyString(amount);
    },
    [options.currencyCode, options.exchangeRates, setError],
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

  const effectiveRoundOff = autoRoundOff
    ? totals?.roundOffAmount.toString() ?? "0"
    : watched.roundOffAmount ?? "0";

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
    const payload: InvoiceFormValues = { ...values, roundOffAmount: effectiveRoundOff };
    const result = mode === "create"
      ? draftId && draftVersionRef.current
        ? await updateInvoiceAction(draftId, payload, draftVersionRef.current)
        : await createInvoiceAction(payload)
      : await updateInvoiceAction(detail!.id, payload, detail!.version);

    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        if (messages[0]) setError(field as never, { type: "server", message: messages[0] });
      }
      setIntentError(result.error.message);
      setSubmitting(null);
      return;
    }

    if (selectedIntent === "send") {
      const sent = await sendInvoiceAction(result.data.id);
      if (!sent.ok) {
        setIntentError(sent.error.message);
        toast.error("Invoice saved. Email not delivered.", { description: sent.error.message });
        setSubmitting(null);
        router.push(ROUTES.invoiceDetail(result.data.id));
        return;
      }
      toast.success("Invoice sent with PDF", { description: "Delivered to the customer by email." });
      router.push(ROUTES.invoiceDetail(result.data.id));
      router.refresh();
      return;
    }

    toast.success(mode === "create" ? "Invoice created" : "Invoice updated");
    router.push(ROUTES.invoiceDetail(result.data.id));
    router.refresh();
  };

  const onSave = form.handleSubmit((values) => submit(values, "save"));
  const onSaveAndSend = form.handleSubmit((values) => submit(values, "send"));

  const savedInvoiceId = mode === "edit" ? detail?.id : draftId;

  const openPreview = async () => {
    if (!savedInvoiceId) return;
    setSubmitting("save");
    const result = await previewInvoicePdfAction(savedInvoiceId);
    setSubmitting(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  };

  const exportPdf = async () => {
    if (!savedInvoiceId) return;
    setSubmitting("save");
    const result = await downloadInvoicePdfAction(savedInvoiceId);
    setSubmitting(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const link = document.createElement("a");
    link.href = result.data.url;
    link.download = `${result.data.filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const printPdf = () => {
    if (!savedInvoiceId) return;
    window.open(`/invoices/${savedInvoiceId}/print`, "_blank", "noopener,noreferrer");
  };

  React.useEffect(() => {
    if (mode !== "create" || submitting) return;
    const snapshot = { ...watched, roundOffAmount: effectiveRoundOff, version: undefined };
    const signature = JSON.stringify(snapshot);
    if (!formState.isDirty || signature === lastSavedRef.current) return;
    if (!watched.customerId || (watched.lines ?? []).some((line) => !line.productId)) return;

    const timer = setTimeout(async () => {
      const values = getValues();
      const result = await saveDraftAction(
        { ...values, roundOffAmount: effectiveRoundOff },
        draftId ?? undefined,
      );
      if (result.ok) {
        lastSavedRef.current = signature;
        setDraftId(result.data.id);
        draftVersionRef.current = result.data.version;
        setValue("version", result.data.version);
        setSavedAt(new Date());
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [draftId, effectiveRoundOff, formState.isDirty, getValues, mode, setValue, submitting, watched]);

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
    <PageShell
      title={mode === "create" ? "New invoice" : `Edit ${detail?.invoiceNumber ?? "invoice"}`}
      description={mode === "create"
        ? "Build an invoice with GST-aware totals and a reviewable payment schedule."
        : `Update ${detail?.invoiceNumber ?? "this invoice"} while preserving its audit trail.`}
      breadcrumb={
        <BreadcrumbTrail items={[
          { label: "Sales", href: ROUTES.invoices },
          { label: "Invoices", href: ROUTES.invoices },
          { label: mode === "create" ? "New invoice" : "Edit" },
        ]} />
      }
      actions={mode === "edit" && detail ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={ROUTES.invoiceDetail(detail.id)}>Back to invoice</Link>
        </Button>
      ) : undefined}
    >
      <form onSubmit={onSave} noValidate className="space-y-6">
        <ErrorSummary errors={summaryErrors} />

        <SectionCard title="Invoice information" description="Choose the customer, currency and payment timing.">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <FormField label="Customer" htmlFor="customerId" required error={formState.errors.customerId?.message}>
              <SearchableSelect
                id="customerId"
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
              <Select value={currency} onValueChange={(value) => applyCurrency(value as Currency)}>
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

            <FormField label="Invoice date" htmlFor="invoiceDate" required error={formState.errors.invoiceDate?.message}>
              <Input id="invoiceDate" type="date" {...register("invoiceDate")} aria-invalid={Boolean(formState.errors.invoiceDate)} />
            </FormField>

            <FormField label="Payment terms" htmlFor="paymentTerms" required error={formState.errors.paymentTerms?.message}>
              <Select
                value={String(watched.paymentTerms ?? options.paymentTermsDays)}
                onValueChange={(value) => setValue("paymentTerms", Number(value), { shouldDirty: true, shouldValidate: true })}
              >
                <SelectTrigger id="paymentTerms" aria-invalid={Boolean(formState.errors.paymentTerms)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 7, 10, 15, 30, 45, 60, 90].map((days) => (
                    <SelectItem key={days} value={String(days)}>{days} days</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <ComputedField
              label="Issue date"
              value={derivedDates ? toCalendarDateInput(derivedDates.issueDate) : ""}
            />

            <ComputedField
              label="Due date"
              value={derivedDates ? toCalendarDateInput(derivedDates.dueDate) : ""}
            />

            <FormField label="Reference" htmlFor="reference" error={formState.errors.reference?.message}>
              <Input id="reference" placeholder="PO number" {...register("reference")} />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="Tax & place of supply" description="Ensure GST is calculated with the correct jurisdiction.">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label="GSTIN" htmlFor="gstin" error={formState.errors.gstin?.message}>
              <Input id="gstin" maxLength={15} placeholder="27AABCZ1234M1Z5" {...register("gstin")} />
            </FormField>

            <FormField label="Source state" htmlFor="sourceStateCode" error={formState.errors.sourceStateCode?.message}>
              <Input id="sourceStateCode" maxLength={2} placeholder="MH" {...register("sourceStateCode")} />
            </FormField>

            <FormField label="Place of supply" htmlFor="destinationStateCode" error={formState.errors.destinationStateCode?.message}>
              <Input id="destinationStateCode" maxLength={2} placeholder="KA" {...register("destinationStateCode")} />
            </FormField>

            <div className="space-y-1.5">
              <span className="ui-label">Reverse charge</span>
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-control border bg-background px-3 text-sm">
                <Checkbox
                  checked={watched.isReverseCharge ?? false}
                  onCheckedChange={(checked) => setValue("isReverseCharge", checked === true, { shouldDirty: true })}
                />
                Applicable
              </label>
            </div>
          </div>
        </SectionCard>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6 min-w-0">
            <SectionCard
              title="Line items"
              description="Products, quantities and taxes applied to this invoice."
              actions={
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
              }
              contentClassName="space-y-4 p-4 sm:p-6"
            >
              <div className="space-y-4">
          {formState.errors.lines?.message ? (
            <p role="alert" className="text-sm font-medium text-destructive">{formState.errors.lines.message}</p>
          ) : null}

          {fields.map((field, index) => {
            const lineTaxIds = watched.lines?.[index]?.taxIds ?? [];
            return (
              <div
                key={field.id}
                className="grid gap-4 rounded-panel border bg-background p-4 md:grid-cols-12 md:items-start"
                aria-label={`Line item ${index + 1}`}
              >
                <div className="md:col-span-4 space-y-2">
                  <SearchableSelect
                    id={`lines.${index}.productId`}
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
              </div>
            </SectionCard>

            <SectionCard title="Charges & instructions" description="Optional adjustments and customer-facing text.">
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
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
                      value={effectiveRoundOff}
                      currency={currency}
                      onChange={(value) => {
                        setAutoRoundOff(false);
                        setValue("roundOffAmount", value, { shouldDirty: true });
                      }}
                    />
                  </FormField>
                </div>

                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={autoRoundOff} onCheckedChange={(checked) => setAutoRoundOff(checked === true)} />
                  Round total to nearest whole number
                </label>

                <div className="ui-divider" />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="Notes" htmlFor="notes" error={formState.errors.notes?.message}>
                    <Textarea id="notes" rows={3} {...register("notes")} />
                  </FormField>
                  <FormField label="Terms" htmlFor="terms" error={formState.errors.terms?.message}>
                    <Textarea id="terms" rows={3} {...register("terms")} />
                  </FormField>
                  <FormField label="Footer" htmlFor="footer" error={formState.errors.footer?.message}>
                    <Input id="footer" {...register("footer")} />
                  </FormField>
                  {mode === "edit" ? (
                    <FormField label="Reason for change" htmlFor="changeReason" error={formState.errors.changeReason?.message}>
                      <Input id="changeReason" {...register("changeReason")} />
                    </FormField>
                  ) : null}
                </div>
              </div>
            </SectionCard>
          </div>

          <SummaryPanel title="Invoice summary" className="xl:sticky xl:top-20">
            <div className="space-y-3" aria-live="polite">
              <SummaryRow label="Subtotal" value={formatMoney(totals?.subtotal ?? 0, currency)} muted />
              <SummaryRow label="Discount" value={`-${formatMoney(totals?.discountAmount ?? 0, currency)}`} muted />
              <SummaryRow label="Taxable amount" value={formatMoney(totals?.taxableAmount ?? 0, currency)} muted />
              {totals?.isInterState ? (
                <SummaryRow label="IGST" value={formatMoney(totals.igstAmount, currency)} muted />
              ) : (
                <>
                  <SummaryRow label="CGST" value={formatMoney(totals?.cgstAmount ?? 0, currency)} muted />
                  <SummaryRow label="SGST" value={formatMoney(totals?.sgstAmount ?? 0, currency)} muted />
                </>
              )}
              <SummaryRow label="Shipping" value={formatMoney(totals?.shippingAmount ?? 0, currency)} muted />
              <SummaryRow label="Round off" value={formatMoney(totals?.roundOffAmount ?? 0, currency)} muted />
              <SummaryRow label="Grand total" value={formatMoney(totals?.total ?? 0, currency)} emphasis />
            </div>
            <p className="text-xs text-muted-foreground">
              {savedAt ? `Draft saved ${savedAt.toLocaleTimeString()}.` : `All amounts in ${currency}.`}
            </p>
          </SummaryPanel>
        </div>

        <div className="sticky bottom-4 z-30 flex flex-col gap-3 rounded-panel border bg-background/95 p-3 shadow-sticky backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {savedAt
              ? `Draft saved at ${savedAt.toLocaleTimeString()}. Changes are saved locally until you submit.`
              : "Drafts save automatically after the customer and first line item are complete."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" onClick={openPreview} disabled={!savedInvoiceId || Boolean(submitting)}>
              <Eye aria-hidden="true" /> Preview PDF
            </Button>
            <Button type="button" variant="ghost" onClick={printPdf} disabled={!savedInvoiceId || Boolean(submitting)}>
              <Printer aria-hidden="true" /> Print
            </Button>
            <Button type="button" variant="ghost" onClick={() => void exportPdf()} disabled={!savedInvoiceId || Boolean(submitting)}>
              <FileText aria-hidden="true" /> Export PDF
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()} disabled={Boolean(submitting)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={Boolean(submitting)}>
              {submitting === "save" ? "Saving…" : mode === "create" ? (draftId ? "Update draft" : "Save draft") : "Save changes"}
            </Button>
            {mode === "create" || detail?.status === "DRAFT" ? (
              <Button type="button" onClick={onSaveAndSend} disabled={Boolean(submitting)}>
                <Check aria-hidden="true" />
                {submitting === "send" ? "Sending with PDF…" : mode === "create" ? "Save & send invoice" : "Send invoice"}
              </Button>
            ) : null}
          </div>
        </div>
      </form>

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
    </PageShell>
  );
}
