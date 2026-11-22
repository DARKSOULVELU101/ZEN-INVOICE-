import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/config/app";
import { getReport } from "@/features/reports/server/report-service";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function metric(value: string | undefined, currency: string): string {
  return value ? `${value} ${currency}` : "—";
}

export default async function DashboardPage() {
  const [sales, outstanding, gstResult] = await Promise.all([
    getReport({ type: "SALES" }),
    getReport({ type: "OUTSTANDING" }),
    getReport({ type: "GST" }),
  ]);

  if (!sales.ok || !outstanding.ok || !gstResult.ok) {
    return <ErrorState description="Dashboard metrics are unavailable." />;
  }

  const totals = [
    { label: "Issued revenue", value: metric(sales.data.summary.billed, sales.data.currency) },
    { label: "Collected", value: metric(sales.data.summary.paid, sales.data.currency) },
    { label: "Outstanding", value: metric(outstanding.data.summary.outstanding, outstanding.data.currency) },
    { label: "GST collected", value: metric(
      String(Number(gstResult.data.summary.cgst) + Number(gstResult.data.summary.sgst) + Number(gstResult.data.summary.igst)),
      gstResult.data.currency,
    ) },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Live accounting position from invoices, payments and GST snapshots."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="num text-2xl">{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            Invoice management
          </CardTitle>
          <CardDescription>
            Create drafts, send them to customers, track payments and review the full audit timeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={ROUTES.invoices}>
              Open invoices <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={ROUTES.reports}>View reports</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
