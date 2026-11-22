export const EMAIL_PROVIDERS = ["RESEND", "SENDGRID", "SES", "SMTP"] as const;

export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface EmailMessage {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments: EmailAttachment[];
  headers?: Record<string, string>;
  idempotencyKey: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
