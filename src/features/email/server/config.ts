import { requireHttpsUrl } from "@/lib/security/urls";
import { isValidEmailAddress, normalizeEmailAddress, parseAddressList } from "../domain/address";
import { EMAIL_PROVIDERS, type EmailProviderName } from "../types/email";

interface EmailConfigBase {
  from: string;
  replyTo?: string;
  cc: string[];
  bcc: string[];
}

export type EmailConfig =
  | { provider: "EMAIL_API"; apiUrl: string; apiToken: string }
  | (EmailConfigBase & { provider: "SES"; region: string });

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for email delivery.`);
  return value;
}

export function loadEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const rawProvider = env.EMAIL_PROVIDER?.trim().toUpperCase();
  if (!rawProvider || !EMAIL_PROVIDERS.includes(rawProvider as EmailProviderName)) {
    throw new Error("EMAIL_PROVIDER is required and must be EMAIL_API or SES.");
  }

  const provider = rawProvider as EmailProviderName;

  if (provider === "EMAIL_API") {
    const apiUrl = requireHttpsUrl(required(env, "EMAIL_API_URL"), "EMAIL_API_URL");
    return {
      provider,
      apiUrl: apiUrl.replace(/\/+$/, ""),
      apiToken: required(env, "EMAIL_API_TOKEN"),
    };
  }

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

  return { ...base, provider, region: required(env, "AWS_REGION") };
}
