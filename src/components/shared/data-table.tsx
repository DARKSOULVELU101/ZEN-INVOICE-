"use client";

import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Align = "left" | "center" | "right";

function alignmentClass(align: Align | undefined) {
  if (align === "right") return "text-right justify-end";
  if (align === "center") return "text-center justify-center";
  return "text-left justify-start";
}

export function DataTable<TData>({
  table,
  className,
}: {
  table: TanstackTable<TData>;
  className?: string;
}) {
  const hasFooter = table
    .getFooterGroups()
    .some((group) => group.headers.some((header) => header.column.columnDef.footer));

  return (
    <Table className={cn("min-w-[920px] border-separate border-spacing-0", className)}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="hover:bg-transparent">
            {headerGroup.headers.map((header) => {
              const sortable = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              const align = header.column.columnDef.meta?.align;
              const sticky = header.column.columnDef.meta?.sticky;
              return (
                <TableHead
                  key={header.id}
                  scope="col"
                  aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                  className={cn(
                    "h-11 border-b bg-subtle px-4 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground",
                    alignmentClass(align),
                    sticky && "sticky left-0 z-20 bg-subtle shadow-[1px_0_0_hsl(var(--border))]",
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        "inline-flex w-full items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        alignmentClass(align),
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === "asc" ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        : sorted === "desc" ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
            {row.getVisibleCells().map((cell) => {
              const align = cell.column.columnDef.meta?.align;
              const sticky = cell.column.columnDef.meta?.sticky;
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    "h-14 border-b px-4 py-3 align-middle",
                    alignmentClass(align),
                    sticky && "sticky left-0 z-10 bg-card shadow-[1px_0_0_hsl(var(--border))]",
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
      {hasFooter ? (
        <tfoot>
          {table.getFooterGroups().map((footerGroup) => (
            <TableRow key={footerGroup.id} className="hover:bg-transparent">
              {footerGroup.headers.map((header) => {
                const align = header.column.columnDef.meta?.align;
                const sticky = header.column.columnDef.meta?.sticky;
                return (
                  <TableCell
                    key={header.id}
                    className={cn(
                      "h-12 border-t bg-subtle px-4 py-2 text-xs font-semibold",
                      alignmentClass(align),
                      sticky && "sticky left-0 z-10 bg-subtle shadow-[1px_0_0_hsl(var(--border))]",
                    )}
                  >
                    {header.column.columnDef.footer
                      ? flexRender(header.column.columnDef.footer, header.getContext())
                      : null}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </tfoot>
      ) : null}
    </Table>
  );
}
