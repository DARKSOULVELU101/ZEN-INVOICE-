import type { EmailConfig } from "../config";
import type { EmailMessage, EmailProvider } from "../../types/email";

type EmailApiConfig = Extract<EmailConfig, { provider: "EMAIL_API" }>;

function errorMessage(value: unknown): string {
  if (value && typeof value === "object" && "detail" in value) {
    return String((value as { detail?: unknown }).detail ?? "Email API request failed.");
  }
  return "Email API request failed.";
}

export function createEmailApiProvider(config: EmailApiConfig): EmailProvider {
  return {
    name: "EMAIL_API",
    async send(message: EmailMessage) {
      const response = await fetch(`${config.apiUrl}/v1/send-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Email-Api-Token": config.apiToken,
        },
        body: JSON.stringify({
          to: message.to,
          cc: message.cc,
          bcc: message.bcc,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments.map((attachment) => ({
            filename: attachment.filename,
            contentType: attachment.contentType,
            contentBase64: attachment.content.toString("base64"),
          })),
          invoiceId: message.headers?.invoiceId ?? null,
          idempotencyKey: message.idempotencyKey,
        }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });

      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error(`Email API returned ${response.status}: ${errorMessage(payload)}`);
      }

      const payload = (await response.json()) as { providerMessageId?: string };
      if (!payload.providerMessageId) {
        throw new Error("Email API response did not include a provider message ID.");
      }

      return { providerMessageId: payload.providerMessageId };
    },
  };
}
