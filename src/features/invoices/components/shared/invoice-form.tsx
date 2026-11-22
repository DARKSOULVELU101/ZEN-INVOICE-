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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorSummary, FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { formatMoney } from "@/lib/format/format";
import { ROUTES, APP } from "@/config/app";
import { calculateInvoiceTotals } from "../../domain/totals";
import { invoiceFormSchema, type InvoiceFormValues } from "../../schemas/invoice";
import type { InvoiceFormOptions } from "../../server/form-options";
import type { InvoiceDetail } from "../../types/invoice";
import {
  createInvoiceAction, sendInvoiceAction, updateInvoiceAction,
} from "../../actions/invoice-actions";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultInvoiceValues(options: InvoiceFormOptions): InvoiceFormValues {
  const today = new Date();
  const due = new Date(today.getTime() + APP.defaultInvoiceDueDays * 86_400_000);
  return {
    customerId: options.customers[0]?.id ?? "",
    currencyCode: options.currencyCode,
    issueDate: toIsoDate(today),
    dueDate: toIsoDate(due),
    reference: "",
    notes: "",
    terms: "",
    footer: "",
    lines: [
      { description: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxable: true, taxIds: [] },
    ],
  };
}

function lineValuesFromDetail(detail: InvoiceDetail): InvoiceFormValues["lines"] {
  if (detail.items.length === 0) return defaultInvoiceValues({ customers: [], products: [], taxes: [], currencyCode: detail.currencyCode }).lines;
  return detail.items.map((item) => ({
    productId: item.productId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountPercent: item.discountPercent,
    taxable: item.taxable,
    taxIds: item.taxes.map((tax) => tax.id),
  }));
}

type Intent = "save" | "send";

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

  const defaultValues = React.useMemo<InvoiceFormValues>(
    () =>
      detail
        ? {
            customerId: detail.customerId,
            currencyCode: detail.currencyCode,
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
  const { control, register, watch, setValue, setError, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const watched = watch();
  const currency = watched.currencyCode || options.currencyCode;

  const totals = React.useMemo(() => {
    try {
      return calculateInvoiceTotals(
        (watched.lines ?? []).map((line) => ({
          quantity: line.quantity || "0",
          unitPrice: line.unitPrice || "0",
          discountPercent: line.discountPercent || "0",
          taxes: line.taxable === false
            ? []
            : (line.taxIds ?? []).flatMap((id) => {
                const tax = options.taxes.find((item) => item.id === id);
                return tax ? [{ rate: tax.rate, isCompound: tax.isCompound }] : [];
              }),
        })),
      );
    } catch {
      return null;
    }
  }, [watched.lines, options.taxes]);

  const submit = async (values: InvoiceFormValues, selectedIntent: Intent) => {
    setIntentError(null);
    setSubmitting(selectedIntent);

    const result =
      mode === "create"
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
            <Select
              value={watched.customerId || undefined}
              onValueChange={(value) => {
                setValue("customerId", value, { shouldValidate: true });
                const customer = options.customers.find((item) => item.id === value);
                if (customer?.currencyCode) setValue("currencyCode", customer.currencyCode);
              }}
            >
              <SelectTrigger id="customerId" aria-invalid={Boolean(formState.errors.customerId)}>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {options.customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>{customer.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Currency" htmlFor="currencyCode" required error={formState.errors.currencyCode?.message}>
            <Input
              id="currencyCode"
              maxLength={3}
              className="uppercase"
              {...register("currencyCode")}
              aria-invalid={Boolean(formState.errors.currencyCode)}
            />
          </FormField>

          <FormField label="Issue date" htmlFor="issueDate" required error={formState.errors.issueDate?.message}>
            <Input id="issueDate" type="date" {...register("issueDate")} aria-invalid={Boolean(formState.errors.issueDate)} />
          </FormField>

          <FormField label="Due date" htmlFor="dueDate" required error={formState.errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register("dueDate")} aria-invalid={Boolean(formState.errors.dueDate)} />
          </FormField>

          <FormField label="Reference" htmlFor="reference" className="sm:col-span-2" error={formState.errors.reference?.message}>
            <Input id="reference" placeholder="PO number or your reference" {...register("reference")} />
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
            onClick={() =>
              append({ description: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxable: true, taxIds: [] })
            }
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
                <div className="md:col-span-4">
                  <FormField
                    label={`Description ${index + 1}`}
                    htmlFor={`lines.${index}.description`}
                    error={formState.errors.lines?.[index]?.description?.message}
                  >
                    <Select
                      value={watched.lines?.[index]?.productId ?? undefined}
                      onValueChange={(value) => {
                        const product = options.products.find((item) => item.id === value);
                        setValue(`lines.${index}.productId`, value, { shouldValidate: true });
                        if (product) {
                          setValue(`lines.${index}.description`, product.label, { shouldValidate: true });
                          setValue(`lines.${index}.unitPrice`, product.unitPrice, { shouldValidate: true });
                          setValue(`lines.${index}.taxable`, product.isTaxable, { shouldValidate: true });
                        }
                      }}
                    >
                      <SelectTrigger className="mb-2" aria-label={`Product for line ${index + 1}`}>
                        <SelectValue placeholder="Select a product (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.label} · {product.unitPrice} {product.currencyCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id={`lines.${index}.description`}
                      placeholder="What was sold?"
                      {...register(`lines.${index}.description`)}
                      aria-invalid={Boolean(formState.errors.lines?.[index]?.description)}
                    />
                  </FormField>
                </div>

                <div className="md:col-span-2">
                  <FormField label="Qty" htmlFor={`lines.${index}.quantity`} error={formState.errors.lines?.[index]?.quantity?.message}>
                    <Input
                      id={`lines.${index}.quantity`}
                      inputMode="decimal"
                      {...register(`lines.${index}.quantity`)}
                      aria-invalid={Boolean(formState.errors.lines?.[index]?.quantity)}
                    />
                  </FormField>
                </div>

                <div className="md:col-span-2">
                  <FormField label="Unit price" htmlFor={`lines.${index}.unitPrice`} error={formState.errors.lines?.[index]?.unitPrice?.message}>
                    <MoneyInput
                      id={`lines.${index}.unitPrice`}
                      value={watched.lines?.[index]?.unitPrice ?? "0"}
                      currency={currency}
                      onChange={(value) => setValue(`lines.${index}.unitPrice`, value, { shouldValidate: true })}
                    />
                  </FormField>
                </div>

                <div className="md:col-span-2">
                  <FormField label="Discount %" htmlFor={`lines.${index}.discountPercent`} error={formState.errors.lines?.[index]?.discountPercent?.message}>
                    <Input
                      id={`lines.${index}.discountPercent`}
                      inputMode="decimal"
                      {...register(`lines.${index}.discountPercent`)}
                      aria-invalid={Boolean(formState.errors.lines?.[index]?.discountPercent)}
                    />
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
                                setValue(`lines.${index}.taxIds`, next, { shouldValidate: true });
                              }}
                            />
                            {tax.label}
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
                      onCheckedChange={(checked) => setValue(`lines.${index}.taxable`, checked === true)}
                    />
                    Taxable
                  </label>
                  <div className="flex items-center gap-4">
                    <span className="num text-sm font-medium">
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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Additional information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
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
              <FormField
                label="Reason for change"
                htmlFor="changeReason"
                hint="Required when the invoice has already been issued."
                error={formState.errors.changeReason?.message}
              >
                <Input id="changeReason" {...register("changeReason")} />
              </FormField>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="num">{formatMoney(totals?.subtotal ?? 0, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="num">-{formatMoney(totals?.discountAmount ?? 0, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="num">{formatMoney(totals?.taxAmount ?? 0, currency)}</span>
            </div>
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="num">{formatMoney(totals?.total ?? 0, currency)}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">All amounts in {currency}.</p>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={Boolean(submitting)}>
          Cancel
        </Button>
        <Button type="submit" variant="outline" disabled={Boolean(submitting)}>
          {submitting === "save" ? "Saving…" : mode === "create" ? "Save draft" : "Save changes"}
        </Button>
        {mode === "create" ? (
          <Button type="button" onClick={onSaveAndSend} disabled={Boolean(submitting)}>
            <Check aria-hidden="true" />
            {submitting === "send" ? "Sending…" : "Save & send"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
