export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      "createdAt" in parsed && "id" in parsed &&
      typeof parsed.createdAt === "string" && typeof parsed.id === "string"
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

export function cursorCondition(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  if (Number.isNaN(createdAt.getTime())) return undefined;
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt: createdAt, id: { lt: cursor.id } },
    ],
  };
}

export function nextCursor(items: readonly { createdAt: Date; id: string }[], limit: number): string | undefined {
  if (items.length <= limit) return undefined;
  const last = items[limit - 1];
  if (!last) return undefined;
  return encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
}
