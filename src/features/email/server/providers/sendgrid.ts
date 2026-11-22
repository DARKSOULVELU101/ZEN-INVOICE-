import type { EmailConfig } from "../config";
import { parseMailboxAddress } from "../../domain/address";
import type { EmailProvider, EmailSendResult } from "../../types/email";

type SendGridConfig = Extract<EmailConfig, { provider: "SENDGRID" }>;

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return controller.signal;
}

export function createSendGridProvider(config: SendGridConfig): EmailProvider {
  const fromMailbox = parseMailboxAddress(config.from);

  return {
    name: "SENDGRID",
    async send(message): Promise<EmailSendResult> {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{
            to: message.to.map((email) => ({ email })),
            ...(message.cc.length ? { cc: message.cc.map((email) => ({ email })) } : {}),
            ...(message.bcc.length ? { bcc: message.bcc.map((email) => ({ email })) } : {}),
          }],
          from: { email: fromMailbox.email, ...(fromMailbox.name ? { name: fromMailbox.name } : {}) },
          reply_to: { email: message.replyTo ?? fromMailbox.email },
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
          attachments: message.attachments.map((attachment) => ({
            content: attachment.content.toString("base64"),
            type: attachment.contentType,
            filename: attachment.filename,
            disposition: "attachment",
          })),
          headers: message.headers,
        }),
        signal: withTimeout(20_000),
      });

      if (!response.ok) {
        throw new Error(`SendGrid rejected the email (${response.status}).`);
      }

      const providerMessageId = response.headers.get("x-message-id");
      if (!providerMessageId) throw new Error("SendGrid did not return a message identifier.");
      return { providerMessageId };
    },
  };
}
