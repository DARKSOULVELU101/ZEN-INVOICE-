"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BreadcrumbTrail, PageShell } from "@/components/shared/page-shell";
import { SectionCard, SummaryPanel, SummaryRow } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ROUTES } from "@/config/app";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format/format";
import { cn } from "@/lib/utils";
import type { InvoiceDetail } from "@/features/invoices/types/invoice";
import { InvoiceActions } from "./invoice-actions";

type Tab = "overview" | "products" | "tax" | "payments" | "activity" | "audit";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "products", label: "Products" },
  { value: "tax", label: "Tax" },
  { value: "payments", label: "Payments" },
  { value: "activity", label: "Activity" },
  { value: "audit", label: "Audit" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="ui-label">{label}</dt>
      <dd className="ui-value">{children || "—"}</dd>
    </div>
  );
}

function titleCaseEvent(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InvoiceDetailView({ invoice }: { invoice: InvoiceDetail }) {
  const [tab, setTab] = React.useState<Tab>("overview");

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const current = TABS.findIndex((item) => item.value === tab);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = (current + offset + TABS.length) % TABS.length;
    setTab(TABS[next].value);
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    target?.focus();
  };

  const usesIgst = Number(invoice.igstAmount) > 0;

  return (
    <PageShell
      title={invoice.invoiceNumber}
      description={`${invoice.customerName} · ${formatDate(invoice.invoiceDate)}`}
      breadcrumb={
        <BreadcrumbTrail items={[
          { label: "Sales", href: ROUTES.invoices },
          { label: "Invoices", href: ROUTES.invoices },
          { label: invoice.invoiceNumber },
        ]} />
      }
      actions={<InvoiceActions invoice={invoice} />}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge status={invoice.displayStatus} />
        <span className="text-sm text-muted-foreground">Due {formatDate(invoice.dueDate)}</span>
        <span className="text-sm text-muted-foreground">{invoice.currencyCode}</span>
        <span className="text-sm text-muted-foreground">
          Email: {invoice.emailDeliveryStatus.toLowerCase()} · View: {invoice.viewStatus.toLowerCase()}
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link href={ROUTES.invoices}>
            <ArrowLeft aria-hidden="true" /> Back to list
          </Link>
        </Button>
      </div>

      <section className="ui-panel p-6" aria-label="Invoice balance">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="ui-label">Balance due</p>
            <p className="num mt-2 text-[32px] font-semibold leading-10 tracking-[-0.03em] tabular-nums">
              {formatMoney(invoice.balanceDue, invoice.currencyCode)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.payments.length === 0
                ? "No payments recorded yet."
                : `${invoice.payments.length} payment${invoice.payments.length === 1 ? "" : "s"} recorded.`}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-6 border-t pt-4 lg:min-w-[320px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <Field label="Invoice total">{formatMoney(invoice.total, invoice.currencyCode)}</Field>
            <Field label="Amount paid">{formatMoney(invoice.amountPaid, invoice.currencyCode)}</Field>
          </dl>
        </div>
      </section>

      <div role="tablist" aria-label="Invoice sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.value}
            id={`invoice-tab-${item.value}`}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            aria-controls={`invoice-panel-${item.value}`}
            tabIndex={tab === item.value ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => setTab(item.value)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === item.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div id="invoice-panel-overview" role="tabpanel" aria-labelledby="invoice-tab-overview" className="space-y-6">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6 min-w-0">
              <SectionCard title="Customer" description="Billing identity and invoice reference.">
                <dl className="grid gap-6 sm:grid-cols-2">
                  <Field label="Bill to">{invoice.customerName}</Field>
                  <Field label="Email">{invoice.customerEmail}</Field>
                  <Field label="Reference">{invoice.reference}</Field>
                  <Field label="Payment terms">{invoice.paymentTerms} days</Field>
                </dl>
              </SectionCard>

              <SectionCard title="Notes & terms" description="Customer-facing text saved with this invoice.">
                {invoice.notes || invoice.terms || invoice.footer ? (
                  <div className="space-y-4 whitespace-pre-wrap text-sm text-muted-foreground">
                    {invoice.notes ? <p>{invoice.notes}</p> : null}
                    {invoice.terms ? <p>{invoice.terms}</p> : null}
                    {invoice.footer ? <p>{invoice.footer}</p> : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes, terms or footer text were added.</p>
                )}
              </SectionCard>
            </div>

            <SummaryPanel title="Totals">
              <div className="space-y-3">
                <SummaryRow label="Subtotal" value={formatMoney(invoice.subtotal, invoice.currencyCode)} muted />
                <SummaryRow label="Discount" value={`-${formatMoney(invoice.discountAmount, invoice.currencyCode)}`} muted />
                <SummaryRow label="Taxable amount" value={formatMoney(invoice.taxableAmount, invoice.currencyCode)} muted />
                {usesIgst ? (
                  <SummaryRow label="IGST" value={formatMoney(invoice.igstAmount, invoice.currencyCode)} muted />
                ) : (
                  <>
                    <SummaryRow label="CGST" value={formatMoney(invoice.cgstAmount, invoice.currencyCode)} muted />
                    <SummaryRow label="SGST" value={formatMoney(invoice.sgstAmount, invoice.currencyCode)} muted />
                  </>
                )}
                <SummaryRow label="Shipping" value={formatMoney(invoice.shippingAmount, invoice.currencyCode)} muted />
                <SummaryRow label="Round off" value={formatMoney(invoice.roundOffAmount, invoice.currencyCode)} muted />
                <SummaryRow label="Invoice total" value={formatMoney(invoice.total, invoice.currencyCode)} emphasis />
              </div>
              <p className="text-xs text-muted-foreground">
                Base currency {invoice.baseCurrencyCode} · Rate {invoice.exchangeRate}
              </p>
            </SummaryPanel>
          </div>
        </div>
      ) : null}

      {tab === "products" ? (
        <div id="invoice-panel-products" role="tabpanel" aria-labelledby="invoice-tab-products">
          <SectionCard title="Products" description="Products and tax applied to this invoice." contentClassName="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.description}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[item.skuSnapshot ? `SKU ${item.skuSnapshot}` : null, item.hsnSac ? `HSN ${item.hsnSac}` : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
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
                      <TableCell className="num text-right font-semibold">{formatMoney(item.amount, invoice.currencyCode)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === "tax" ? (
        <div id="invoice-panel-tax" role="tabpanel" aria-labelledby="invoice-tab-tax" className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Tax jurisdiction" description="GST registration and place of supply used for this invoice.">
            <dl className="grid gap-6 sm:grid-cols-2">
              <Field label="GSTIN">{invoice.gstin}</Field>
              <Field label="Place of supply">{invoice.destinationStateCode}</Field>
              <Field label="Source state">{invoice.sourceStateCode}</Field>
              <Field label="Reverse charge">{invoice.isReverseCharge ? "Applicable" : "Not applicable"}</Field>
            </dl>
          </SectionCard>

          <SummaryPanel title="Tax breakdown">
            <div className="space-y-3">
              <SummaryRow label="Taxable amount" value={formatMoney(invoice.taxableAmount, invoice.currencyCode)} muted />
              {usesIgst ? (
                <SummaryRow label="IGST" value={formatMoney(invoice.igstAmount, invoice.currencyCode)} muted />
              ) : (
                <>
                  <SummaryRow label="CGST" value={formatMoney(invoice.cgstAmount, invoice.currencyCode)} muted />
                  <SummaryRow label="SGST" value={formatMoney(invoice.sgstAmount, invoice.currencyCode)} muted />
                </>
              )}
              <SummaryRow label="Total tax" value={formatMoney(invoice.taxAmount, invoice.currencyCode)} emphasis />
            </div>
          </SummaryPanel>
        </div>
      ) : null}

      {tab === "payments" ? (
        <div id="invoice-panel-payments" role="tabpanel" aria-labelledby="invoice-tab-payments">
          <SectionCard title="Payments" description="Receipts applied to this invoice.">
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{payment.paymentNumber}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(payment.paidAt)} · {payment.method.replace("_", " ")}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </p>
                    </div>
                    <span className="num text-sm font-semibold">{formatMoney(payment.amount, invoice.currencyCode)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div id="invoice-panel-activity" role="tabpanel" aria-labelledby="invoice-tab-activity">
          <SectionCard title="Activity" description="Status changes and recorded events.">
            <ol className="space-y-5">
              {invoice.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{titleCaseEvent(event.type)}</p>
                    {event.message ? <p className="mt-0.5 text-sm text-muted-foreground">{event.message}</p> : null}
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
          </SectionCard>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div id="invoice-panel-audit" role="tabpanel" aria-labelledby="invoice-tab-audit">
          <SectionCard title="Audit record" description="Internal record metadata and history.">
            <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Version">{invoice.version}</Field>
              <Field label="Revisions">{invoice.revisionCount}</Field>
              <Field label="PDF version">{invoice.pdfVersion ?? 0}</Field>
              <Field label="PDF generated">{invoice.pdfGeneratedAt ? formatDateTime(invoice.pdfGeneratedAt) : "—"}</Field>
              <Field label="Printed">{invoice.printedAt ? formatDateTime(invoice.printedAt) : "—"}</Field>
              <Field label="Last exported">{invoice.lastExportedAt ? formatDateTime(invoice.lastExportedAt) : "—"}</Field>
              <Field label="Email status">{invoice.emailDeliveryStatus.toLowerCase()}</Field>
              <Field label="Email delivered">{invoice.emailDeliveredAt ? formatDateTime(invoice.emailDeliveredAt) : "—"}</Field>
              <Field label="View status">{invoice.viewStatus.toLowerCase()}</Field>
              <Field label="Viewed">{invoice.viewedAt ? formatDateTime(invoice.viewedAt) : "—"}</Field>
              <Field label="Created">{formatDateTime(invoice.createdAt)}</Field>
              <Field label="Sent">{invoice.sentAt ? formatDateTime(invoice.sentAt) : "—"}</Field>
              <Field label="Cancelled">{invoice.cancelledAt ? formatDateTime(invoice.cancelledAt) : "—"}</Field>
              <Field label="Cancellation reason">{invoice.cancelReason}</Field>
              <Field label="Branch">{invoice.branchId ?? "Default"}</Field>
              <Field label="Customer ID">{invoice.customerId}</Field>
              <Field label="Invoice ID">{invoice.id}</Field>
            </dl>
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
