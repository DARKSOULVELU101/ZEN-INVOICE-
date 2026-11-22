import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3, Building2, CreditCard, FileText, LayoutDashboard,
  Package, Users, ChevronsUpDown,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { NAV_ITEMS, type NavItem } from "@/config/navigation";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ICONS: Record<NavItem["icon"], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  invoices: FileText,
  customers: Users,
  products: Package,
  payments: CreditCard,
  reports: BarChart3,
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.icon];
  const shared = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

  if (!item.available) {
    return (
      <span
        aria-disabled="true"
        title="Available in a later phase"
        className={cn(shared, "cursor-not-allowed text-muted-foreground/55")}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="hidden lg:inline">{item.label}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        shared,
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">{item.label}</span>
    </Link>
  );
}

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r bg-card px-2 py-4 lg:flex lg:w-60 lg:px-4">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold">{APP.name}</p>
            <p className="truncate text-xs text-muted-foreground">Accounting suite</p>
          </div>
        </div>

        <div className="hidden rounded-lg border bg-background p-2 lg:block">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{session.organizationName}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>

        <nav aria-label="Main navigation" className="mt-6 flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={item.href === "/invoices"}
            />
          ))}
        </nav>

        <div className="hidden border-t pt-4 lg:block">
          <p className="truncate text-xs font-medium">{session.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">{APP.name}</span>
          </div>
          <div className="hidden text-sm text-muted-foreground lg:block">
            {session.organizationName} · {session.roles.join(", ")}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border bg-card px-2.5 py-1 text-xs font-medium">{session.user.name}</span>
          </div>
        </header>

        <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 lg:hidden">
          {NAV_ITEMS.filter((item) => item.available).map((item) => (
            <NavLink key={item.href} item={item} active={item.href === "/invoices"} />
          ))}
        </nav>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
