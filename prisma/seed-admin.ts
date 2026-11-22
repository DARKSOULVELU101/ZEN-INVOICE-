import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword, isStrongPassword } from "../src/features/auth/server/password";
import { PERMISSION_KEYS } from "../src/config/permissions";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Administrator";
  const configuredOrganizationId = process.env.ADMIN_ORGANIZATION_ID?.trim();

  if (!email || !email.includes("@")) throw new Error("ADMIN_EMAIL must be a valid email address.");
  if (!isStrongPassword(password)) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters and include 3 character classes.");
  }

  const organization = configuredOrganizationId
    ? await prisma.organization.findFirst({
        where: { id: configuredOrganizationId, status: "ACTIVE", deletedAt: null },
        select: { id: true },
      })
    : await prisma.organization.findFirst({
        where: { status: "ACTIVE", deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
  if (!organization) throw new Error("No active organization is available for the administrator account.");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, status: "ACTIVE" },
    update: { name, passwordHash, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });

  const membership = await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    create: { organizationId: organization.id, userId: user.id, status: "ACTIVE", title: "Administrator" },
    update: { status: "ACTIVE", deletedAt: null, title: "Administrator" },
    select: { id: true },
  });

  const role = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: organization.id, key: "ADMIN" } },
    create: { organizationId: organization.id, key: "ADMIN", name: "Administrator", isSystem: true },
    update: { name: "Administrator", isSystem: true, deletedAt: null },
    select: { id: true },
  });

  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
    create: { membershipId: membership.id, roleId: role.id },
    update: {},
  });

  for (const key of PERMISSION_KEYS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      create: { key, module: key.split(":")[0] ?? "general" },
      update: {},
      select: { id: true },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });
  }

  console.log(`Administrator account ready for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
