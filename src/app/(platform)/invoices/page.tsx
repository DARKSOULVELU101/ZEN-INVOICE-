import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/shared/feedback";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/app";
import { listInvoices } from "@/features/invoices/server/invoice-service";
import { parseInvoiceListQuery } from "@/features/invoices/schemas/invoice";
import { InvoiceListClient } from "@/features/invoices/components/list/invoice-list-client";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function InvoiceResults({ searchParams }: { searchParams: SearchParams }) {
  const incoming = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(incoming)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }

  const query = parseInvoiceListQuery(params);
  const result = await listInvoices(query);

  if (!result.ok) {
    return <ErrorState description={result.error.message} />;
  }

  const hasFilters = Boolean(query.q || query.status || query.overdue || query.customerId || query.from || query.to);
  if (result.data.items.length === 0 && !hasFilters && !query.cursor) {
    return (
      <EmptyState
        title="No invoices yet"
        description="Create your first invoice to start tracking receivables, payments and customer history."
        action={
          <Button asChild>
            <Link href={ROUTES.invoiceNew}>
              <Plus aria-hidden="true" /> Create invoice
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <InvoiceListClient
      items={result.data.items}
      query={query}
      total={result.data.total}
      nextCursor={result.data.nextCursor}
    />
  );
}

export default function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Create, send and track every invoice in one place."
        actions={
          <Button asChild>
            <Link href={ROUTES.invoiceNew}>
              <Plus aria-hidden="true" /> New invoice
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <InvoiceResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
