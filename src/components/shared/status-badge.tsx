import { cn } from "@/lib/utils";
import type { DisplayInvoiceStatus } from "@/features/invoices/domain/status";

export const INVOICE_STATUS_LABEL: Record<DisplayInvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  OVERDUE: "Overdue",
};

const STATUS_STYLE: Record<DisplayInvoiceStatus, string> = {
  DRAFT: "bg-status-draft/10 text-status-draft ring-status-draft/20",
  SENT: "bg-status-sent/10 text-status-sent ring-status-sent/20",
  VIEWED: "bg-status-viewed/10 text-status-viewed ring-status-viewed/20",
  PARTIALLY_PAID: "bg-status-partial/10 text-status-partial ring-status-partial/20",
  PAID: "bg-status-paid/10 text-status-paid ring-status-paid/20",
  CANCELLED: "bg-status-cancelled/10 text-status-cancelled ring-status-cancelled/20",
  OVERDUE: "bg-status-overdue/10 text-status-overdue ring-status-overdue/20",
};

export function StatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: DisplayInvoiceStatus;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        STATUS_STYLE[status],
        className,
      )}
    >
      {showDot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {INVOICE_STATUS_LABEL[status]}
    </span>
  );
}
