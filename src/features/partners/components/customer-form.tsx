"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/shared/form-field";
import { currencyCodeSchema } from "@/features/invoices/schemas/invoice";
import { createCustomerAction } from "../actions/customer-actions";

export function CustomerForm() {
  const [values, setValues] = React.useState({
    displayName: "",
    email: "",
    stateCode: "",
    gstin: "",
    currencyCode: "INR",
  });
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const result = await createCustomerAction({
      ...values,
      stateCode: values.stateCode ? values.stateCode : null,
      gstin: values.gstin ? values.gstin : null,
      currencyCode: currencyCodeSchema.parse(values.currencyCode),
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Customer created");
    setValues({ displayName: "", email: "", stateCode: "", gstin: "", currencyCode: "INR" });
  };

  return (
    <Card className="h-fit">
      <CardHeader><CardTitle>Add customer</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Name" htmlFor="customer-name" required>
            <Input
              id="customer-name"
              value={values.displayName}
              onChange={(event) => setValues((current) => ({ ...current, displayName: event.target.value }))}
              required
            />
          </FormField>
          <FormField label="Email" htmlFor="customer-email">
            <Input
              id="customer-email"
              type="email"
              value={values.email}
              onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="State" htmlFor="customer-state">
              <Input
                id="customer-state"
                maxLength={2}
                placeholder="MH"
                value={values.stateCode}
                onChange={(event) => setValues((current) => ({ ...current, stateCode: event.target.value.toUpperCase() }))}
              />
            </FormField>
            <FormField label="Currency" htmlFor="customer-currency">
              <Input
                id="customer-currency"
                maxLength={3}
                value={values.currencyCode}
                onChange={(event) => setValues((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))}
              />
            </FormField>
          </div>
          <FormField label="GSTIN" htmlFor="customer-gstin">
            <Input
              id="customer-gstin"
              maxLength={15}
              value={values.gstin}
              onChange={(event) => setValues((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))}
            />
          </FormField>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating…" : "Create customer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
