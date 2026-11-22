import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "zenbook_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionTokenPayload {
  userId: string;
  membershipId: string;
  expiresAt: number;
}

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (value.length < 32) throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(input: Omit<SessionTokenPayload, "expiresAt">): string {
  const payload: SessionTokenPayload = {
    ...input,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): SessionTokenPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionTokenPayload;
    if (!payload.userId || !payload.membershipId || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
