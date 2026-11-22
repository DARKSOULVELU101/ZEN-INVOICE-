const fs = require("node:fs");
const path = require("node:path");
const selfsigned = require("selfsigned");

const certPath = path.join(__dirname, "e2e-ca.pem");
const keyPath = path.join(__dirname, "e2e-key.pem");
const attrs = [{ name: "commonName", value: "127.0.0.1" }];

async function main() {
  const pems = await selfsigned.generate(attrs, {
    algorithm: "sha256",
    days: 1,
    keySize: 2048,
    extensions: [
      { name: "basicConstraints", cA: true, critical: true },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, keyCertSign: true, critical: true },
      {
        name: "extKeyUsage",
        serverAuth: true,
        clientAuth: true,
      },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ],
  });

  fs.writeFileSync(certPath, pems.cert, "utf8");
  fs.writeFileSync(keyPath, pems.private, "utf8");
  process.stdout.write("Generated E2E TLS certificate.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
