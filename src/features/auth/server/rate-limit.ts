import { createHash } from "node:crypto";

export interface LoginRateLimitState {
  failures: number;
  lockedUntil: number | null;
}

export interface LoginRateLimitEvaluation {
  allowed: boolean;
  locked: boolean;
  retryAfterSeconds: number;
}

export interface LoginRateLimitOptions {
  failures: number;
  lockedUntil: number | null;
  now: number;
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
}

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 5;

export function evaluateLoginRateLimit(options: LoginRateLimitOptions): LoginRateLimitEvaluation {
  const retryAfterSeconds = options.lockedUntil && options.lockedUntil > options.now
    ? Math.max(1, Math.ceil((options.lockedUntil - options.now) / 1000))
    : 0;
  return {
    allowed: retryAfterSeconds === 0,
    locked: retryAfterSeconds > 0,
    retryAfterSeconds,
  };
}

export function nextLoginRateLimitState(options: LoginRateLimitOptions): LoginRateLimitState {
  const evaluation = evaluateLoginRateLimit(options);
  if (evaluation.locked) return { failures: options.failures, lockedUntil: options.lockedUntil };

  const failures = options.failures + 1;
  const lockedUntil = failures >= options.maxAttempts ? options.now + options.lockMs : null;
  return { failures: lockedUntil ? 0 : failures, lockedUntil };
}

export function loginRateLimitKey(email: string, ip: string): string {
  return createHash("sha256").update(`${normalizeEmail(email)}|${ip}`).digest("hex");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveClientIp(headers: Headers, trustProxy: boolean): string {
  if (!trustProxy) return "unknown";
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export function loginRateLimitConfig(env: Record<string, string | undefined> = process.env) {
  const parsePositive = (value: string | undefined, fallback: number) => {
    const parsed = Number(value ?? "");
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };
  return {
    maxAttempts: parsePositive(env.AUTH_LOGIN_MAX_ATTEMPTS, LOGIN_MAX_ATTEMPTS),
    windowMs: parsePositive(env.AUTH_LOGIN_WINDOW_SECONDS, LOGIN_WINDOW_MS / 1000) * 1000,
    lockMs: parsePositive(env.AUTH_LOGIN_LOCK_SECONDS, LOGIN_LOCK_MS / 1000) * 1000,
    trustProxy: env.AUTH_TRUST_PROXY_HEADERS === "true",
  };
}
