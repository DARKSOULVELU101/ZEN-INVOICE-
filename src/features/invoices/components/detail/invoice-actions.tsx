"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Send, Trash2, XCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { ROUTES } from "@/config/app";
import { formatMoney } from "@/lib/format/format";
import type { InvoiceDetail } from "../../types/invoice";
import {
  cancelInvoiceAction, deleteInvoiceAction, duplicateInvoiceAction,
  recordPaymentAction, sendInvoiceAction,
} from "../../actions/invoice-actions";

type DialogName = "send" | "cancel" | "delete" | "payment" | null;

export function InvoiceActions({ invoice }: { invoice: InvoiceDetail }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogName>(null);
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState(invoice.balanceDue);
  const [paidAt, setPaidAt] = React.useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = React.useState("BANK_TRANSFER");
  const [reference, setReference] = React.useState("");

  const canSend = invoice.status === "DRAFT";
  const canEdit = ["DRAFT", "SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canDelete = invoice.status === "DRAFT";
  const canPay = ["SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canCancel = ["SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);

  const close = () => {
    setDialog(null);
    setReason("");
  };

  const run = async (action: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setPending(true);
    const result = await action();
    setPending(false);
    if (result.ok) {
      toast.success("Done");
      close();
      router.refresh();
    } else {
      toast.error(result.error?.message ?? "The action failed.");
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.invoiceEdit(invoice.id)}>Edit</Link>
          </Button>
        ) : null}
        {canSend ? (
          <Button size="sm" onClick={() => setDialog("send")}>
            <Send aria-hidden="true" /> Send
          </Button>
        ) : null}
        {canPay ? (
          <Button size="sm" onClick={() => setDialog("payment")}>
            <Wallet aria-hidden="true" /> Record payment
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void run(() => duplicateInvoiceAction(invoice.id))}>
          <Copy aria-hidden="true" /> Duplicate
        </Button>
        {canCancel ? (
          <Button variant="outline" size="sm" onClick={() => setDialog("cancel")}>
            <XCircle aria-hidden="true" /> Cancel
          </Button>
        ) : null}
        {canDelete ? (
          <Button variant="ghost" size="sm" onClick={() => setDialog("delete")}>
            <Trash2 className="text-destructive" aria-hidden="true" /> Delete
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog === "send"}
        onOpenChange={(open) => !open && close()}
        title={`Send ${invoice.invoiceNumber}?`}
        description={`An email will be queued for ${invoice.customerEmail ?? "the customer"}. The invoice status will change to Sent.`}
        confirmLabel="Send invoice"
        pending={pending}
        onConfirm={() => void run(() => sendInvoiceAction(invoice.id))}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && close()}
        title={`Delete ${invoice.invoiceNumber}?`}
        description="This draft will be hidden from all lists. This cannot be undone."
        confirmLabel="Delete draft"
        pending={pending}
        onConfirm={() => void run(() => deleteInvoiceAction(invoice.id))}
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
              onClick={() => void run(() => cancelInvoiceAction(invoice.id, reason))}
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
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
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
