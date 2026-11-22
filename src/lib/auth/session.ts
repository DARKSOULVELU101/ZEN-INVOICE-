import { cache } from "react";
import { cookies } from "next/headers";
import { PERMISSION_KEYS, permissionsForRoles, type PermissionKey } from "@/config/permissions";
import { prisma } from "@/lib/db/client";
import { UnauthenticatedError } from "@/lib/errors/result";
import { SESSION_COOKIE, verifySessionToken } from "@/features/auth/server/session-token";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface Session {
  sessionId: string;
  user: SessionUser;
  organizationId: string;
  organizationName: string;
  roles: string[];
  permissions: PermissionKey[];
}

export const getSession = cache(async (): Promise<Session | null> => {
  if (process.env.AUTH_MODE !== "production") return null;

  const cookieStore = await cookies();
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const sessionRecord = await prisma.userSession.findUnique({
    where: { id: payload.sessionId },
    select: { userId: true, membershipId: true, expiresAt: true, revokedAt: true },
  });
  const now = new Date();
  if (
    !sessionRecord
    || sessionRecord.revokedAt
    || sessionRecord.userId !== payload.userId
    || sessionRecord.membershipId !== payload.membershipId
    || sessionRecord.expiresAt.getTime() !== payload.expiresAt
    || sessionRecord.expiresAt <= now
  ) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.userId, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true, email: true, passwordHash: true },
  });
  if (!user?.passwordHash) return null;

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      id: payload.membershipId,
      userId: user.id,
      status: "ACTIVE",
      deletedAt: null,
      organization: { status: "ACTIVE", deletedAt: null },
    },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { name: true } },
      roles: {
        where: { role: { deletedAt: null } },
        select: { role: { select: { id: true, key: true } } },
      },
    },
  });
  if (!membership) return null;

  const roleIds = membership.roles.map((entry) => entry.role.id);
  const roles = membership.roles.map((entry) => entry.role.key);
  const [rolePermissions, overrides] = await Promise.all([
    roleIds.length
      ? prisma.rolePermission.findMany({
          where: { roleId: { in: roleIds } },
          select: { permission: { select: { key: true } } },
        })
      : Promise.resolve([]),
    prisma.userPermissionOverride.findMany({
      where: { organizationId: membership.organizationId, userId: user.id },
      select: { effect: true, permission: { select: { key: true } } },
    }),
  ]);

  const keys = new Set<PermissionKey>([
    ...permissionsForRoles(roles),
    ...rolePermissions.map((entry) => entry.permission.key as PermissionKey),
  ]);
  for (const override of overrides) {
    const key = override.permission.key as PermissionKey;
    if (!PERMISSION_KEYS.includes(key)) continue;
    if (override.effect === "GRANT") keys.add(key);
    if (override.effect === "DENY") keys.delete(key);
  }

  return {
    sessionId: payload.sessionId,
    user: { id: user.id, name: user.name, email: user.email },
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    roles,
    permissions: [...keys],
  };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}
