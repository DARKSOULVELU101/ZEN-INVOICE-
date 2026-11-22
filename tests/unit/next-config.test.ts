import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js production packaging", () => {
  it("keeps the React PDF renderer and its PDFKit dependency external", () => {
    expect(nextConfig.serverExternalPackages).toEqual(
      expect.arrayContaining([
        "@react-pdf/renderer",
        "@react-pdf/font",
        "pdfkit",
      ]),
    );
  });

  it("traces the PDFKit standard fonts needed at runtime", () => {
    const includes = nextConfig.outputFileTracingIncludes?.["/*"] ?? [];

    expect(includes).toEqual(
      expect.arrayContaining([
        "./node_modules/@react-pdf/font/node_modules/pdfkit/js/standard-fonts/**/*",
        "./node_modules/pdfkit/js/standard-fonts/**/*",
      ]),
    );
  });
});
