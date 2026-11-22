"use server";

import { AuditAction, EntityType } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { verifyPassword } from "@/features/auth/server/password";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/features/auth/server/session-token";

export interface SignInState {
  error?: string;
}

const INVALID_CREDENTIALS = "Invalid email or password.";

export async function signInAction(_state: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: INVALID_CREDENTIALS };
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
  if (!user?.passwordHash || user.status !== "ACTIVE" || user.deletedAt) {
    return { error: INVALID_CREDENTIALS };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { error: INVALID_CREDENTIALS };

  const membership = user.memberships[0];
  if (!membership) return { error: "This account has no active organization." };

  const token = createSessionToken({ userId: user.id, membershipId: membership.id });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  const requestHeaders = await headers();
  await prisma.auditLog.create({
    data: {
      organizationId: membership.organizationId,
      actorId: user.id,
      action: AuditAction.LOGIN,
      entityType: EntityType.USER,
      entityId: user.id,
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: requestHeaders.get("user-agent") ?? null,
      correlationId: user.id,
    },
  });

  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.user.id,
        action: AuditAction.LOGOUT,
        entityType: EntityType.USER,
        entityId: session.user.id,
      },
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
