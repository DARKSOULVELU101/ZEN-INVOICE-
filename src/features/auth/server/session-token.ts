export const SESSION_COOKIE = "zenbook_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionTokenPayload {
  userId: string;
  membershipId: string;
  sessionId: string;
  expiresAt: number;
}

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (value.length < 32) throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeEqual(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return difference === 0;
}

async function sign(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createSession(input: Omit<SessionTokenPayload, "expiresAt">): Promise<{
  token: string;
  payload: SessionTokenPayload;
}> {
  const payload: SessionTokenPayload = {
    ...input,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return { token: `${encoded}.${await sign(encoded)}`, payload };
}

export async function createSessionToken(input: Omit<SessionTokenPayload, "expiresAt">): Promise<string> {
  return (await createSession(input)).token;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionTokenPayload | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!safeEqual(await sign(encoded), signature)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as SessionTokenPayload;
    if (!payload.userId || !payload.membershipId || !payload.sessionId) return null;
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
