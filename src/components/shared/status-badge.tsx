import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DisplayInvoiceStatus } from "@/features/invoices/domain/status";

const STATUS_VARIANT: Record<DisplayInvoiceStatus, BadgeProps["variant"]> = {
  DRAFT: "secondary",
  SENT: "default",
  VIEWED: "default",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "destructive",
  OVERDUE: "destructive",
};

const STATUS_LABEL: Record<DisplayInvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  OVERDUE: "Overdue",
};

export function StatusBadge({
  status,
  className,
}: {
  status: DisplayInvoiceStatus;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("whitespace-nowrap", className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
