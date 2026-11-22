const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const serverRoot = path.join(projectRoot, ".next", "server");
const requiredAssets = [
  "@react-pdf/font/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs",
  "@react-pdf/renderer/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs",
  "pdfkit/js/standard-fonts/Helvetica.cjs",
  "public/fonts/invoice/NotoSans-Regular.ttf",
  "public/fonts/invoice/NotoSans-Bold.ttf",
];

function normalize(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.name.endsWith(".nft.json") ? [fullPath] : [];
  });
}

function traceFiles(tracePath) {
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
  return (trace.files ?? []).flatMap((file) => {
    if (typeof file === "string") return [normalize(file)];
    return [normalize(file.input ?? ""), ...(file.output ?? []).map(normalize)];
  });
}

const pdfTracePaths = [
  "(platform)/invoices/page.js.nft.json",
  "(platform)/invoices/[id]/page.js.nft.json",
  "(platform)/invoices/[id]/edit/page.js.nft.json",
  "invoices/[id]/print/route.js.nft.json",
];

const traces = walk(serverRoot)
  .map((tracePath) => ({ tracePath, files: traceFiles(tracePath) }))
  .filter(({ tracePath }) => {
    const normalized = normalize(path.relative(serverRoot, tracePath));
    return pdfTracePaths.some((trace) => normalized.endsWith(trace));
  });

const results = traces.map(({ tracePath, files }) => ({
  trace: path.relative(projectRoot, tracePath).replace(/\\/g, "/"),
  missing: requiredAssets.filter((asset) => !files.some((file) => file.includes(asset))),
}));

const ok = results.length > 0 && results.every((result) => result.missing.length === 0);
console.log(JSON.stringify({ ok, traces: results }, null, 2));
if (!ok) process.exitCode = 1;
