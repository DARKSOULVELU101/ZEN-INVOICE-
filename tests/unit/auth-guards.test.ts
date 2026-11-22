import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { navItemsForPermissions } from "@/config/navigation";
import { evaluateLoginRateLimit } from "@/features/auth/server/rate-limit";
import { snsSignedContent, verifySnsEnvelope } from "@/features/email/server/sns";
import { createSessionToken, verifySessionToken } from "@/features/auth/server/session-token";
import { guardRedirectFor } from "@/lib/auth/route-guard";
import { requireHttpsUrl } from "@/lib/security/urls";

describe("production auth guards", () => {
  it("hides navigation items without permission", () => {
    const items = navItemsForPermissions(["invoice:view"]);
    expect(items.map((item) => item.href)).toEqual(["/dashboard", "/invoices"]);
  });

  it("rejects plaintext HTTP external URLs", () => {
    expect(() => requireHttpsUrl("http://example.com", "EMAIL_API_URL")).toThrow(
      "EMAIL_API_URL must use HTTPS.",
    );
    expect(requireHttpsUrl("https://example.com/", "EMAIL_API_URL")).toBe("https://example.com");
  });

  it("locks sign-in after repeated failures", () => {
    const now = Date.now();
    expect(evaluateLoginRateLimit({
      failures: 4,
      lockedUntil: null,
      now,
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    })).toEqual({ allowed: true, locked: false, retryAfterSeconds: 0 });
    expect(evaluateLoginRateLimit({
      failures: 5,
      lockedUntil: now + 60_000,
      now,
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    })).toEqual({ allowed: false, locked: true, retryAfterSeconds: 60 });
  });

  it("guards platform routes but not health", async () => {
    expect(guardRedirectFor("/invoices")).toBe("/sign-in?next=%2Finvoices");
    expect(guardRedirectFor("/api/health")).toBeNull();
  });

  it("signs and verifies session tokens with a session id", async () => {
    process.env.AUTH_SESSION_SECRET ||= "0123456789abcdef0123456789abcdef";
    const token = await createSessionToken({
      userId: "11111111-1111-4111-8111-111111111111",
      membershipId: "22222222-2222-4222-8222-222222222222",
      sessionId: "33333333-3333-4333-8333-333333333333",
    });
    const payload = await verifySessionToken(token);
    expect(payload?.sessionId).toBe("33333333-3333-4333-8333-333333333333");
    expect(await verifySessionToken(`${token}tampered`)).toBeNull();
  });

  it("verifies SNS signatures and rejects unexpected topics", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const envelope = {
      Type: "Notification",
      MessageId: "sns-message-1",
      TopicArn: "arn:aws:sns:ap-south-1:123456789012:invoice-events",
      Message: '{"eventType":"Delivery"}',
      Timestamp: "2026-11-23T00:00:00.000Z",
      SignatureVersion: "1",
      SigningCertURL: "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService.pem",
      Signature: "",
    };
    envelope.Signature = sign("sha1", Buffer.from(snsSignedContent(envelope)), privateKey).toString("base64");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    expect(verifySnsEnvelope(envelope, publicKeyPem, envelope.TopicArn)).toBe(true);
    expect(verifySnsEnvelope(envelope, publicKeyPem, "arn:aws:sns:ap-south-1:123456789012:other")).toBe(false);
  });
});
