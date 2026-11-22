import { loadEmailConfig, type EmailConfig } from "../config";
import type { EmailProvider } from "../../types/email";
import { createEmailApiProvider } from "./email-api";
import { createSesProvider } from "./ses";

export function createEmailProvider(config: EmailConfig = loadEmailConfig()): EmailProvider {
  switch (config.provider) {
    case "EMAIL_API":
      return createEmailApiProvider(config);
    case "SES":
      return createSesProvider(config);
  }
}
