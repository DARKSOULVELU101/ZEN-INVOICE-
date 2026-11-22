"use client";

import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function DataTable<TData>({
  table,
  className,
}: {
  table: TanstackTable<TData>;
  className?: string;
}) {
  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
            {headerGroup.headers.map((header) => {
              const sortable = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <TableHead key={header.id} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                  {sortable ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id} className={cn(cell.column.columnDef.meta && "tabular-nums")}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
