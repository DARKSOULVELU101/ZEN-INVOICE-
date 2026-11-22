import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/feedback";
import { listCustomers } from "@/features/partners/server/customer-service";
import { CustomerForm } from "@/features/partners/components/customer-form";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const result = await listCustomers();
  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Maintain the customers available on invoices." />
      {!result.ok ? <ErrorState description={result.error.message} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Customer directory</CardTitle></CardHeader>
          <CardContent>
            {result.ok && result.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers yet.</p>
            ) : null}
            <div className="divide-y">
              {result.ok ? result.data.map((customer) => (
                <div key={customer.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{customer.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.customerNumber} · {customer.email ?? "No email"} · {customer.currencyCode ?? "—"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{customer.stateCode ?? "No state"} {customer.gstin ?? ""}</p>
                </div>
              )) : null}
            </div>
          </CardContent>
        </Card>
        <CustomerForm />
      </div>
    </div>
  );
}
