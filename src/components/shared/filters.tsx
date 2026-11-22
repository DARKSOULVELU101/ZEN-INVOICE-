"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

export function StatusTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label="Filter invoices by status" className="flex gap-1 overflow-x-auto rounded-control border bg-subtle p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            option.value === value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FilterChip({
  active,
  children,
  onClick,
  ariaLabel,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "bg-card text-muted-foreground hover:bg-subtle hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
