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

  it("allows resending only invoices that are still collectible", () => {
    expect(transition("SENT", "RESEND")).toBe("SENT");
    expect(transition("VIEWED", "RESEND")).toBe("VIEWED");
    expect(transition("PARTIALLY_PAID", "RESEND")).toBe("PARTIALLY_PAID");
    expect(canTransition("DRAFT", "RESEND")).toBe(false);
    expect(canTransition("PAID", "RESEND")).toBe(false);
    expect(canTransition("CANCELLED", "RESEND")).toBe(false);
  });

  it("allows full payment to move directly from issued and partially paid states", () => {
    expect(transition("SENT", "PAY")).toBe("PAID");
    expect(transition("VIEWED", "PAY")).toBe("PAID");
    expect(transition("PARTIALLY_PAID", "PAY")).toBe("PAID");
    expect(canTransition("DRAFT", "PAY")).toBe(false);
  });

  it("rejects invalid transitions with a domain error", () => {
    expect(() => transition("PAID", "CANCEL")).toThrow(/Cannot cancel/i);
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("PAID")).toBe(false);
  });

  it("preserves status when an editable invoice date is changed", () => {
    expect(transition("DRAFT", "EDIT")).toBe("DRAFT");
    expect(transition("SENT", "EDIT")).toBe("SENT");
    expect(transition("VIEWED", "EDIT")).toBe("VIEWED");
    expect(transition("PARTIALLY_PAID", "EDIT")).toBe("PARTIALLY_PAID");
    expect(canTransition("PAID", "EDIT")).toBe(false);
    expect(canTransition("CANCELLED", "EDIT")).toBe(false);
  });

  it("derives overdue using end-of-day semantics in the invoice timezone", () => {
    const dueToday = new Date("2026-01-01T00:00:00.000Z");
    const dueYesterday = new Date("2025-12-31T00:00:00.000Z");
    const endOfToday = new Date("2026-01-01T18:00:00.000Z");
    expect(isOverdue("SENT", dueToday, new Decimal(10), endOfToday)).toBe(false);
    expect(isOverdue("SENT", dueYesterday, new Decimal(10), endOfToday)).toBe(true);
    expect(isOverdue("DRAFT", dueYesterday, new Decimal(10), endOfToday)).toBe(false);
    expect(displayStatus("VIEWED", dueYesterday, new Decimal(0), endOfToday)).toBe("VIEWED");
  });
});
