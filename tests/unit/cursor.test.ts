import { describe, expect, it } from "vitest";
import { cursorCondition, decodeCursor, encodeCursor, nextCursor } from "@/lib/query/cursor";

describe("cursor encoding", () => {
  it("preserves decimal precision for monetary sort fields", () => {
    const value = "123.45678901234567890123456789";
    const cursor = decodeCursor(encodeCursor({
      sort: "total",
      dir: "desc",
      kind: "decimal",
      value,
      id: "invoice-1",
    }));

    expect(cursor).not.toBeNull();
    expect(cursorCondition(cursor)).toEqual({
      OR: [
        { total: { lt: value } },
        { total: value, id: { lt: "invoice-1" } },
      ],
    });
  });

  it("serializes decimal-like objects without converting them to floats", () => {
    const decimalLike = {
      toString: () => "0.00000000000000000000000001",
    };
    const cursor = nextCursor(
      [{ id: "invoice-1", total: decimalLike }, { id: "invoice-2", total: decimalLike }],
      1,
      "total",
      "asc",
    );
    const decoded = decodeCursor(cursor);

    expect(decoded?.kind).toBe("decimal");
    expect(decoded?.value).toBe("0.00000000000000000000000001");
  });
});
