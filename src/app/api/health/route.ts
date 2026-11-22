import { NextResponse } from "next/server";
import { runProductionReadinessChecks } from "@/lib/health/production-readiness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const report = await runProductionReadinessChecks();
  const healthToken = process.env.HEALTH_CHECK_TOKEN?.trim();
  const authorized = !healthToken || request.headers.get("x-health-token") === healthToken;
  const payload = authorized
    ? { ...report, timestamp: new Date().toISOString() }
    : { ok: report.ok, score: report.score, timestamp: new Date().toISOString() };
  return NextResponse.json(payload, { status: report.ok ? 200 : 503 });
}
