import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runIntegrityAudit, runSchemaAudit } from "../src/lib/health/schema-audit";

const prisma = new PrismaClient();

async function main() {
  const [schema, integrity] = await Promise.all([
    runSchemaAudit(prisma),
    runIntegrityAudit(prisma),
  ]);
  const failures = [...schema.failures, ...integrity.failures];
  console.log(JSON.stringify({
    ok: failures.length === 0,
    schema: { ok: schema.ok, failures: schema.failures },
    integrity: { ok: integrity.ok, failures: integrity.failures },
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
