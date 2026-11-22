const GUARDED_PREFIXES = [
  "/dashboard",
  "/invoices",
  "/customers",
  "/products",
  "/payments",
  "/reports",
] as const;

const PUBLIC_PATHS = new Set(["/api/health", "/api/email-events", "/api/cron/retry-email", "/sign-in"]);

export function guardRedirectFor(pathname: string): string | null {
  if (PUBLIC_PATHS.has(pathname)) return null;
  const guarded = GUARDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!guarded) return null;
  return `/sign-in?next=${encodeURIComponent(pathname)}`;
}
