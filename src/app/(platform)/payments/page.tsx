import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listPayments } from "@/features/invoices/server/invoice-service";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const result = await listPayments();
  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Payments recorded against invoices." />
      {!result.ok ? <ErrorState description={result.error.message} /> : null}
      <Card>
        <CardHeader><CardTitle>Payment ledger</CardTitle></CardHeader>
        <CardContent>
          {result.ok && result.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.ok ? result.data.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{payment.paymentNumber}</TableCell>
                    <TableCell>{payment.invoiceNumber ?? "—"}</TableCell>
                    <TableCell>{payment.customerName}</TableCell>
                    <TableCell>{payment.paidAt}</TableCell>
                    <TableCell>{payment.method.replaceAll("_", " ")}</TableCell>
                    <TableCell className="num text-right">{payment.amount} {payment.currencyCode}</TableCell>
                  </TableRow>
                )) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
