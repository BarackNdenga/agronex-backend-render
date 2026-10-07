import { describe, expect, it } from "vitest";
import { assertPayoutAvailable, calculateAgronexSplit, computeLedgerBalance, normalizeMobileMoneyPhone, normalizeMobileMoneyReference } from "./payments";

describe("AGRONEX manual Mobile Money", () => {
  it("splits a marketplace payment into exactly 5% platform commission and 95% farmer net", () => {
    expect(calculateAgronexSplit(100_000)).toEqual({ grossAmount: 100_000, commissionAmount: 5_000, farmerAmount: 95_000 });
    expect(calculateAgronexSplit(101)).toEqual({ grossAmount: 101, commissionAmount: 5, farmerAmount: 96 });
    expect(calculateAgronexSplit(1).commissionAmount + calculateAgronexSplit(1).farmerAmount).toBe(1);
  });

  it("rejects non-positive, fractional, and unsafe purchase amounts", () => {
    for (const amount of [0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => calculateAgronexSplit(amount)).toThrow();
    }
  });

  it("keeps the 95/5 split exact at the largest safe integer FC amount", () => {
    const gross = Number.MAX_SAFE_INTEGER;
    const split = calculateAgronexSplit(gross);
    expect(split.grossAmount).toBe(gross);
    expect(split.grossAmount).toBe(split.commissionAmount + split.farmerAmount);
    expect(Number.isSafeInteger(split.commissionAmount)).toBe(true);
    expect(Number.isSafeInteger(split.farmerAmount)).toBe(true);
  });

  it("normalizes provider references and rejects ambiguous or oversized values", () => {
    expect(normalizeMobileMoneyReference(" mp261005.1245.a12345 ")).toBe("MP261005.1245.A12345");
    expect(() => normalizeMobileMoneyReference("" )).toThrow();
    expect(() => normalizeMobileMoneyReference("??bad reference")).toThrow();
    expect(() => normalizeMobileMoneyReference("A".repeat(121))).toThrow();
  });

  it("accepts typical DRC phone formats without changing the digits", () => {
    expect(normalizeMobileMoneyPhone("+243 812 345 678")).toBe("+243812345678");
    expect(normalizeMobileMoneyPhone("0812-345-678")).toBe("0812345678");
    expect(() => normalizeMobileMoneyPhone("12345")).toThrow();
    expect(() => normalizeMobileMoneyPhone("+243ABC")).toThrow();
  });

  it("computes wallet balances from immutable credit/debit entries and reserves pending payouts", () => {
    const balance = computeLedgerBalance([
      { amount: 95_000, direction: "credit" },
      { amount: 20_000, direction: "debit" },
    ]);
    expect(balance).toBe(75_000);
    expect(() => assertPayoutAvailable(balance, 10_000, 65_001)).toThrow(/insuffisant/i);
    expect(() => assertPayoutAvailable(balance, 10_000, 65_000)).not.toThrow();
    expect(() => assertPayoutAvailable(balance, 0, 0)).toThrow();
    expect(() => computeLedgerBalance([{ amount: Number.MAX_SAFE_INTEGER, direction: "credit" }, { amount: 1, direction: "credit" }])).toThrow(/plage prise en charge/i);
    expect(() => assertPayoutAvailable(balance, Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(/invalides/i);
  });
});
