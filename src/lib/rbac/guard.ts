import type { PermissionKey } from "@/config/permissions";
import { OWN_ONLY_ROLES } from "@/config/permissions";
import { ForbiddenError } from "@/lib/errors/result";
import type { Session } from "@/lib/auth/session";

export type DataScope = "all" | "own";

export function requirePermission(session: Session, permission: PermissionKey): void {
  if (!session.permissions.includes(permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

export function dataScopeFor(session: Session): DataScope {
  return OWN_ONLY_ROLES.some((role) => session.roles.includes(role)) ? "own" : "all";
}

export function assertOwnership(session: Session, createdById: string, scope: DataScope): void {
  if (scope === "own" && createdById !== session.user.id) {
    throw new ForbiddenError("You can only access records you created.");
  }
}
