import Link from "next/link";
import { Eye, Pencil, Send, Trash2 } from "lucide-react";
import { ActionMenu, type MenuAction } from "@/components/shared/action-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { ROUTES } from "@/config/app";
import { formatDate, formatMoney } from "@/lib/format/format";
import type { InvoiceListItem } from "@/features/invoices/types/invoice";

export function InvoiceListCard({
  invoice,
  canEdit,
  canSend,
  sendLabel = "Send",
  canDelete,
  pending,
  onView,
  onEdit,
  onSend,
  onPreview,
  onDownload,
  onDuplicate,
  onDelete,
}: {
  invoice: InvoiceListItem;
  canEdit: boolean;
  canSend: boolean;
  sendLabel?: string;
  canDelete: boolean;
  pending: boolean;
  onView: () => void;
  onEdit: () => void;
  onSend: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const actions: MenuAction[] = [
    { label: "View details", onSelect: onView },
    { label: "Preview PDF", onSelect: onPreview, disabled: pending },
    { label: "Export PDF", onSelect: onDownload, disabled: pending },
    { label: "Edit", onSelect: onEdit, disabled: !canEdit || pending },
    { label: sendLabel, onSelect: onSend, disabled: !canSend || pending },
    { label: "Duplicate", onSelect: onDuplicate, disabled: pending },
    { label: "Delete draft", onSelect: onDelete, disabled: !canDelete || pending, destructive: true },
  ];

  return (
    <article className="ui-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={ROUTES.invoiceDetail(invoice.id)} className="text-sm font-semibold text-foreground hover:text-primary hover:underline">
            {invoice.invoiceNumber}
          </Link>
          <p className="mt-1 truncate text-sm text-muted-foreground">{invoice.customerName}</p>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={invoice.displayStatus} />
          <ActionMenu label={`Actions for ${invoice.invoiceNumber}`} actions={actions} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="ui-label">Invoice date</p>
          <p className="num mt-1">{formatDate(invoice.invoiceDate)}</p>
        </div>
        <div>
          <p className="ui-label">Due date</p>
          <p className="num mt-1">{formatDate(invoice.dueDate)}</p>
        </div>
        <div>
          <p className="ui-label">Total</p>
          <p className="num mt-1 font-semibold">{formatMoney(invoice.total, invoice.currencyCode)}</p>
        </div>
        <div>
          <p className="ui-label">Balance</p>
          <p className="num mt-1">{formatMoney(invoice.balanceDue, invoice.currencyCode)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{invoice.currencyCode}</span>
        <span aria-hidden="true">·</span>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>v{invoice.version}</span>
        {canSend ? <Send className="ml-auto h-3.5 w-3.5" aria-hidden="true" /> : null}
        {canDelete ? <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      </div>
    </article>
  );
}
