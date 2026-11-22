import { NextResponse } from "next/server";
import { runProductionReadinessChecks } from "@/lib/health/production-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runProductionReadinessChecks();
  return NextResponse.json(
    {
      ...report,
      timestamp: new Date().toISOString(),
    },
    { status: report.ok ? 200 : 503 },
  );
}
