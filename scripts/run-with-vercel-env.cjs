require("dotenv").config({ path: ".env.local" });
const { spawnSync } = require("node:child_process");

const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
