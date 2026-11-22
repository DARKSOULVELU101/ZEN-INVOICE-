import { prisma } from "@/lib/db/client";
import {
  getInvoicePdfStorageStatus,
  verifyInvoicePdfStorage,
} from "@/features/invoices/server/invoice-storage";

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ReadinessReport {
  ok: boolean;
  score: number;
  checks: ReadinessCheck[];
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

function sanitize(value: unknown): string {
  return value instanceof Error ? value.message.slice(0, 300) : "Unexpected error.";
}

async function checkDatabase(): Promise<ReadinessCheck> {
  if (!hasValue(process.env.DATABASE_URL)) {
    return { name: "database", ok: false, detail: "DATABASE_URL is missing." };
  }
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    return { name: "database", ok: true, detail: "Database connection is healthy." };
  } catch (error) {
    return { name: "database", ok: false, detail: sanitize(error) };
  }
}

async function checkMigrations(): Promise<ReadinessCheck> {
  try {
    const pending = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL
    `;
    if (pending.length) {
      return {
        name: "migrations",
        ok: false,
        detail: `Pending migrations: ${pending.map((entry) => entry.migration_name).join(", ")}.`,
      };
    }
    return { name: "migrations", ok: true, detail: "All migrations are applied." };
  } catch (error) {
    return { name: "migrations", ok: false, detail: sanitize(error) };
  }
}

async function checkAuth(): Promise<ReadinessCheck> {
  if (process.env.AUTH_MODE !== "production") {
    return { name: "auth", ok: false, detail: "AUTH_MODE must be production." };
  }
  const secret = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    return { name: "auth", ok: false, detail: "AUTH_SESSION_SECRET must contain at least 32 characters." };
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { name: "auth", ok: false, detail: "ADMIN_EMAIL is missing or invalid." };
  }
  try {
    const admin = await prisma.user.findFirst({
      where: {
        email,
        status: "ACTIVE",
        deletedAt: null,
        passwordHash: { not: null },
        memberships: {
          some: {
            status: "ACTIVE",
            deletedAt: null,
            organization: { status: "ACTIVE", deletedAt: null },
          },
        },
      },
      select: { id: true },
    });
    return admin
      ? { name: "auth", ok: true, detail: "Production admin account is ready." }
      : { name: "auth", ok: false, detail: "Seed the production administrator account before deployment." };
  } catch (error) {
    return { name: "auth", ok: false, detail: sanitize(error) };
  }
}

async function checkEmail(): Promise<ReadinessCheck> {
  const provider = process.env.EMAIL_PROVIDER?.trim().toUpperCase();
  if (provider !== "EMAIL_API" && provider !== "SES") {
    return { name: "email", ok: false, detail: "EMAIL_PROVIDER must be EMAIL_API or SES." };
  }
  if (!hasValue(process.env.EMAIL_FROM)) {
    return { name: "email", ok: false, detail: "EMAIL_FROM is missing." };
  }
  if (!hasValue(process.env.AWS_REGION)) {
    return { name: "email", ok: false, detail: "AWS_REGION is missing." };
  }
  if (!hasValue(process.env.EMAIL_EVENT_WEBHOOK_TOKEN) || !hasValue(process.env.CRON_SECRET)) {
    return {
      name: "email",
      ok: false,
      detail: "EMAIL_EVENT_WEBHOOK_TOKEN and CRON_SECRET are required.",
    };
  }

  if (provider === "EMAIL_API") {
    const apiUrl = process.env.EMAIL_API_URL?.trim().replace(/\/+$/, "");
    const token = process.env.EMAIL_API_TOKEN?.trim();
    if (!apiUrl || !token) {
      return { name: "email", ok: false, detail: "EMAIL_API_URL and EMAIL_API_TOKEN are required." };
    }
    try {
      new URL(apiUrl);
      const response = await fetch(`${apiUrl}/health`, {
        headers: { "X-Email-Api-Token": token },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      const payload = (await response.json()) as { configured?: boolean };
      return response.ok && payload.configured
        ? { name: "email", ok: true, detail: "AWS SES email API is configured." }
        : { name: "email", ok: false, detail: "Email API reported no configured provider." };
    } catch (error) {
      return { name: "email", ok: false, detail: sanitize(error) };
    }
  }

  return { name: "email", ok: true, detail: "Direct SES configuration is complete." };
}

async function checkStorage(): Promise<ReadinessCheck> {
  const status = getInvoicePdfStorageStatus();
  if (!status.configured) {
    return { name: "storage", ok: false, detail: "No PDF storage provider is configured." };
  }
  try {
    const providers = await verifyInvoicePdfStorage();
    const reachable = Object.entries(providers).filter(([, result]) => result.ok);
    if (!reachable.length) {
      const detail = Object.entries(providers)
        .map(([name, result]) => `${name}: ${result.detail}`)
        .join(" | ");
      return { name: "storage", ok: false, detail };
    }
    return {
      name: "storage",
      ok: true,
      detail: `Primary ${status.primary}; reachable: ${reachable.map(([name]) => name).join(", ")}.`,
    };
  } catch (error) {
    return { name: "storage", ok: false, detail: sanitize(error) };
  }
}

export async function runProductionReadinessChecks(): Promise<ReadinessReport> {
  const checks = await Promise.all([
    checkDatabase(),
    checkMigrations(),
    checkAuth(),
    checkEmail(),
    checkStorage(),
  ]);
  const ok = checks.every((check) => check.ok);
  const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);
  return { ok, score, checks };
}
