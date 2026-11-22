const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const pems = {
  cert: fs.readFileSync(path.join(__dirname, "e2e-ca.pem"), "utf8"),
  private: fs.readFileSync(path.join(__dirname, "e2e-key.pem"), "utf8"),
};

const storedFiles = new Map();
let emailCalls = 0;

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function handle(req, res) {
  const url = new URL(req.url ?? "/", "https://127.0.0.1:4010");

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/__calls") {
    sendJson(res, 200, { emailCalls, storedFiles: storedFiles.size });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/send-invoice") {
    if (req.headers["x-email-api-token"] !== "e2e-email-token") {
      sendJson(res, 401, { detail: "Invalid token" });
      return;
    }
    req.resume();
    req.on("end", () => {
      emailCalls += 1;
      sendJson(res, 200, { providerMessageId: `e2e-${randomUUID()}` });
    });
    return;
  }

  const signMatch = url.pathname.match(/^\/storage\/v1\/object\/sign\/[^/]+\/(.+)$/);
  if (req.method === "POST" && signMatch) {
    const objectPath = decodeURIComponent(signMatch[1]);
    req.resume();
    req.on("end", () => sendJson(res, 200, { signedURL: `/object/${objectPath}?token=e2e` }));
    return;
  }

  const objectMatch = url.pathname.match(/^\/storage\/v1\/object\/[^/]+\/(.+)$/);
  if (req.method === "POST" && objectMatch) {
    const objectPath = decodeURIComponent(objectMatch[1]);
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      storedFiles.set(objectPath, Buffer.concat(chunks));
      sendJson(res, 200, { Key: objectPath });
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/storage/v1/object/")) {
    const objectPath = url.pathname.replace("/storage/v1/object/", "");
    const bytes = storedFiles.get(decodeURIComponent(objectPath));
    if (!bytes) {
      sendJson(res, 404, { detail: "Not found" });
      return;
    }
    res.writeHead(200, { "content-type": "application/pdf", "content-disposition": "inline" });
    res.end(bytes);
    return;
  }

  sendJson(res, 404, { detail: "Not found" });
}

http.createServer(handle).listen(4009, "127.0.0.1", () => {
  process.stdout.write("E2E mock health listening on http://127.0.0.1:4009\n");
});

https.createServer({ key: pems.private, cert: pems.cert }, handle).listen(4010, "127.0.0.1", () => {
  process.stdout.write("E2E email and storage mock listening on https://127.0.0.1:4010\n");
});
