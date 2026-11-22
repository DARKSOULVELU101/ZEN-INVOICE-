"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Eye, Pencil, Send, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatMoney } from "@/lib/format/format";
import { todayCalendarDate } from "../../domain/dates";
import type { InvoiceDetail } from "../../types/invoice";
import {
  cancelInvoiceAction, deleteInvoiceAction, duplicateInvoiceAction,
  markInvoiceViewedAction, recordPaymentAction, resendInvoiceAction, sendInvoiceAction,
} from "../../actions/invoice-actions";

type DialogName = "send" | "resend" | "cancel" | "delete" | "payment" | null;

interface ActionResult {
  ok: boolean;
  error?: { message: string };
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

  const canSend = invoice.status === "DRAFT";
  const canResend = ["SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canMarkViewed = invoice.status === "SENT";
  const canEdit = ["DRAFT", "SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canDelete = invoice.status === "DRAFT";
  const canPay = ["SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const canCancel = ["SENT", "VIEWED", "PARTIALLY_PAID"].includes(invoice.status);
  const recipient = invoice.customerEmail ?? "the customer";

  const close = () => {
    setDialog(null);
    setReason("");
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
  };

  const primary = canSend
    ? { label: "Send invoice", icon: Send, onSelect: () => setDialog("send") }
    : canResend
      ? { label: "Resend invoice", icon: Send, onSelect: () => setDialog("resend") }
      : canPay
        ? { label: "Record payment", icon: Wallet, onSelect: () => setDialog("payment") }
        : canEdit
          ? { label: "Edit invoice", icon: Pencil, onSelect: () => router.push(ROUTES.invoiceEdit(invoice.id)) }
          : { label: "Duplicate", icon: Copy, onSelect: () => void run(() => duplicateInvoiceAction(invoice.id), "Invoice duplicated") };

  const secondary = canSend
    ? { label: "Save draft", icon: Pencil, onSelect: () => router.push(ROUTES.invoiceEdit(invoice.id)) }
    : canMarkViewed
      ? { label: "Mark as viewed", icon: Eye, onSelect: () => void run(() => markInvoiceViewedAction(invoice.id), "Invoice marked as viewed") }
      : null;

  const PrimaryIcon = primary.icon;
  const SecondaryIcon = secondary?.icon;

  const actions: MenuAction[] = [];
  if (canEdit && primary.label !== "Edit invoice" && secondary?.label !== "Save draft") {
    actions.push({ label: "Edit", onSelect: () => router.push(ROUTES.invoiceEdit(invoice.id)) });
  }
  if (canPay && primary.label !== "Record payment") {
    actions.push({ label: "Record payment", onSelect: () => setDialog("payment") });
  }
  if (primary.label !== "Duplicate") {
    actions.push({ label: "Duplicate", onSelect: () => void run(() => duplicateInvoiceAction(invoice.id), "Invoice duplicated") });
  }
  if (canCancel) {
    actions.push({ label: "Cancel invoice", onSelect: () => setDialog("cancel"), destructive: true });
  }
  if (canDelete) {
    actions.push({ label: "Delete draft", onSelect: () => setDialog("delete"), destructive: true });
  }

  const sendDialogOpen = dialog === "send" || dialog === "resend";

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {secondary && SecondaryIcon ? (
          <Button variant="outline" onClick={secondary.onSelect} disabled={pending}>
            <SecondaryIcon aria-hidden="true" />
            {secondary.label}
          </Button>
        ) : null}
        <Button onClick={primary.onSelect} disabled={pending}>
          <PrimaryIcon aria-hidden="true" />
          {primary.label}
        </Button>
        <ActionMenu label={`More actions for ${invoice.invoiceNumber}`} actions={actions} />
      </div>

      <ConfirmDialog
        open={sendDialogOpen}
        onOpenChange={(open) => !open && close()}
        title={`${dialog === "resend" ? "Resend" : "Send"} ${invoice.invoiceNumber}?`}
        description={`A professional PDF invoice will be emailed to ${recipient}. ${dialog === "resend" ? "The delivery timestamp will be refreshed." : "The invoice status will change to Sent after delivery."}`}
        confirmLabel={dialog === "resend" ? "Resend invoice" : "Send invoice"}
        intent="primary"
        pending={pending}
        onConfirm={() => void run(
          dialog === "resend"
            ? () => resendInvoiceAction(invoice.id)
            : () => sendInvoiceAction(invoice.id),
          dialog === "resend" ? "Invoice resent with PDF" : "Invoice sent with PDF",
        )}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && close()}
        title={`Delete ${invoice.invoiceNumber}?`}
        description="This draft will be hidden from all lists. This cannot be undone."
        confirmLabel="Delete draft"
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
