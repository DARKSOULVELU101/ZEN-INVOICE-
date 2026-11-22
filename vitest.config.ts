import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/errors/**/*.ts",
        "src/lib/money/**/*.ts",
        "src/lib/security/**/*.ts",
        "src/lib/auth/route-guard.ts",
        "src/features/email/domain/**/*.ts",
        "src/features/invoices/domain/**/*.ts",
        "src/features/invoices/schemas/**/*.ts",
        "src/features/catalog/schemas/**/*.ts",
        "src/features/partners/schemas/**/*.ts",
        "src/features/invoices/pdf/invoice-document.tsx",
      ],
      exclude: ["src/**/*.d.ts", "src/**/*.test.*"],
      thresholds: {
        lines: 80,
        functions: 60,
        branches: 70,
        statements: 80,
      },
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
