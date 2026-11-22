"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createColumnHelper, getCoreRowModel, useReactTable,
  type SortingState, type Updater,
} from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { SearchBar } from "@/components/shared/search-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionMenu } from "@/components/shared/action-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ROUTES } from "@/config/app";
import { formatDate, formatMoney } from "@/lib/format/format";
import { INVOICE_STATUSES } from "@/features/invoices/domain/status";
import { queryToSearchParams, type InvoiceListQuery } from "@/features/invoices/schemas/invoice";
import type { InvoiceListItem } from "@/features/invoices/types/invoice";
import {
  deleteInvoiceAction, duplicateInvoiceAction, sendInvoiceAction,
} from "@/features/invoices/actions/invoice-actions";

const columnHelper = createColumnHelper<InvoiceListItem>();

export function InvoiceListClient({
  items,
  query,
  total,
  nextCursor,
}: {
  items: InvoiceListItem[];
  query: InvoiceListQuery;
  total?: number;
  nextCursor?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sorting, setSorting] = React.useState<SortingState>(
    query.sort ? [{ id: query.sort, desc: query.dir === "desc" }] : [],
  );
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [isNavigating, startTransition] = React.useTransition();

  const pushQuery = React.useCallback(
    (overrides: Partial<InvoiceListQuery> & { resetCursor?: boolean }) => {
      const { resetCursor, ...rest } = overrides;
      const merged = { ...query, ...rest, cursor: resetCursor ? undefined : (rest.cursor ?? query.cursor) };
      const params = queryToSearchParams(merged);
      if (merged.cursor) params.set("cursor", merged.cursor);
      const qs = params.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, query, router],
  );

  const onSearch = React.useCallback(
    (value: string) => pushQuery({ q: value || undefined, resetCursor: true }),
    [pushQuery],
  );

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    setSorting(next);
    const first = next[0];
    pushQuery({
      sort: (first?.id as InvoiceListQuery["sort"]) ?? "createdAt",
      dir: first?.desc ? "desc" : "asc",
      resetCursor: true,
    });
  };

  const handleSend = React.useCallback(
    async (id: string) => {
      setPending(true);
      const result = await sendInvoiceAction(id);
      setPending(false);
      if (result.ok) toast.success("Invoice sent", { description: "The email has been queued." });
      else toast.error(result.error.message);
    },
    [],
  );

  const handleDuplicate = React.useCallback(
    async (id: string) => {
      setPending(true);
      const result = await duplicateInvoiceAction(id);
      setPending(false);
      if (result.ok) {
        toast.success("Draft created");
        router.push(ROUTES.invoiceEdit(result.data.id));
      } else toast.error(result.error.message);
    },
    [router],
  );

  const handleDelete = async () => {
    if (!confirmId) return;
    setPending(true);
    const result = await deleteInvoiceAction(confirmId);
    setPending(false);
    setConfirmId(null);
    if (result.ok) toast.success("Invoice deleted");
    else toast.error(result.error.message);
  };

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("invoiceNumber", {
        header: "Invoice",
        enableSorting: true,
        cell: (info) => (
          <Link
            href={ROUTES.invoiceDetail(info.row.original.id)}
            className="font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("customerName", {
        header: "Customer",
        enableSorting: false,
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      }),
      columnHelper.accessor("issueDate", {
        header: "Issued",
        enableSorting: false,
        cell: (info) => <span className="num text-xs">{formatDate(`${info.getValue()}T00:00:00Z`)}</span>,
      }),
      columnHelper.accessor("dueDate", {
        header: "Due",
        enableSorting: true,
        cell: (info) => <span className="num text-xs">{formatDate(`${info.getValue()}T00:00:00Z`)}</span>,
      }),
      columnHelper.accessor("displayStatus", {
        header: "Status",
        enableSorting: true,
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("total", {
        header: "Total",
        enableSorting: true,
        cell: (info) => (
          <span className="num font-medium">
            {formatMoney(info.getValue(), info.row.original.currencyCode)}
          </span>
        ),
      }),
      columnHelper.accessor("balanceDue", {
        header: "Balance",
        enableSorting: false,
        cell: (info) => (
          <span className="num text-muted-foreground">
            {formatMoney(info.getValue(), info.row.original.currencyCode)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: (info) => {
          const invoice = info.row.original;
          const canSend = ["DRAFT"].includes(invoice.status);
          const canDelete = invoice.status === "DRAFT";
          return (
            <ActionMenu
              label={`Actions for ${invoice.invoiceNumber}`}
              actions={[
                { label: "View details", onSelect: () => router.push(ROUTES.invoiceDetail(invoice.id)) },
                { label: "Edit", onSelect: () => router.push(ROUTES.invoiceEdit(invoice.id)) },
                { label: "Send", onSelect: () => void handleSend(invoice.id), disabled: !canSend || pending },
                { label: "Duplicate", onSelect: () => void handleDuplicate(invoice.id), disabled: pending },
                {
                  label: "Delete draft",
                  onSelect: () => setConfirmId(invoice.id),
                  disabled: !canDelete || pending,
                  destructive: true,
                },
              ]}
            />
          );
        },
      }),
    ],
    [handleDuplicate, handleSend, pending, router],
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: handleSortingChange,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const statusValue = query.status ?? "ALL";

  return (
    <div className="space-y-4" aria-busy={isNavigating}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBar value={query.q ?? ""} onSearch={onSearch} placeholder="Search number or customer…" />
          <Select
            value={statusValue}
            onValueChange={(value) =>
              pushQuery({ status: value === "ALL" ? undefined : (value as InvoiceListQuery["status"]), resetCursor: true })
            }
          >
            <SelectTrigger className="sm:w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {INVOICE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{status.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={query.overdue ? "destructive" : "outline"}
            size="sm"
            onClick={() => pushQuery({ overdue: query.overdue ? undefined : true, resetCursor: true })}
            aria-pressed={Boolean(query.overdue)}
          >
            <Eye aria-hidden="true" />
            Overdue only
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total !== undefined ? `${total.toLocaleString()} invoices` : "More results"}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <DataTable table={table} />
        {items.length === 0 ? (
          <div className="border-t px-6 py-12 text-center">
            <p className="text-sm font-medium">No invoices match these filters</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search or clear the filters.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => router.push(ROUTES.invoices)}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Showing {items.length}{total !== undefined ? ` of ${total}` : ""}
        </span>
        <div className="flex gap-2">
          {query.cursor ? (
            <Button variant="ghost" size="sm" onClick={() => pushQuery({ cursor: undefined })}>
              First page
            </Button>
          ) : null}
          {nextCursor ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isNavigating}
              onClick={() => pushQuery({ cursor: nextCursor })}
            >
              Next page
            </Button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmId)}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Delete this draft?"
        description="This draft will be hidden from lists and cannot be restored. Issued invoices cannot be deleted."
        confirmLabel="Delete draft"
        onConfirm={handleDelete}
        pending={pending}
      />
    </div>
  );
}
