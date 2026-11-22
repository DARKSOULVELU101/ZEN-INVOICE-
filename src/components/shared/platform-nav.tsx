"use client";

import type * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, CreditCard, FileText, LayoutDashboard,
  Package, Users,
} from "lucide-react";
import { navItemsForPermissions, type NavItem } from "@/config/navigation";
import type { PermissionKey } from "@/config/permissions";
import { cn } from "@/lib/utils";

const ICONS: Record<NavItem["icon"], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  invoices: FileText,
  customers: Users,
  products: Package,
  payments: CreditCard,
  reports: BarChart3,
};

export function PlatformNav({
  variant,
  permissions = [],
}: {
  variant: "sidebar" | "mobile";
  permissions?: readonly PermissionKey[];
}) {
  const pathname = usePathname();
  const showLabel = variant === "sidebar";
  const items = navItemsForPermissions(permissions);

  return (
    <nav aria-label={variant === "sidebar" ? "Main navigation" : "Mobile navigation"} className="flex-1 space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const classes = cn(
          "flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
          showLabel ? "w-full" : "shrink-0",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );

        if (!item.available) {
          return (
            <span key={item.href} aria-disabled="true" title="Available in a later phase" className={cn(classes, "cursor-not-allowed opacity-50")}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {showLabel ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
            </span>
          );
        }

        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={classes}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {showLabel ? <span>{item.label}</span> : <span className="whitespace-nowrap text-xs">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function OrganizationBadge({ name }: { name: string }) {
  return (
    <div className="hidden rounded-panel border bg-background p-2 lg:block">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
      </div>
    </div>
  );
}
