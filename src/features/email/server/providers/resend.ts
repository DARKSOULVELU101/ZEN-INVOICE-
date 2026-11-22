import type { EmailConfig } from "../config";
import { parseMailboxAddress } from "../../domain/address";
import type { EmailProvider, EmailSendResult } from "../../types/email";

type ResendConfig = Extract<EmailConfig, { provider: "RESEND" }>;

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return controller.signal;
}

export function createResendProvider(config: ResendConfig): EmailProvider {
  const fromMailbox = parseMailboxAddress(config.from);

  return {
    name: "RESEND",
    async send(message): Promise<EmailSendResult> {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: config.from,
          to: message.to,
          cc: message.cc,
          bcc: message.bcc,
          reply_to: message.replyTo ?? fromMailbox.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content.toString("base64"),
            content_type: attachment.contentType,
          })),
          headers: message.headers,
        }),
        signal: withTimeout(20_000),
      });

      if (!response.ok) {
        throw new Error(`Resend rejected the email (${response.status}).`);
      }

      const payload = await response.json() as { id?: string };
      if (!payload.id) throw new Error("Resend did not return a message identifier.");
      return { providerMessageId: payload.id };
    },
  };
}
