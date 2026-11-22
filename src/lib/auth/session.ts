import { cache } from "react";
import { DEMO } from "@/config/demo";
import { permissionsForRoles, type PermissionKey } from "@/config/permissions";
import { UnauthenticatedError } from "@/lib/errors/result";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface Session {
  user: SessionUser;
  organizationId: string;
  organizationName: string;
  roles: string[];
  permissions: PermissionKey[];
}

export const getSession = cache(async (): Promise<Session | null> => {
  if ((process.env.AUTH_MODE ?? "demo") !== "demo") {
    return null;
  }

  const roles = ["ADMIN"];
  return {
    user: { id: DEMO.userId, name: DEMO.userName, email: DEMO.userEmail },
    organizationId: DEMO.organizationId,
    organizationName: DEMO.organizationName,
    roles,
    permissions: permissionsForRoles(roles),
  };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}
