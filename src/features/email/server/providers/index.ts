import { loadEmailConfig, type EmailConfig } from "../config";
import type { EmailProvider } from "../../types/email";
import { createEmailApiProvider } from "./email-api";
import { createResendProvider } from "./resend";
import { createSendGridProvider } from "./sendgrid";
import { createSesProvider } from "./ses";
import { createSmtpProvider } from "./smtp";

export function createEmailProvider(config: EmailConfig = loadEmailConfig()): EmailProvider {
  switch (config.provider) {
    case "EMAIL_API":
      return createEmailApiProvider(config);
    case "RESEND":
      return createResendProvider(config);
    case "SENDGRID":
      return createSendGridProvider(config);
    case "SES":
      return createSesProvider(config);
    case "SMTP":
      return createSmtpProvider(config);
  }
}
