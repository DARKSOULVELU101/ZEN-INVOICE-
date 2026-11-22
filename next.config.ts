import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@react-pdf/renderer", "@react-pdf/font", "pdfkit"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@react-pdf/font/node_modules/pdfkit/js/standard-fonts/**/*",
      "./node_modules/pdfkit/js/standard-fonts/**/*",
    ],
  },
};

export default nextConfig;
