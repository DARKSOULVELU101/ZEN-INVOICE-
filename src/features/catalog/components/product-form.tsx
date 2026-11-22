"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { currencyCodeSchema } from "@/features/invoices/schemas/invoice";
import { createProductAction } from "../actions/product-actions";

export function ProductForm() {
  const [values, setValues] = React.useState({
    name: "",
    sku: "",
    salePrice: "0",
    currencyCode: "INR",
    hsnSac: "",
    isTaxable: true,
  });
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const result = await createProductAction({
      ...values,
      hsnSac: values.hsnSac || null,
      unitOfMeasure: "ea",
      currencyCode: currencyCodeSchema.parse(values.currencyCode),
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Product created");
    setValues({ name: "", sku: "", salePrice: "0", currencyCode: "INR", hsnSac: "", isTaxable: true });
  };

  return (
    <Card className="h-fit">
      <CardHeader><CardTitle>Add product</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Name" htmlFor="product-name" required>
            <Input
              id="product-name"
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </FormField>
          <FormField label="SKU" htmlFor="product-sku" required>
            <Input
              id="product-sku"
              value={values.sku}
              onChange={(event) => setValues((current) => ({ ...current, sku: event.target.value.toUpperCase() }))}
              required
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price" htmlFor="product-price">
              <MoneyInput
                id="product-price"
                value={values.salePrice}
                currency={values.currencyCode}
                onChange={(value) => setValues((current) => ({ ...current, salePrice: value }))}
              />
            </FormField>
            <FormField label="Currency" htmlFor="product-currency">
              <Input
                id="product-currency"
                maxLength={3}
                value={values.currencyCode}
                onChange={(event) => setValues((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))}
              />
            </FormField>
          </div>
          <FormField label="HSN/SAC" htmlFor="product-hsn">
            <Input
              id="product-hsn"
              value={values.hsnSac}
              onChange={(event) => setValues((current) => ({ ...current, hsnSac: event.target.value }))}
            />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={values.isTaxable}
              onCheckedChange={(checked) => setValues((current) => ({ ...current, isTaxable: checked === true }))}
            />
            Taxable
          </label>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating…" : "Create product"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
