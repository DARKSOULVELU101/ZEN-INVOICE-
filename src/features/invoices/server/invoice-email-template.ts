export interface InvoiceEmailInput {
  invoiceNumber: string;
  customerName: string;
  customerCompany?: string | null;
  companyName: string;
  amount: string;
  dueDate: string;
}

export interface InvoiceEmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayDueDate(value: string): string {
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (calendarDate) return `${calendarDate[3]}-${calendarDate[2]}-${calendarDate[1]}`;

  return value;
}

export function buildInvoiceEmail(input: InvoiceEmailInput): InvoiceEmailContent {
  const customer = input.customerName.trim() || "Customer";
  const company = input.customerCompany?.trim();
  const dueDate = displayDueDate(input.dueDate);
  const subject = `Invoice ${input.invoiceNumber} from ${input.companyName}`;

  const text = [
    `Dear ${customer},`,
    "",
    `Please find attached your invoice from ${input.companyName}.`,
    ...(company ? [`Company: ${company}`] : []),
    "",
    `Invoice Number: ${input.invoiceNumber}`,
    `Amount: ${input.amount}`,
    `Due Date: ${dueDate}`,
    "",
    "Thank you for your business.",
    "",
    input.companyName,
  ].join("\n");

  const html = [
    "<!doctype html>",
    '<html><body style="margin:0;background:#f5f5f4;padding:24px;font-family:Arial,sans-serif;color:#18181b;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">',
    '<tr><td style="padding:32px;">',
    `<p style="margin:0 0 20px;font-size:16px;">Dear ${escapeHtml(customer)},</p>`,
    `<p style="margin:0 0 20px;font-size:14px;line-height:22px;">Please find attached your invoice from <strong>${escapeHtml(input.companyName)}</strong>.</p>`,
    company ? `<p style="margin:0 0 20px;font-size:14px;color:#52525b;">Company: ${escapeHtml(company)}</p>` : "",
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">',
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:13px;color:#71717a;">Invoice Number</td>',
    `<td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:14px;text-align:right;"><strong>${escapeHtml(input.invoiceNumber)}</strong></td></tr>`,
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:13px;color:#71717a;">Amount</td>',
    `<td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:14px;text-align:right;"><strong>${escapeHtml(input.amount)}</strong></td></tr>`,
    '<tr><td style="padding:10px 0;font-size:13px;color:#71717a;">Due Date</td>',
    `<td style="padding:10px 0;font-size:14px;text-align:right;"><strong>${escapeHtml(dueDate)}</strong></td></tr>`,
    "</table>",
    '<p style="margin:24px 0 0;font-size:14px;">Thank you for your business.</p>',
    `<p style="margin:8px 0 0;font-size:13px;color:#71717a;">${escapeHtml(input.companyName)}</p>`,
    "</td></tr></table></body></html>",
  ].join("");

  return { subject, text, html };
}
