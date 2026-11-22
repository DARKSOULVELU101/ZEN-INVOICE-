"use server";

import { randomUUID } from "node:crypto";
import { AuditAction, EntityType } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { verifyPassword } from "@/features/auth/server/password";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/features/auth/server/session-token";
import { revokeSession } from "@/features/auth/server/session-revocation";
import {
  evaluateLoginRateLimit,
  loginRateLimitConfig,
  loginRateLimitKey,
  nextLoginRateLimitState,
  resolveClientIp,
} from "@/features/auth/server/rate-limit";

export interface SignInState {
  error?: string;
  retryAfterSeconds?: number;
}

const INVALID_CREDENTIALS = "Invalid email or password.";

export async function signInAction(_state: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const requestHeaders = await headers();
  const config = loginRateLimitConfig();
  const clientIp = resolveClientIp(requestHeaders, config.trustProxy);
  const rateKey = loginRateLimitKey(email, clientIp);
  const userAgent = requestHeaders.get("user-agent") ?? null;

  if (!email || !password) {
    return { error: INVALID_CREDENTIALS };
  }

  const now = Date.now();
  const rateRecord = await prisma.authRateLimit.findUnique({ where: { key: rateKey } });
  const windowExpired = Boolean(rateRecord && now - rateRecord.firstFailureAt.getTime() > config.windowMs);
  const currentState = {
    failures: windowExpired ? 0 : rateRecord?.failures ?? 0,
    lockedUntil: windowExpired ? null : rateRecord?.lockedUntil?.getTime() ?? null,
  };
  const rateOptions = { ...currentState, now, ...config };
  const rateEvaluation = evaluateLoginRateLimit(rateOptions);
  if (!rateEvaluation.allowed) {
    return {
      error: `Too many failed sign-in attempts. Try again in ${rateEvaluation.retryAfterSeconds} seconds.`,
      retryAfterSeconds: rateEvaluation.retryAfterSeconds,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      status: true,
      deletedAt: true,
      memberships: {
        where: { status: "ACTIVE", deletedAt: null, organization: { status: "ACTIVE", deletedAt: null } },
        select: { id: true, organizationId: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const recordFailure = async (organizationId?: string) => {
    const nextState = nextLoginRateLimitState(rateOptions);
    await prisma.authRateLimit.upsert({
      where: { key: rateKey },
      create: {
        key: rateKey,
        failures: nextState.failures,
        firstFailureAt: new Date(now),
        lockedUntil: nextState.lockedUntil ? new Date(nextState.lockedUntil) : null,
      },
      update: {
        failures: nextState.failures,
        ...(windowExpired || !rateRecord ? { firstFailureAt: new Date(now) } : {}),
        lockedUntil: nextState.lockedUntil ? new Date(nextState.lockedUntil) : null,
      },
    });
    if (organizationId) {
      await prisma.auditLog.create({
        data: {
          organizationId,
          actorId: user?.id ?? null,
          action: nextState.lockedUntil ? AuditAction.LOCKOUT : AuditAction.LOGIN_FAILED,
          entityType: EntityType.USER,
          entityId: user?.id ?? rateKey,
          ipAddress: clientIp === "unknown" ? null : clientIp,
          userAgent,
          correlationId: randomUUID(),
        },
      });
    }
    if (nextState.lockedUntil) {
      return {
        error: `Too many failed sign-in attempts. Try again in ${rateEvaluation.retryAfterSeconds + config.lockMs / 1000} seconds.`,
        retryAfterSeconds: Math.ceil(config.lockMs / 1000),
      };
    }
    return { error: INVALID_CREDENTIALS };
  };

  const membership = user?.memberships[0];
  if (!user?.passwordHash || user.status !== "ACTIVE" || user.deletedAt) {
    return recordFailure(membership?.organizationId);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return recordFailure(membership?.organizationId);

  if (!membership) {
    return { error: "This account has no active organization." };
  }

  const sessionId = randomUUID();
  const { token, payload } = await createSession({
    userId: user.id,
    membershipId: membership.id,
    sessionId,
  });
  await prisma.userSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      membershipId: membership.id,
      expiresAt: new Date(payload.expiresAt),
    },
  });
  await prisma.authRateLimit.deleteMany({ where: { key: rateKey } });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: membership.organizationId,
      actorId: user.id,
      action: AuditAction.LOGIN,
      entityType: EntityType.USER,
      entityId: user.id,
      ipAddress: clientIp === "unknown" ? null : clientIp,
      userAgent,
      correlationId: randomUUID(),
    },
  });

  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await revokeSession(session.sessionId);
    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.user.id,
        action: AuditAction.LOGOUT,
        entityType: EntityType.USER,
        entityId: session.user.id,
        correlationId: randomUUID(),
      },
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
