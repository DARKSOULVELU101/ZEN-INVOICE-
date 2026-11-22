import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { PlatformNav, OrganizationBadge } from "@/components/shared/platform-nav";
import { APP } from "@/config/app";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{APP.name}</p>
            <p className="truncate text-xs text-muted-foreground">Accounting suite</p>
          </div>
        </div>

        <OrganizationBadge name={session.organizationName} />

        <div className="mt-6">
          <PlatformNav variant="sidebar" />
        </div>

        <div className="mt-auto border-t pt-4">
          <p className="truncate text-xs font-medium">{session.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">{APP.name}</span>
          </div>
          <div className="hidden text-sm text-muted-foreground lg:block">
            {session.organizationName} · {session.roles.join(", ")}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/invoices" className="rounded-control border bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-subtle">
              {session.user.name}
            </Link>
          </div>
        </header>

        <nav aria-label="Mobile navigation" className="sticky top-14 z-20 flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 lg:hidden">
          <PlatformNav variant="mobile" />
        </nav>

        <main className="mx-auto w-full max-w-page flex-1 px-4 pb-12 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
