import nodemailer from "nodemailer";
import type { EmailConfig } from "../config";
import type { EmailProvider, EmailSendResult } from "../../types/email";

type SmtpConfig = Extract<EmailConfig, { provider: "SMTP" }>;

export function createSmtpProvider(config: SmtpConfig): EmailProvider {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  return {
    name: "SMTP",
    async send(message): Promise<EmailSendResult> {
      const info = await transport.sendMail({
        from: config.from,
        to: message.to.join(", "),
        cc: message.cc.join(", "),
        bcc: message.bcc.join(", "),
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: message.headers,
        attachments: message.attachments.map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          content: attachment.content,
        })),
      });

      if (!info.messageId) throw new Error("The SMTP server did not return a message identifier.");
      return { providerMessageId: info.messageId };
    },
  };
}
