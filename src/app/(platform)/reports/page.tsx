import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toCalendarDateInput } from "@/features/invoices/domain/dates";
import { reportTypes, reportQuerySchema } from "@/features/reports/schemas/report";
import { getReport } from "@/features/reports/server/report-service";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const incoming = await searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    const item = first(value);
    if (item) raw[key] = item;
  }
  const parsed = reportQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : reportQuerySchema.parse({});
  const result = await getReport(query);
  const report = result.ok ? result.data : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Live financial reports generated from invoice and payment data." />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Report</span>
              <select
                name="type"
                defaultValue={query.type}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {reportTypes.map((type) => (
                  <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">From</span>
              <input
                type="date"
                name="from"
                defaultValue={query.from ? toCalendarDateInput(query.from) : undefined}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">To</span>
              <input
                type="date"
                name="to"
                defaultValue={query.to ? toCalendarDateInput(query.to) : undefined}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <Button type="submit">Generate</Button>
            <Button type="button" variant="ghost" asChild>
              <Link href="/reports">Reset</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      {!result.ok || !report ? (
        <ErrorState description={result.ok ? "Report data was unavailable." : result.error.message} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{report.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{report.description}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-4 text-sm">
              {Object.entries(report.summary).map(([key, value]) => (
                <div key={key} className="rounded-md border px-3 py-2">
                  <span className="block text-xs uppercase tracking-wide text-muted-foreground">{key}</span>
                  <span className="num font-medium">{value} {report.currency}</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {report.columns.map((column) => (
                      <TableHead key={column.key} className={column.numeric ? "text-right" : undefined}>
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={report.columns.length} className="text-center text-muted-foreground">
                        No data for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : report.rows.map((row, index) => (
                    <TableRow key={index}>
                      {report.columns.map((column) => (
                        <TableCell key={column.key} className={column.numeric ? "num text-right" : undefined}>
                          {String(row[column.key] ?? "—")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
