"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createColumnHelper, getCoreRowModel, useReactTable,
  type SortingState, type Updater,
} from "@tanstack/react-table";
import { CalendarDays, RotateCcw, X } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { SearchBar } from "@/components/shared/search-bar";
import { SearchableSelect, type SearchableOption } from "@/components/shared/searchable-select";
import { StatusBadge, INVOICE_STATUS_LABEL } from "@/components/shared/status-badge";
import { ActionMenu } from "@/components/shared/action-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FilterChip, StatusTabs } from "@/components/shared/filters";
import { MetricStrip } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/app";
import { formatDate, formatMoney } from "@/lib/format/format";
import { Decimal } from "@/lib/money/decimal";
import {
  addCalendarDays, parseCalendarDate, toCalendarDateInput, todayCalendarDate,
} from "@/features/invoices/domain/dates";
import {
  canTransition, INVOICE_STATUSES, isDeletable, isEditable,
  type InvoiceStatus,
} from "@/features/invoices/domain/status";
import { queryToSearchParams, type InvoiceListQuery } from "@/features/invoices/schemas/invoice";
import type { CustomerOption } from "@/features/partners/types/customer";
import type { InvoiceListItem } from "@/features/invoices/types/invoice";
import {
  deleteInvoiceAction, duplicateInvoiceAction, sendInvoiceAction,
} from "@/features/invoices/actions/invoice-actions";
import { InvoiceListCard } from "./invoice-list-card";

const columnHelper = createColumnHelper<InvoiceListItem>();

type StatusTab = "ALL" | "OVERDUE" | InvoiceStatus;

function asCalendarInput(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return toCalendarDateInput(value);
  return String(value).slice(0, 10);
}

export function InvoiceListClient({
  items,
  query,
  total,
  nextCursor,
  customers,
}: {
  items: InvoiceListItem[];
  query: InvoiceListQuery;
  total?: number;
  nextCursor?: string;
  customers: CustomerOption[];
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
      const merged: InvoiceListQuery = { ...query, ...rest };
      if (resetCursor) merged.cursor = undefined;
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

  const customerOptions = React.useMemo<SearchableOption[]>(
    () => customers.map((customer) => ({
      id: customer.id,
      label: customer.label,
      secondary: customer.email,
    })),
    [customers],
  );

  const onCustomerSearch = React.useCallback(
    async (value: string) => {
      const needle = value.trim().toLowerCase();
      return customerOptions.filter((option) => (
        !needle
        || option.label.toLowerCase().includes(needle)
        || option.secondary?.toLowerCase().includes(needle)
      ));
    },
    [customerOptions],
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

  const handleView = React.useCallback(
    (id: string) => router.push(ROUTES.invoiceDetail(id)),
    [router],
  );

  const handleEdit = React.useCallback(
    (id: string) => router.push(ROUTES.invoiceEdit(id)),
    [router],
  );

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

  const footerCurrency = React.useMemo(() => {
    const currencies = new Set(items.map((item) => item.currencyCode));
    return currencies.size === 1 ? items[0]?.currencyCode ?? null : null;
  }, [items]);

  const footerTotal = React.useMemo(
    () => footerCurrency ? items.reduce((sum, item) => sum.plus(item.total), new Decimal(0)) : null,
    [footerCurrency, items],
  );

  const footerBalance = React.useMemo(
    () => footerCurrency ? items.reduce((sum, item) => sum.plus(item.balanceDue), new Decimal(0)) : null,
    [footerCurrency, items],
  );

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("invoiceNumber", {
        header: "Invoice",
        enableSorting: true,
        meta: { sticky: true },
        cell: (info) => (
          <div className="min-w-0">
            <Link
              href={ROUTES.invoiceDetail(info.row.original.id)}
              className="font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {info.getValue()}
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{info.row.original.customerName}</p>
          </div>
        ),
      }),
      columnHelper.accessor("invoiceDate", {
        header: "Invoice date",
        enableSorting: true,
        cell: (info) => <span className="num text-sm">{formatDate(info.getValue())}</span>,
      }),
      columnHelper.accessor("dueDate", {
        header: "Due date",
        enableSorting: true,
        cell: (info) => <span className="num text-sm">{formatDate(info.getValue())}</span>,
      }),
      columnHelper.accessor("displayStatus", {
        header: "Status",
        enableSorting: false,
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("total", {
        header: "Total",
        enableSorting: true,
        meta: { align: "right" },
        footer: () => footerCurrency ? formatMoney(footerTotal ?? 0, footerCurrency) : "—",
        cell: (info) => (
          <span className="num font-semibold tabular-nums">
            {formatMoney(info.getValue(), info.row.original.currencyCode)}
          </span>
        ),
      }),
      columnHelper.accessor("balanceDue", {
        header: "Balance due",
        enableSorting: false,
        meta: { align: "right" },
        footer: () => footerCurrency ? formatMoney(footerBalance ?? 0, footerCurrency) : "—",
        cell: (info) => (
          <span className="num text-muted-foreground tabular-nums">
            {formatMoney(info.getValue(), info.row.original.currencyCode)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: (info) => {
          const invoice = info.row.original;
          const actions = [
            { label: "View details", onSelect: () => handleView(invoice.id) },
            { label: "Edit", onSelect: () => handleEdit(invoice.id), disabled: !isEditable(invoice.status) || pending },
            { label: "Send", onSelect: () => void handleSend(invoice.id), disabled: !canTransition(invoice.status, "SEND") || pending },
            { label: "Duplicate", onSelect: () => void handleDuplicate(invoice.id), disabled: pending },
            {
              label: "Delete draft",
              onSelect: () => setConfirmId(invoice.id),
              disabled: !isDeletable(invoice.status) || pending,
              destructive: true,
            },
          ];
          return <ActionMenu label={`Actions for ${invoice.invoiceNumber}`} actions={actions} />;
        },
      }),
    ],
    [footerBalance, footerCurrency, footerTotal, handleDuplicate, handleEdit, handleSend, handleView, pending],
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

  const statusTab: StatusTab = query.overdue
    ? "OVERDUE"
    : (query.status ?? "ALL");

  const statusOptions: { value: StatusTab; label: string }[] = [
    { value: "ALL", label: "All" },
    ...INVOICE_STATUSES.map((status) => ({ value: status, label: INVOICE_STATUS_LABEL[status] })),
    { value: "OVERDUE", label: "Overdue" },
  ];

  const today = todayCalendarDate();
  const todayDate = parseCalendarDate(today)!;
  const datePresets = [
    { id: "all", label: "All dates", from: undefined as string | undefined, to: undefined as string | undefined },
    {
      id: "month",
      label: "This month",
      from: toCalendarDateInput(new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1))),
      to: today,
    },
    {
      id: "30d",
      label: "Last 30 days",
      from: toCalendarDateInput(addCalendarDays(todayDate, -29)),
      to: today,
    },
  ];

  const currentFrom = asCalendarInput(query.from);
  const currentTo = asCalendarInput(query.to);
  const selectedCustomer = customers.find((customer) => customer.id === query.customerId);
  const currentStatusLabel = query.overdue
    ? "Overdue"
    : query.status ? INVOICE_STATUS_LABEL[query.status] : undefined;
  const hasFilters = Boolean(query.q || query.status || query.overdue || query.customerId || query.from || query.to);

  const unsettled = items.filter((item) => new Decimal(item.balanceDue).gt(0)).length;
  const overdueCount = items.filter((item) => item.displayStatus === "OVERDUE").length;
  const draftCount = items.filter((item) => item.status === "DRAFT").length;

  return (
    <div className="space-y-4" aria-busy={isNavigating}>
      <div className="ui-panel space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] xl:flex xl:items-end xl:justify-between">
          <SearchBar value={query.q ?? ""} onSearch={onSearch} placeholder="Search invoice number or customer…" />
          <div className="w-full lg:w-60">
            <label htmlFor="customerFilter" className="ui-label mb-1 block">Customer</label>
            <SearchableSelect
              id="customerFilter"
              value={query.customerId ?? null}
              options={customerOptions}
              onSearch={onCustomerSearch}
              onSelect={(option) => pushQuery({ customerId: option.id, resetCursor: true })}
              placeholder="All customers"
              ariaLabel="Filter by customer"
            />
          </div>
          <StatusTabs
            value={statusTab}
            options={statusOptions}
            onChange={(value) => {
              if (value === "OVERDUE") {
                pushQuery({ status: undefined, overdue: true, resetCursor: true });
                return;
              }
              pushQuery({
                status: value === "ALL" ? undefined : value as InvoiceStatus,
                overdue: undefined,
                resetCursor: true,
              });
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-label mr-1 inline-flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Date
          </span>
          {datePresets.map((preset) => (
            <FilterChip
              key={preset.id}
              active={currentFrom === preset.from && currentTo === preset.to}
              onClick={() => pushQuery({
                from: preset.from ? parseCalendarDate(preset.from) ?? undefined : undefined,
                to: preset.to ? parseCalendarDate(preset.to) ?? undefined : undefined,
                resetCursor: true,
              })}
            >
              {preset.label}
            </FilterChip>
          ))}
          {sorting.length > 0 ? (
            <FilterChip active onClick={() => {
              setSorting([]);
              pushQuery({ sort: "createdAt", dir: "desc", resetCursor: true });
            }}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear sort
            </FilterChip>
          ) : null}
        </div>

        {hasFilters ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="ui-label mr-1">Active filters</span>
            {query.q ? (
              <FilterChip active ariaLabel="Remove search filter" onClick={() => pushQuery({ q: undefined, resetCursor: true })}>
                Search: {query.q} <X className="h-3.5 w-3.5" aria-hidden="true" />
              </FilterChip>
            ) : null}
            {currentStatusLabel ? (
              <FilterChip active ariaLabel="Remove status filter" onClick={() => pushQuery({ status: undefined, overdue: undefined, resetCursor: true })}>
                Status: {currentStatusLabel} <X className="h-3.5 w-3.5" aria-hidden="true" />
              </FilterChip>
            ) : null}
            {query.customerId ? (
              <FilterChip active ariaLabel="Remove customer filter" onClick={() => pushQuery({ customerId: undefined, resetCursor: true })}>
                Customer: {selectedCustomer?.label ?? "Selected"} <X className="h-3.5 w-3.5" aria-hidden="true" />
              </FilterChip>
            ) : null}
            {query.from || query.to ? (
              <FilterChip active ariaLabel="Remove date filter" onClick={() => pushQuery({ from: undefined, to: undefined, resetCursor: true })}>
                Dates: {query.from ? formatDate(query.from) : "Any"} → {query.to ? formatDate(query.to) : "Any"}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </FilterChip>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => {
              setSorting([]);
              pushQuery({
                q: undefined,
                status: undefined,
                overdue: undefined,
                customerId: undefined,
                from: undefined,
                to: undefined,
                sort: "createdAt",
                dir: "desc",
                resetCursor: true,
              });
            }}>
              Clear all
            </Button>
          </div>
        ) : null}
      </div>

      <MetricStrip
        items={[
          { label: "On this page", value: items.length },
          { label: "Unsettled", value: unsettled },
          { label: "Overdue", value: overdueCount },
          { label: "Drafts", value: draftCount },
        ]}
      />

      <div className="ui-panel overflow-hidden">
        {items.length > 0 ? (
          <>
            <div className="hidden md:block">
              <DataTable table={table} />
            </div>
            <div className="grid gap-3 p-4 md:hidden">
              {items.map((invoice) => (
                <InvoiceListCard
                  key={invoice.id}
                  invoice={invoice}
                  canEdit={isEditable(invoice.status)}
                  canSend={canTransition(invoice.status, "SEND")}
                  canDelete={isDeletable(invoice.status)}
                  pending={pending}
                  onView={() => handleView(invoice.id)}
                  onEdit={() => handleEdit(invoice.id)}
                  onSend={() => void handleSend(invoice.id)}
                  onDuplicate={() => void handleDuplicate(invoice.id)}
                  onDelete={() => setConfirmId(invoice.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium">No invoices match these filters</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search or clear the filters.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push(ROUTES.invoices)}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-xs text-muted-foreground num">
          Showing {items.length}{total !== undefined ? ` of ${total.toLocaleString()}` : ""}
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
