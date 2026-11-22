import { createPublicKey, verify as verifySignature } from "node:crypto";

export interface SnsEnvelope {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  Signature: string;
  SignatureVersion: string;
  SigningCertURL: string;
}

export function isTrustedSnsCertificateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && hostname.startsWith("sns.")
      && hostname.endsWith(".amazonaws.com")
      && url.pathname.endsWith(".pem")
      && !url.pathname.includes("..");
  } catch {
    return false;
  }
}

export function snsSignedContent(envelope: SnsEnvelope): string {
  const fields = ["Message", "MessageId", "Timestamp", "TopicArn", "Type"];
  return fields.map((field) => `${field}\n${envelope[field as keyof SnsEnvelope]}\n`).join("");
}

export function verifySnsEnvelope(
  envelope: SnsEnvelope,
  certificatePem: string,
  expectedTopicArn: string,
): boolean {
  if (!expectedTopicArn || envelope.TopicArn !== expectedTopicArn) return false;
  if (envelope.Type !== "Notification") return false;
  if (envelope.SignatureVersion !== "1") return false;
  if (!isTrustedSnsCertificateUrl(envelope.SigningCertURL)) return false;

  try {
    return verifySignature(
      "sha1",
      Buffer.from(snsSignedContent(envelope)),
      createPublicKey(certificatePem),
      Buffer.from(envelope.Signature, "base64"),
    );
  } catch {
    return false;
  }
}
