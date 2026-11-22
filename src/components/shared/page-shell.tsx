import type * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageShell({
  title,
  description,
  breadcrumb,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-page space-y-6", className)}>
      <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          {breadcrumb ? <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">{breadcrumb}</nav> : null}
          <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.02em]">{title}</h1>
          {description ? <p className="max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function BreadcrumbItem({ href, children }: { href?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {href ? <Link href={href} className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</Link> : <span className="font-medium text-foreground">{children}</span>}
      <span aria-hidden="true">/</span>
    </span>
  );
}

export function BreadcrumbTrail({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {item.href ? (
            <Link href={item.href} className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.label}</Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
          {index < items.length - 1 ? <span className="mx-2" aria-hidden="true">/</span> : null}
        </span>
      ))}
    </>
  );
}
