import { describe, expect, it } from "vitest";
import { PAYMENT_COMMISSION_BPS, PAYMENT_FEATURES } from "@shared/payment-policy";
import { createAgronexOrder } from "./db";

describe("AGRONEX payment policy", () => {
  it("allows the guarded manual and automatic marketplace paths with a fixed 5% commission", () => {
    expect(PAYMENT_FEATURES).toEqual({ subscriptions: false, boosts: false, manualP2P: true, automaticPayments: false });
    expect(PAYMENT_COMMISSION_BPS).toBe(500);
  });

  it("keeps subscriptions and boosts disabled", () => {
    expect(PAYMENT_FEATURES.subscriptions).toBe(false);
    expect(PAYMENT_FEATURES.boosts).toBe(false);
    expect(PAYMENT_FEATURES.automaticPayments).toBe(false);
  });

  it("blocks the legacy direct-order service so purchases must use the verified manual flow", async () => {
    await expect(createAgronexOrder(1, { postId: "123e4567-e89b-42d3-a456-426614174000", qty: 1 }))
      .rejects.toThrow(/commande directe est fermée/i);
  });
});
