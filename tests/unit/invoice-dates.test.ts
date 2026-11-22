import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  deriveInvoiceDates,
  formatCalendarDate,
  parseCalendarDate,
  toCalendarDateInput,
} from "@/features/invoices/domain/dates";

describe("invoice calendar dates", () => {
  it("parses calendar dates as UTC midnight and rejects impossible dates", () => {
    expect(parseCalendarDate("2026-01-01")?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(parseCalendarDate("2026-02-30")).toBeNull();
    expect(parseCalendarDate("01-01-2026")).toBeNull();
  });

  it("formats and stores dates in Asia/Kolkata without off-by-one-day drift", () => {
    const instant = new Date("2026-01-01T20:30:00.000Z");
    expect(toCalendarDateInput(instant)).toBe("2026-01-02");
    expect(formatCalendarDate(instant)).toBe("02 Jan 2026");
  });

  it("adds payment terms in calendar days", () => {
    const invoiceDate = parseCalendarDate("2026-01-01");
    expect(invoiceDate).not.toBeNull();
    expect(toCalendarDateInput(addCalendarDays(invoiceDate!, 30))).toBe("2026-01-31");
  });

  it("derives issueDate and dueDate from invoiceDate and payment terms", () => {
    const invoiceDate = parseCalendarDate("2026-10-10");
    expect(invoiceDate).not.toBeNull();
    const derived = deriveInvoiceDates(invoiceDate!, 10);
    expect(toCalendarDateInput(derived.invoiceDate)).toBe("2026-10-10");
    expect(toCalendarDateInput(derived.issueDate)).toBe("2026-10-10");
    expect(toCalendarDateInput(derived.dueDate)).toBe("2026-10-20");
  });
});
