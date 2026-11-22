import { isValidEmailAddress, normalizeEmailAddress, parseAddressList } from "../domain/address";
import { EMAIL_PROVIDERS, type EmailProviderName } from "../types/email";

interface EmailConfigBase {
  from: string;
  replyTo?: string;
  cc: string[];
  bcc: string[];
}

export type EmailConfig =
  | (EmailConfigBase & { provider: "RESEND"; apiKey: string })
  | (EmailConfigBase & { provider: "SENDGRID"; apiKey: string })
  | (EmailConfigBase & { provider: "SES"; region: string })
  | (EmailConfigBase & {
      provider: "SMTP";
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
    });

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for email delivery.`);
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function loadEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const rawProvider = env.EMAIL_PROVIDER?.trim().toUpperCase();
  if (!rawProvider || !EMAIL_PROVIDERS.includes(rawProvider as EmailProviderName)) {
    throw new Error("EMAIL_PROVIDER is required and must be RESEND, SENDGRID, SES or SMTP.");
  }

  const provider = rawProvider as EmailProviderName;
  const from = required(env, "EMAIL_FROM");
  if (!isValidEmailAddress(from)) throw new Error("EMAIL_FROM must be a valid email address.");

  const replyTo = env.EMAIL_REPLY_TO?.trim();
  if (replyTo && !isValidEmailAddress(replyTo)) throw new Error("EMAIL_REPLY_TO must be a valid email address.");

  const base: EmailConfigBase = {
    from: normalizeEmailAddress(from),
    ...(replyTo ? { replyTo: normalizeEmailAddress(replyTo) } : {}),
    cc: parseAddressList(env.EMAIL_CC),
    bcc: parseAddressList(env.EMAIL_BCC),
  };

  switch (provider) {
    case "RESEND":
      return { ...base, provider, apiKey: required(env, "RESEND_API_KEY") };
    case "SENDGRID":
      return { ...base, provider, apiKey: required(env, "SENDGRID_API_KEY") };
    case "SES":
      return { ...base, provider, region: required(env, "AWS_REGION") };
    case "SMTP": {
      const portValue = required(env, "SMTP_PORT");
      const port = Number(portValue);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("SMTP_PORT must be a valid port number.");
      }
      return {
        ...base,
        provider,
        host: required(env, "SMTP_HOST"),
        port,
        secure: parseBoolean(env.SMTP_SECURE, port === 465),
        user: required(env, "SMTP_USER"),
        password: required(env, "SMTP_PASSWORD"),
      };
    }
  }
}
