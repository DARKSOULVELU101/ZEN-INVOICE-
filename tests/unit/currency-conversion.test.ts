import { describe, expect, it } from "vitest";
import {
  convertDocumentAmountToBase,
  invertLegacyExchangeRate,
} from "@/lib/money/currency";

describe("currency conversion", () => {
  it("converts document amounts using a document-to-base rate", () => {
    expect(convertDocumentAmountToBase("100", "83.3333").toString()).toBe("8333.33");
  });

  it("keeps base currency amounts unchanged", () => {
    expect(convertDocumentAmountToBase("100", "1").toFixed(2)).toBe("100.00");
  });

  it("inverts legacy base-to-document rates", () => {
    expect(invertLegacyExchangeRate("0.012").toString()).toBe("83.33333333");
  });

  it("rejects invalid rates", () => {
    expect(() => convertDocumentAmountToBase("100", "0")).toThrow(/exchange rate/i);
    expect(() => convertDocumentAmountToBase("100", "-1")).toThrow(/exchange rate/i);
  });
});
