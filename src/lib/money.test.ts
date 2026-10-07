import { describe, expect, it } from "vitest";
import { formatMoney, merchantKey, parseAmountNumber, parseCurrency } from "./money";

describe("parseAmountNumber", () => {
  it.each([
    ["45,00 zł", 45],
    ["zł 45.5", 45.5],
    ["€12.50", 12.5],
    ["PLN 1 234,56", 1234.56],
    ["1 234,56 zł", 1234.56],
    ["$1,234.56", 1234.56],
    ["1.234,56 €", 1234.56],
    ["1,234", 1234],
    ["12", 12],
    ["-€3.20", -3.2],
    ["€ -3,20", -3.2],
    ["−7,99 zł", -7.99],
    [19.999, 19.999],
  ])("%s → %s", (raw, expected) => {
    expect(parseAmountNumber(raw)).toBe(expected);
  });

  it("returns null when there's no number", () => {
    expect(parseAmountNumber("")).toBeNull();
    expect(parseAmountNumber("zł")).toBeNull();
    expect(parseAmountNumber(undefined)).toBeNull();
    expect(parseAmountNumber(Number.NaN)).toBeNull();
  });
});

describe("parseCurrency", () => {
  it.each([
    ["45,00 zł", "PLN"],
    ["€12.50", "EUR"],
    ["PLN 1 234,56", "PLN"],
    ["12.00 GBP", "GBP"],
    ["£3", "GBP"],
    ["$4.99", "USD"],
    ["12", null],
  ])("%s → %s", (raw, expected) => {
    expect(parseCurrency(raw)).toBe(expected);
  });
});

describe("merchantKey", () => {
  it("ignores case and spacing", () => {
    expect(merchantKey("  Żabka   Polska ")).toBe(merchantKey("żabka polska"));
  });
});

describe("formatMoney", () => {
  it("keeps an unknown currency readable", () => {
    expect(formatMoney(12.5, "ZZ1")).toBe("12.50 ZZ1");
  });
});
