import { formatMoney, formatNumber } from "@/lib/format/format";

export interface InvoicePdfLine {
  description: string;
  hsnSac: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  amount: string;
  taxNames: string[];
}

export interface InvoicePdfData {
  companyName: string;
  companyLegalName: string | null;
  companyGstin: string | null;
  companyAddressLines: string[];
  customerName: string;
  customerCompany: string | null;
  customerGstin: string | null;
  customerEmail: string | null;
  customerAddressLines: string[];
  invoiceNumber: string;
  issueDate: string;
  invoiceDate: string;
  dueDate: string;
  reference: string | null;
  currencyCode: string;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  shippingAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  taxAmount: string;
  roundOffAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  footer: string | null;
  lines: InvoicePdfLine[];
}

const MARGIN = 40;

function safe(value: string | null | undefined, fallback = "—"): string {
  const text = value?.trim();
  return text ? text : fallback;
}

function money(value: string, currency: string): string {
  return formatMoney(value, currency).replace(/[^\x20-\x7E]/g, "");
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Invoice ${data.invoiceNumber}`,
        Author: data.companyName,
        Subject: `Invoice ${data.invoiceNumber} from ${data.companyName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const rightEdge = pageWidth - MARGIN;
    const contentWidth = rightEdge - MARGIN;
    const columnX = [MARGIN, 270, 350, 420, 490, 555];
    const columnWidths = [220, 70, 60, 60, 60, rightEdge - 555];

    const textAt = (
      value: string,
      x: number,
      y: number,
      width: number,
      options: PDFKit.Mixins.TextOptions = {},
    ) => {
      doc.font("Helvetica").fontSize(9).fillColor("#27272a").text(value, x, y, { width, ...options });
    };

    const line = (y: number) => {
      doc.moveTo(MARGIN, y).lineTo(rightEdge, y).lineWidth(0.8).strokeColor("#d4d4d8").stroke();
    };

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#18181b").text(data.companyName, MARGIN, MARGIN, { width: 300 });
    let companyY = doc.y + 2;
    if (data.companyLegalName && data.companyLegalName !== data.companyName) {
      textAt(data.companyLegalName, MARGIN, companyY, 300, { lineGap: 2 });
      companyY = doc.y + 2;
    }
    if (data.companyGstin) {
      textAt(`GSTIN ${data.companyGstin}`, MARGIN, companyY, 300);
      companyY = doc.y + 2;
    }
    for (const addressLine of data.companyAddressLines.filter(Boolean)) {
      textAt(addressLine, MARGIN, companyY, 300);
      companyY = doc.y + 2;
    }

    doc.font("Helvetica-Bold").fontSize(24).fillColor("#18181b").text("INVOICE", 430, MARGIN, {
      width: rightEdge - 430,
      align: "right",
    });
    doc.font("Helvetica").fontSize(9).fillColor("#52525b").text(data.invoiceNumber, 430, MARGIN + 32, {
      width: rightEdge - 430,
      align: "right",
    });

    let y = Math.max(companyY, MARGIN + 62) + 12;
    line(y);
    y += 18;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#18181b").text("BILL TO", MARGIN, y);
    textAt(safe(data.customerCompany ?? data.customerName), MARGIN, y + 16, 240);
    let billY = y + 30;
    textAt(data.customerName, MARGIN, billY, 240);
    billY += 13;
    if (data.customerGstin) {
      textAt(`GSTIN ${data.customerGstin}`, MARGIN, billY, 240);
      billY += 13;
    }
    if (data.customerEmail) {
      textAt(data.customerEmail, MARGIN, billY, 240);
      billY += 13;
    }
    for (const addressLine of data.customerAddressLines.filter(Boolean)) {
      textAt(addressLine, MARGIN, billY, 240);
      billY += 13;
    }

    const metaX = 340;
    const metaRows: [string, string][] = [
      ["Invoice no.", data.invoiceNumber],
      ["Invoice date", data.invoiceDate],
      ["Issue date", data.issueDate],
      ["Due date", data.dueDate],
      ["Reference", safe(data.reference)],
      ["Currency", data.currencyCode],
    ];
    let metaY = y;
    for (const [label, value] of metaRows) {
      doc.font("Helvetica").fontSize(9).fillColor("#71717a").text(label, metaX, metaY, { width: 100 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#18181b").text(value, metaX + 105, metaY, {
        width: rightEdge - (metaX + 105),
        align: "right",
      });
      metaY += 16;
    }

    y = Math.max(billY, metaY) + 18;
    line(y);
    y += 16;

    const drawTableHeader = (position: number) => {
      doc.rect(MARGIN, position - 4, contentWidth, 22).fill("#f4f4f5");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#3f3f46");
      const headings = ["Description", "HSN/SAC", "Qty", "Rate", "Tax", "Amount"];
      headings.forEach((heading, index) => {
        doc.text(heading, columnX[index], position, {
          width: columnWidths[index],
          align: index === 0 ? "left" : "right",
        });
      });
      return position + 24;
    };

    y = drawTableHeader(y);

    for (const item of data.lines) {
      const description = safe(item.description);
      const taxLabel = item.taxNames.length ? item.taxNames.join(", ") : "Nil";
      doc.font("Helvetica").fontSize(8).fillColor("#27272a");
      const descriptionLines = doc.heightOfString(description, { width: columnWidths[0] - 6 });
      const taxLines = doc.heightOfString(taxLabel, { width: columnWidths[4] - 6 });
      const rowHeight = Math.max(20, descriptionLines + taxLines + 8);

      if (y + rowHeight > doc.page.height - 120) {
        doc.addPage();
        y = drawTableHeader(MARGIN + 8);
      }

      textAt(description, columnX[0], y, columnWidths[0] - 6);
      textAt(safe(item.hsnSac, "-"), columnX[1], y, columnWidths[1] - 4, { align: "right" });
      textAt(formatNumber(item.quantity, "en-IN", 2), columnX[2], y, columnWidths[2] - 4, { align: "right" });
      textAt(money(item.unitPrice, data.currencyCode), columnX[3], y, columnWidths[3] - 4, { align: "right" });
      textAt(taxLabel, columnX[4], y, columnWidths[4] - 4, { align: "right" });
      textAt(money(item.amount, data.currencyCode), columnX[5], y, columnWidths[5], { align: "right" });
      y += rowHeight;
      line(y - 4);
      y += 4;
    }

    y += 12;
    const totalsX = 365;
    const totalsWidth = rightEdge - totalsX;
    const totalRows: [string, string, boolean?][] = [
      ["Subtotal", money(data.subtotal, data.currencyCode)],
      ["Discount", `-${money(data.discountAmount, data.currencyCode)}`],
      ["Taxable amount", money(data.taxableAmount, data.currencyCode)],
      ["CGST", money(data.cgstAmount, data.currencyCode)],
      ["SGST", money(data.sgstAmount, data.currencyCode)],
      ["IGST", money(data.igstAmount, data.currencyCode)],
      ["Shipping", money(data.shippingAmount, data.currencyCode)],
      ["Round off", money(data.roundOffAmount, data.currencyCode)],
      ["Total tax", money(data.taxAmount, data.currencyCode)],
      ["Grand total", money(data.total, data.currencyCode), true],
      ["Amount paid", money(data.amountPaid, data.currencyCode)],
      ["Balance due", money(data.balanceDue, data.currencyCode), true],
    ];

    for (const [label, value, emphasis] of totalRows) {
      doc.font(emphasis ? "Helvetica-Bold" : "Helvetica").fontSize(emphasis ? 10 : 9).fillColor("#18181b");
      doc.text(label, totalsX, y, { width: totalsWidth / 2 });
      doc.text(value, totalsX + totalsWidth / 2, y, { width: totalsWidth / 2, align: "right" });
      y += emphasis ? 19 : 15;
    }

    y += 14;
    line(y);
    y += 14;

    if (data.notes) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#18181b").text("Notes", MARGIN, y);
      textAt(data.notes, MARGIN, y + 14, contentWidth, { lineGap: 2 });
      y = doc.y + 12;
    }

    if (data.terms) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#18181b").text("Terms & conditions", MARGIN, y);
      textAt(data.terms, MARGIN, y + 14, contentWidth, { lineGap: 2 });
      y = doc.y + 12;
    }

    if (data.footer) {
      doc.fillColor("#71717a");
      textAt(data.footer, MARGIN, y + 4, contentWidth, { align: "center" });
      doc.fillColor("#27272a");
    }

    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      doc.font("Helvetica").fontSize(8).fillColor("#a1a1aa").text(
        `${data.companyName} | ${data.invoiceNumber} | Page ${index + 1} of ${range.count}`,
        MARGIN,
        doc.page.height - 28,
        { width: contentWidth, align: "center" },
      );
    }

    doc.end();
  });
}
