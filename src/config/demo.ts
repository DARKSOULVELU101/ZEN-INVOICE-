export const DEMO = {
  organizationId: process.env.DEMO_ORGANIZATION_ID ?? "00000000-0000-4000-8000-000000000001",
  userId: process.env.DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001",
  organizationName: "Zenbook Demo Co.",
  userName: "Demo Admin",
  userEmail: "admin@zenbook.demo",
} as const;
