import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runIntegrityAudit } from "../src/lib/health/schema-audit";

const prisma = new PrismaClient();

async function main() {
  const result = await runIntegrityAudit(prisma);
  console.log(JSON.stringify({
    relationships: result.relationships,
    invariants: result.invariants,
    failures: result.failures,
    ok: result.ok,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
