const { spawnSync } = require("node:child_process");

const WAIVED_POSTCSS_ADVISORIES = new Set([
  "https://github.com/advisories/GHSA-qx2v-qp2m-jg93",
  "https://github.com/advisories/GHSA-6g55-p6wh-862q",
  "https://github.com/advisories/GHSA-fxqj-rqcc-2cmp",
  "https://github.com/advisories/GHSA-r28c-9q8g-f849",
]);
const WAIVER_EXPIRES = "2026-12-31";

const npmArgs = ["audit", "--omit=dev", "--audit-level=high", "--json"];
const result = process.platform === "win32"
  ? spawnSync("cmd", ["/c", "npm", ...npmArgs], { encoding: "utf8" })
  : spawnSync("npm", npmArgs, { encoding: "utf8" });

let audit;
try {
  audit = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stdout || result.stderr || "Unable to parse npm audit output.\n");
  process.exit(1);
}

const blocking = [];
for (const vulnerability of Object.values(audit.vulnerabilities ?? {})) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;

  const isNextPostcss =
    vulnerability.name === "postcss" &&
    vulnerability.nodes?.every((node) => node.startsWith("node_modules/next/node_modules/postcss")) &&
    vulnerability.fixAvailable?.isSemVerMajor === true &&
    vulnerability.via?.every((via) => typeof via !== "string" && WAIVED_POSTCSS_ADVISORIES.has(via.url));

  if (!isNextPostcss) blocking.push(vulnerability.name);
}

if (Date.now() > new Date(`${WAIVER_EXPIRES}T23:59:59Z`).getTime()) {
  blocking.push("expired dependency waiver");
}

if (blocking.length > 0) {
  process.stderr.write(`Blocking production advisories: ${[...new Set(blocking)].join(", ")}\n`);
  process.exit(1);
}

process.stdout.write("Production dependency audit passed with documented waivers.\n");
