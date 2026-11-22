import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ErrorState } from "@/components/shared/feedback";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROUTES } from "@/config/app";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format/format";
import { ErrorCodes } from "@/lib/errors/result";
import { getInvoice } from "@/features/invoices/server/invoice-service";
import { InvoiceActions } from "@/features/invoices/components/detail/invoice-actions";

export const dynamic = "force-dynamic";

async function InvoiceDetailContent({ id }: { id: string }) {
  const result = await getInvoice(id);
  if (!result.ok) {
    if (result.error.code === ErrorCodes.NOT_FOUND) notFound();
    return <ErrorState description={result.error.message} />;
  }
  const invoice = result.data;

  return (
    <>
      <PageHeader
        title={invoice.invoiceNumber}
        description={`Issued ${formatDate(invoice.issueDate)} · Due ${formatDate(invoice.dueDate)}`}
        actions={
          <>
            <StatusBadge status={invoice.displayStatus} />
            <Button asChild variant="ghost" size="sm">
              <Link href={ROUTES.invoices}><ArrowLeft aria-hidden="true" /> Back to list</Link>
            </Button>
          </>
        }
      />

      <div className="mt-6 flex justify-end">
        <InvoiceActions invoice={invoice} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total</CardTitle></CardHeader>
              <CardContent><p className="num text-xl font-semibold">{formatMoney(invoice.total, invoice.currencyCode)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Amount paid</CardTitle></CardHeader>
              <CardContent><p className="num text-xl font-semibold">{formatMoney(invoice.amountPaid, invoice.currencyCode)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Balance due</CardTitle></CardHeader>
              <CardContent><p className="num text-xl font-semibold">{formatMoney(invoice.balanceDue, invoice.currencyCode)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Bill to</p>
                <p className="mt-1 font-medium">{invoice.customerName}</p>
                {invoice.customerEmail ? <p className="text-muted-foreground">{invoice.customerEmail}</p> : null}
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Reference</p>
                <p>{invoice.reference || "—"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Line items</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead scope="col">Description</TableHead>
                    <TableHead scope="col" className="text-right">Qty</TableHead>
                    <TableHead scope="col" className="text-right">Price</TableHead>
                    <TableHead scope="col" className="text-right">Discount</TableHead>
                    <TableHead scope="col" className="text-right">Tax</TableHead>
                    <TableHead scope="col" className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.description}</p>
                        {item.skuSnapshot ? <p className="text-xs text-muted-foreground">SKU {item.skuSnapshot}</p> : null}
                        {item.taxes.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.taxes.map((tax) => tax.name).join(", ")}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="num text-right">{formatNumber(item.quantity)}</TableCell>
                      <TableCell className="num text-right">{formatMoney(item.unitPrice, invoice.currencyCode)}</TableCell>
                      <TableCell className="num text-right">{item.discountPercent}%</TableCell>
                      <TableCell className="num text-right">{formatMoney(item.taxAmount, invoice.currencyCode)}</TableCell>
                      <TableCell className="num text-right font-medium">{formatMoney(item.amount, invoice.currencyCode)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {invoice.notes || invoice.terms || invoice.footer ? (
            <Card>
              <CardHeader><CardTitle>Notes &amp; terms</CardTitle></CardHeader>
              <CardContent className="space-y-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {invoice.notes ? <p>{invoice.notes}</p> : null}
                {invoice.terms ? <p>{invoice.terms}</p> : null}
                {invoice.footer ? <p>{invoice.footer}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="num">{formatMoney(invoice.subtotal, invoice.currencyCode)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="num">{formatMoney(invoice.taxAmount, invoice.currencyCode)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="num">{formatMoney(invoice.total, invoice.currencyCode)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="num">{formatMoney(invoice.balanceDue, invoice.currencyCode)}</span></div>
              <p className="pt-2 text-xs text-muted-foreground">Base currency: {invoice.baseCurrencyCode} · Rate {invoice.exchangeRate}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {invoice.payments.length === 0 ? (
                <p className="text-muted-foreground">No payments recorded yet.</p>
              ) : (
                invoice.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{payment.paymentNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(payment.paidAt)} · {payment.method.replace("_", " ")}</p>
                    </div>
                    <span className="num">{formatMoney(payment.amount, invoice.currencyCode)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-4" aria-label="Invoice history">
                {invoice.events.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">{event.type.replace(/_/g, " ")}</p>
                      {event.message ? <p className="text-xs text-muted-foreground">{event.message}</p> : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}{event.actorName ? ` · ${event.actorName}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
                {invoice.events.length === 0 ? (
                  <li className="text-sm text-muted-foreground">No activity recorded.</li>
                ) : null}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Record</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Version {invoice.version}</p>
              <p>Revisions: {invoice.revisionCount}</p>
              {invoice.sentAt ? <p>Sent {formatDateTime(invoice.sentAt)}</p> : null}
              {invoice.cancelReason ? <p>Cancelled: {invoice.cancelReason}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <InvoiceDetailContent id={id} />
    </Suspense>
  );
}

export const metadata = { title: "Invoice detail" };
