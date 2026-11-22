import type * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

export function ErrorSummary({ errors }: { errors: Record<string, string | undefined> }) {
  const entries = Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (entries.length === 0) return null;

  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      <p className="font-semibold">Please review the following:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {entries.map(([field, message]) => (
          <li key={field}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
