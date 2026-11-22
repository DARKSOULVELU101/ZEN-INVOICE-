export type CursorDirection = "asc" | "desc";
export type CursorValueKind = "date" | "number" | "string";

export interface Cursor {
  sort: string;
  dir: CursorDirection;
  kind: CursorValueKind;
  value: string;
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
      "sort" in parsed && typeof parsed.sort === "string" && parsed.sort.length > 0 &&
      "dir" in parsed && (parsed.dir === "asc" || parsed.dir === "desc") &&
      "kind" in parsed && ["date", "number", "string"].includes(String(parsed.kind)) &&
      "value" in parsed && typeof parsed.value === "string" &&
      "id" in parsed && typeof parsed.id === "string"
    ) {
      return {
        sort: parsed.sort,
        dir: parsed.dir,
        kind: parsed.kind as CursorValueKind,
        value: parsed.value,
        id: parsed.id,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function decodeValue(cursor: Cursor): string | number | Date {
  if (cursor.kind === "number") return Number(cursor.value);
  if (cursor.kind === "date") return new Date(cursor.value);
  return cursor.value;
}

export function cursorCondition(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const value = decodeValue(cursor);
  if (value instanceof Date && Number.isNaN(value.getTime())) return undefined;
  if (typeof value === "number" && Number.isNaN(value)) return undefined;

  const operator = cursor.dir === "desc" ? "lt" : "gt";
  return {
    OR: [
      { [cursor.sort]: { [operator]: value } },
      { [cursor.sort]: value, id: { [operator]: cursor.id } },
    ],
  };
}

function serializeValue(value: unknown): Pick<Cursor, "kind" | "value"> | null {
  if (value instanceof Date) {
    return { kind: "date", value: value.toISOString() };
  }
  if (typeof value === "number") {
    return { kind: "number", value: String(value) };
  }
  if (typeof value === "string") {
    return { kind: "string", value };
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const serialized = String(value.toString());
    if (serialized.trim().length > 0 && !Number.isNaN(Number(serialized))) {
      return { kind: "number", value: serialized };
    }
  }
  return null;
}

export function nextCursor<T extends { id: string }>(
  items: readonly T[],
  limit: number,
  sort: string,
  dir: CursorDirection,
): string | undefined {
  if (items.length <= limit) return undefined;
  const last = items[limit - 1];
  if (!last) return undefined;

  const rawValue = (last as Record<string, unknown>)[sort];
  const serialized = serializeValue(rawValue);
  if (!serialized) return undefined;

  return encodeCursor({ sort, dir, ...serialized, id: last.id });
}
