import { printInvoicePdf } from "@/features/invoices/server/invoice-service";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await printInvoicePdf(id);

  if (!result.ok) {
    return new Response(
      `<!doctype html><html><body style="font-family:system-ui;padding:24px"><h1>Unable to print invoice</h1><p>${escapeHtml(result.error.message)}</p></body></html>`,
      { status: result.error.code === "NOT_FOUND" ? 404 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const url = escapeHtml(result.data.url);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print ${escapeHtml(result.data.filename)}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #f4f4f5; }
    iframe { display: block; width: 100%; height: 100%; border: 0; }
    @media print {
      html, body { background: #ffffff; }
      iframe { height: 100vh; }
    }
  </style>
</head>
<body>
  <iframe src="${url}" title="Invoice PDF" onload="setTimeout(function () { window.focus(); window.print(); }, 400)"></iframe>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
