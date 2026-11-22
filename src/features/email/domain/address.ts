const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmailAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return EMAIL_PATTERN.test(value.trim());
}

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function parseAddressList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(isValidEmailAddress)
    .map(normalizeEmailAddress);
}

export function parseMailboxAddress(value: string): { name: string | null; email: string } {
  const match = value.match(/^\s*"?([^"<]+)"?\s*<([^>]+)>\s*$/);
  if (!match) return { name: null, email: normalizeEmailAddress(value) };
  return { name: match[1].trim() || null, email: normalizeEmailAddress(match[2]) };
}

export function formatMailboxAddress(name: string | null, email: string): string {
  return name ? `"${name.replace(/"/g, '\\"')}" <${email}>` : email;
}
