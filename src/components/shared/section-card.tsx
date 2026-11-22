import type * as React from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
}) {
  return (
    <section className={cn("ui-panel overflow-hidden", className)}>
      <div className={cn("ui-section flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", headerClassName)}>
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold leading-6 tracking-[-0.01em]">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("p-6", contentClassName)}>{children}</div>
    </section>
  );
}

export function SummaryPanel({
  title = "Summary",
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ui-panel h-fit", className)} aria-label={title}>
      <header className="ui-section">
        <h2 className="text-base font-semibold leading-6">{title}</h2>
      </header>
      <div className="space-y-3 p-6">{children}</div>
    </section>
  );
}

export function SummaryRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 text-sm", emphasis && "border-t border-border pt-4 text-base font-semibold")}>
      <span className={cn(muted ? "text-muted-foreground" : "text-foreground", !emphasis && "font-normal")}>{label}</span>
      <span className={cn("num shrink-0 tabular-nums", emphasis && "text-lg tracking-[-0.02em]")}>{value}</span>
    </div>
  );
}

export function ComputedField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="ui-label">{label}</span>
      <div className="flex h-10 items-center rounded-control border bg-subtle px-3 text-sm num tabular-nums">
        {value || "—"}
      </div>
    </div>
  );
}

export function MetricStrip({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-panel border bg-card px-4 py-3 text-sm shadow-panel">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="num font-semibold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
