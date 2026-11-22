import { describe, expect, it } from "vitest";
import {
  canTransition, displayStatus, isEditable, isOverdue, transition,
} from "@/features/invoices/domain/status";
import { Decimal } from "@/lib/money/decimal";

describe("invoice status machine", () => {
  it("allows the documented draft lifecycle", () => {
    expect(transition("DRAFT", "SEND")).toBe("SENT");
    expect(transition("SENT", "VIEW")).toBe("VIEWED");
    expect(transition("VIEWED", "RECORD_PAYMENT")).toBe("PARTIALLY_PAID");
    expect(canTransition("PAID", "EDIT")).toBe(false);
    expect(canTransition("CANCELLED", "SEND")).toBe(false);
  });

  it("rejects invalid transitions with a domain error", () => {
    expect(() => transition("PAID", "CANCEL")).toThrow(/Cannot cancel/i);
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("PAID")).toBe(false);
  });

  it("derives overdue instead of storing it", () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    expect(isOverdue("SENT", past, new Decimal(10), new Date("2021-01-01T00:00:00.000Z"))).toBe(true);
    expect(isOverdue("DRAFT", past, new Decimal(10), new Date("2021-01-01T00:00:00.000Z"))).toBe(false);
    expect(displayStatus("VIEWED", past, new Decimal(0), new Date("2021-01-01T00:00:00.000Z"))).toBe("VIEWED");
  });
});
