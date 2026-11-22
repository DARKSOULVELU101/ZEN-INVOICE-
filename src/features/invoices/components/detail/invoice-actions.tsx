"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download, Eye, FileText, Paperclip, Printer, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ActionMenu, type MenuAction } from "@/components/shared/action-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { ROUTES } from "@/config/app";
import { formatDate, formatMoney } from "@/lib/format/format";
import { todayCalendarDate } from "../../domain/dates";
import type { InvoiceDetail } from "../../types/invoice";
import {
  cancelInvoiceAction, deleteInvoiceAction, downloadInvoicePdfAction,
  duplicateInvoiceAction, markInvoiceViewedAction, previewInvoicePdfAction,
  recordPaymentAction, resendInvoiceAction, sendInvoiceAction,
} from "../../actions/invoice-actions";

type DialogName = "compose" | "cancel" | "delete" | "payment" | "preview" | null;

interface ActionResult {
  ok: boolean;
  error?: { message: string };
}

interface ComposerState {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  message: string;
  resend: boolean;
}

function addresses(value: string): string[] {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

export function InvoiceActions({ invoice }: { invoice: InvoiceDetail }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogName>(null);
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState(invoice.balanceDue);
  const [paidAt, setPaidAt] = React.useState(todayCalendarDate());
  const [method, setMethod] = React.useState("BANK_TRANSFER");
  const [reference, setReference] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [composer, setComposer] = React.useState<ComposerState>({
    to: invoice.customerEmail ?? "",
    cc: "",
    bcc: "",
    subject: `Invoice ${invoice.invoiceNumber}`,
    message: `Please find attached invoice ${invoice.invoiceNumber} for ${formatMoney(invoice.total, invoice.currencyCode)} due on ${formatDate(invoice.dueDate)}.`,
    resend: false,
  });

  const canSend = invoice.status === "DRAFT";
  const canResend = ["SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canMarkViewed = invoice.status === "SENT";
  const canEdit = ["DRAFT", "SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canDelete = invoice.status === "DRAFT";
  const canPay = ["SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canCancel = ["SENT", "VIEWED"].includes(invoice.status);

  const close = () => {
    setDialog(null);
    setReason("");
    setPreviewUrl(null);
  };

  const run = async (action: () => Promise<ActionResult>, successMessage: string) => {
    setPending(true);
    const result = await action();
    setPending(false);
    if (result.ok) {
      toast.success(successMessage);
      close();
      router.refresh();
    } else {
      toast.error(result.error?.message ?? "The action failed.");
    }
    return result;
  };

  const openComposer = (resend: boolean) => {
    setComposer((current) => ({
      ...current,
      to: invoice.customerEmail ?? current.to,
      subject: resend
        ? `Re: Invoice ${invoice.invoiceNumber}`
        : `Invoice ${invoice.invoiceNumber}`,
      resend,
    }));
    setDialog("compose");
  };

  const openPreview = async () => {
    setPending(true);
    const result = await previewInvoicePdfAction(invoice.id);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setPreviewUrl(result.data.url);
    setDialog("preview");
  };

  const openPrint = () => {
    const printWindow = window.open(`/invoices/${invoice.id}/print`, "_blank");
    if (!printWindow) toast.error("Allow pop-ups to open the print view.");
    else printWindow.opener = null;
  };

  const downloadPdf = async () => {
    setPending(true);
    const result = await downloadInvoicePdfAction(invoice.id);
    setPending(false);
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
    toast.success("PDF exported", { description: `${result.data.filename}.pdf` });
    router.refresh();
  };

  const submitComposer = async () => {
    const payload = {
      to: composer.to.trim(),
      cc: addresses(composer.cc),
      bcc: addresses(composer.bcc),
      subject: composer.subject.trim(),
      message: composer.message.trim(),
    };
    const action = composer.resend ? resendInvoiceAction : sendInvoiceAction;
    await run(
      () => action(invoice.id, payload),
      composer.resend ? "Invoice resent with PDF" : "Invoice sent with PDF",
    );
  };

  const primary = canSend
    ? { label: "Send invoice", onSelect: () => openComposer(false) }
    : canResend
      ? { label: "Resend invoice", onSelect: () => openComposer(true) }
      : canPay
        ? { label: "Record payment", onSelect: () => setDialog("payment") }
        : canEdit
          ? { label: "Edit invoice", onSelect: () => router.push(ROUTES.invoiceEdit(invoice.id)) }
          : { label: "Duplicate", onSelect: () => void run(() => duplicateInvoiceAction(invoice.id), "Invoice duplicated") };

  const actions: MenuAction[] = [];
  if (canEdit && primary.label !== "Edit invoice") {
    actions.push({ label: "Edit", onSelect: () => router.push(ROUTES.invoiceEdit(invoice.id)) });
  }
  actions.push({ label: "Export PDF", onSelect: () => void downloadPdf() });
  if (canMarkViewed) {
    actions.push({
      label: "Mark as viewed",
      onSelect: () => void run(() => markInvoiceViewedAction(invoice.id), "Invoice marked as viewed"),
    });
  }
  if (canPay && primary.label !== "Record payment") {
    actions.push({ label: "Record payment", onSelect: () => setDialog("payment") });
  }
  if (primary.label !== "Duplicate") {
    actions.push({
      label: "Duplicate",
      onSelect: () => void run(() => duplicateInvoiceAction(invoice.id), "Invoice duplicated"),
    });
  }
  if (canCancel) {
    actions.push({ label: "Cancel invoice", onSelect: () => setDialog("cancel"), destructive: true });
  }
  if (canDelete) {
    actions.push({ label: "Delete draft", onSelect: () => setDialog("delete"), destructive: true });
  }

  const composerValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(composer.to.trim()) && composer.subject.trim().length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => void openPreview()} disabled={pending}>
          <Eye aria-hidden="true" /> Preview
        </Button>
        <Button variant="outline" onClick={openPrint} disabled={pending}>
          <Printer aria-hidden="true" /> Print
        </Button>
        <Button variant="outline" onClick={() => void downloadPdf()} disabled={pending}>
          <FileText aria-hidden="true" /> Download
        </Button>
        <Button onClick={primary.onSelect} disabled={pending}>
          <Send aria-hidden="true" /> {primary.label}
        </Button>
        <ActionMenu label={`More actions for ${invoice.invoiceNumber}`} actions={actions} />
      </div>

      <Dialog open={dialog === "preview"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{invoice.invoiceNumber}</DialogTitle>
            <DialogDescription>PDF preview · version {invoice.pdfVersion || 1}</DialogDescription>
          </DialogHeader>
          <div className="h-[70vh] overflow-hidden rounded-panel border bg-muted">
            {previewUrl ? (
              <iframe src={previewUrl} title={`Preview of ${invoice.invoiceNumber}`} className="h-full w-full" />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => void downloadPdf()} disabled={pending}>
              <Download aria-hidden="true" /> Export PDF
            </Button>
            <Button onClick={close}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "compose"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{composer.resend ? "Resend" : "Send"} {invoice.invoiceNumber}</DialogTitle>
            <DialogDescription>
              The generated PDF is attached automatically. Delivery status updates only after the provider accepts it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="To" htmlFor="email-to" required>
              <Input
                id="email-to"
                type="email"
                value={composer.to}
                onChange={(event) => setComposer((current) => ({ ...current, to: event.target.value }))}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="CC" htmlFor="email-cc">
                <Input
                  id="email-cc"
                  placeholder="name@example.com"
                  value={composer.cc}
                  onChange={(event) => setComposer((current) => ({ ...current, cc: event.target.value }))}
                />
              </FormField>
              <FormField label="BCC" htmlFor="email-bcc">
                <Input
                  id="email-bcc"
                  placeholder="name@example.com"
                  value={composer.bcc}
                  onChange={(event) => setComposer((current) => ({ ...current, bcc: event.target.value }))}
                />
              </FormField>
            </div>
            <FormField label="Subject" htmlFor="email-subject" required>
              <Input
                id="email-subject"
                value={composer.subject}
                onChange={(event) => setComposer((current) => ({ ...current, subject: event.target.value }))}
              />
            </FormField>
            <FormField label="Message" htmlFor="email-message">
              <Textarea
                id="email-message"
                rows={6}
                value={composer.message}
                onChange={(event) => setComposer((current) => ({ ...current, message: event.target.value }))}
              />
            </FormField>
            <div className="flex items-center gap-2 rounded-control border bg-muted/40 px-3 py-2 text-sm">
              <Paperclip aria-hidden="true" className="text-muted-foreground" />
              <span className="font-medium">{invoice.invoiceNumber}.pdf</span>
              <span className="text-muted-foreground">Attached automatically</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>Cancel</Button>
            <Button onClick={() => void submitComposer()} disabled={pending || !composerValid}>
              <Send aria-hidden="true" /> {composer.resend ? "Resend invoice" : "Send invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && close()}
        title={`Delete ${invoice.invoiceNumber}?`}
        description="This draft will be hidden from all lists. This cannot be undone."
        confirmLabel="Delete draft"
        intent="primary"
        pending={pending}
        onConfirm={() => void run(() => deleteInvoiceAction(invoice.id), "Draft deleted")}
      />

      <Dialog open={dialog === "cancel"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {invoice.invoiceNumber}</DialogTitle>
            <DialogDescription>The reason is stored on the invoice timeline and audit log.</DialogDescription>
          </DialogHeader>
          <FormField label="Reason" htmlFor="cancel-reason" required>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Customer requested cancellation"
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>Back</Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 3}
              onClick={() => void run(() => cancelInvoiceAction(invoice.id, reason), "Invoice cancelled")}
            >
              Cancel invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "payment"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>
              Outstanding balance: {formatMoney(invoice.balanceDue, invoice.currencyCode)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Amount" htmlFor="payment-amount" required>
              <MoneyInput
                id="payment-amount"
                value={amount}
                currency={invoice.currencyCode}
                onChange={setAmount}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Paid on" htmlFor="payment-date" required>
                <Input id="payment-date" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
              </FormField>
              <FormField label="Method" htmlFor="payment-method" required>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="payment-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["CASH", "BANK_TRANSFER", "CREDIT_CARD", "DEBIT_CARD", "CHECK", "ONLINE", "OTHER"].map((item) => (
                      <SelectItem key={item} value={item}>{item.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Reference" htmlFor="payment-reference">
              <Input
                id="payment-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Transaction reference"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>Back</Button>
            <Button
              disabled={pending || !amount || Number(amount) <= 0}
              onClick={() =>
                void run(() =>
                  recordPaymentAction({
                    invoiceId: invoice.id,
                    amount,
                    paidAt,
                    method: method as "BANK_TRANSFER",
                    reference: reference || null,
                  }),
                "Payment recorded",
                )
              }
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
