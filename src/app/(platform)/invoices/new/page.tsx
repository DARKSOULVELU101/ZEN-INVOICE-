import { Suspense } from "react";
import { ErrorState } from "@/components/shared/feedback";
import { FormSkeleton } from "@/components/shared/skeletons";
import { getInvoiceFormOptions } from "@/features/invoices/server/form-options";
import { InvoiceForm } from "@/features/invoices/components/shared/invoice-form";

export const metadata = { title: "New invoice" };
export const dynamic = "force-dynamic";

async function CreateInvoiceContent() {
  const result = await getInvoiceFormOptions();
  if (!result.ok) return <ErrorState description={result.error.message} />;
  return <InvoiceForm options={result.data} mode="create" />;
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <CreateInvoiceContent />
    </Suspense>
  );
}
