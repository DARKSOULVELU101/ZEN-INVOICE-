import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCodes } from "@/lib/errors/result";
import { getInvoice } from "@/features/invoices/server/invoice-service";
import { InvoiceDetailView } from "@/features/invoices/components/detail/invoice-detail-view";

export const dynamic = "force-dynamic";

async function InvoiceDetailContent({ id }: { id: string }) {
  const result = await getInvoice(id);
  if (!result.ok) {
    if (result.error.code === ErrorCodes.NOT_FOUND) notFound();
    return <ErrorState description={result.error.message} />;
  }

  return <InvoiceDetailView invoice={result.data} />;
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-page space-y-6" aria-busy="true">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <InvoiceDetailContent id={id} />
    </Suspense>
  );
}

export const metadata = { title: "Invoice detail" };
