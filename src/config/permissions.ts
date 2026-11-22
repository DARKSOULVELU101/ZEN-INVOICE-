export const PERMISSION_KEYS = [
  "invoice:view",
  "invoice:create",
  "invoice:edit",
  "invoice:delete",
  "invoice:approve",
  "invoice:send",
  "invoice:cancel",
  "payment:record",
  "customer:view",
  "customer:create",
  "customer:edit",
  "product:view",
  "product:create",
  "product:edit",
  "report:view",
  "audit:view",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const SYSTEM_ROLES = [
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "FINANCE_MANAGER",
  "SALES_PERSON",
  "VIEWER",
  "AUDITOR",
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

const ALL: readonly PermissionKey[] = PERMISSION_KEYS;

export const ROLE_PERMISSIONS: Record<SystemRole, readonly PermissionKey[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  ACCOUNTANT: [
    "invoice:view", "invoice:create", "invoice:edit", "invoice:delete",
    "invoice:approve", "invoice:send", "invoice:cancel", "payment:record",
    "customer:view", "customer:create", "customer:edit",
    "product:view", "product:create", "product:edit", "report:view",
  ],
  FINANCE_MANAGER: [
    "invoice:view", "invoice:create", "invoice:edit", "invoice:delete",
    "invoice:approve", "invoice:send", "invoice:cancel", "payment:record",
    "customer:view", "product:view", "report:view",
  ],
  SALES_PERSON: [
    "invoice:view", "invoice:create", "invoice:edit", "invoice:delete",
    "customer:view", "customer:create", "customer:edit", "product:view",
  ],
  VIEWER: ["invoice:view", "customer:view", "product:view", "report:view"],
  AUDITOR: ["invoice:view", "customer:view", "product:view", "report:view", "audit:view"],
};

export function permissionsForRoles(roles: readonly string[]): PermissionKey[] {
  const keys = new Set<PermissionKey>();
  for (const role of roles) {
    const configured = ROLE_PERMISSIONS[role as SystemRole];
    if (configured) configured.forEach((key) => keys.add(key));
  }
  return [...keys];
}

export const OWN_ONLY_ROLES: readonly SystemRole[] = ["SALES_PERSON"];
