export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function requireHttpsUrl(value: string, name: string): string {
  if (!isHttpsUrl(value)) {
    throw new Error(`${name} must use HTTPS.`);
  }
  return value.replace(/\/+$/, "");
}
