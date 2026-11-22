"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  currency,
  error,
  placeholder = "0.00",
  disabled,
}: {
  id: string;
  value: string | number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("pr-16 text-right font-mono tabular-nums", error && "border-destructive")}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
        {currency}
      </span>
    </div>
  );
}
