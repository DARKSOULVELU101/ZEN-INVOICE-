require("dotenv").config({ path: ".env.test.local" });
const { spawnSync } = require("node:child_process");

if (!process.env.DATABASE_URL?.includes("zen_invoice_e2e")) {
  throw new Error("DATABASE_URL must point to the zen_invoice_e2e test database.");
}

const commands = [
  ["npx", "prisma", "migrate", "reset", "--force", "--skip-seed"],
  ["npm", "run", "db:seed:dev"],
  ["npm", "run", "db:seed:admin"],
];

for (const [command, ...args] of commands) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
