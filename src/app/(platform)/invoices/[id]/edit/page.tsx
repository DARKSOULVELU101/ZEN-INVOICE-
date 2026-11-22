import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/feedback";
import { FormSkeleton } from "@/components/shared/skeletons";
import { ErrorCodes } from "@/lib/errors/result";
import { isEditable } from "@/features/invoices/domain/status";
import { getInvoice } from "@/features/invoices/server/invoice-service";
import { getInvoiceFormOptions } from "@/features/invoices/server/form-options";
import { InvoiceForm } from "@/features/invoices/components/shared/invoice-form";

export const metadata = { title: "Edit invoice" };
export const dynamic = "force-dynamic";

async function EditInvoiceContent({ id }: { id: string }) {
  const [optionsResult, invoiceResult] = await Promise.all([
    getInvoiceFormOptions(),
    getInvoice(id),
  ]);

  if (!invoiceResult.ok) {
    if (invoiceResult.error.code === ErrorCodes.NOT_FOUND) notFound();
    return <ErrorState description={invoiceResult.error.message} />;
  }
  if (!optionsResult.ok) return <ErrorState description={optionsResult.error.message} />;

  if (!isEditable(invoiceResult.data.status)) {
    return (
      <ErrorState
        title="This invoice cannot be edited"
        description={`Invoices in ${invoiceResult.data.status} status are locked. Create a credit note in a later phase instead.`}
      />
    );
  }

  return <InvoiceForm options={optionsResult.data} mode="edit" detail={invoiceResult.data} />;
}

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditInvoiceContent id={id} />
    </Suspense>
  );
}
