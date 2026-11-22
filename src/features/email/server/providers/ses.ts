import { randomUUID } from "node:crypto";
import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { EmailConfig } from "../config";
import { formatMailboxAddress, parseMailboxAddress } from "../../domain/address";
import type { EmailProvider, EmailSendResult } from "../../types/email";

type SesConfig = Extract<EmailConfig, { provider: "SES" }>;

function encodeSubject(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function chunkBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function buildRawMessage(
  config: SesConfig,
  message: Parameters<EmailProvider["send"]>[0],
): Buffer {
  const boundary = `----InvoiceDeliveryBoundary${randomUUID()}`;
  const fromMailbox = parseMailboxAddress(config.from);
  const lines: string[] = [];

  const push = (...values: string[]) => lines.push(...values);
  push(
    `From: ${formatMailboxAddress(fromMailbox.name, fromMailbox.email)}`,
    `To: ${message.to.join(", ")}`,
  );
  if (message.cc.length) push(`Cc: ${message.cc.join(", ")}`);
  if (message.bcc.length) push(`Bcc: ${message.bcc.join(", ")}`);
  push(
    `Reply-To: ${message.replyTo ?? fromMailbox.email}`,
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: multipart/alternative; charset=UTF-8",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    message.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    message.html,
  );

  for (const attachment of message.attachments) {
    push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      chunkBase64(attachment.content.toString("base64")),
    );
  }

  push(`--${boundary}--`, "");
  return Buffer.from(lines.join("\r\n"), "utf8");
}

export function createSesProvider(config: SesConfig): EmailProvider {
  const client = new SESClient({ region: config.region, maxAttempts: 2 });

  return {
    name: "SES",
    async send(message): Promise<EmailSendResult> {
      const response = await client.send(new SendRawEmailCommand({
        RawMessage: { Data: buildRawMessage(config, message) },
      }));

      if (!response.MessageId) throw new Error("AWS SES did not return a message identifier.");
      return { providerMessageId: response.MessageId };
    },
  };
}
