import { runProductionReadinessChecks } from "../src/lib/health/production-readiness";

async function main() {
  const report = await runProductionReadinessChecks();
  for (const check of report.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  console.log(`Production readiness score: ${report.score}%`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
