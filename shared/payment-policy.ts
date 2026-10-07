/** Marketplace Mobile Money uses 5/95 settlement; availability is still gated by secrets and the owner switch. */
export const PAYMENT_FEATURES = {
  subscriptions: false,
  boosts: false,
  manualP2P: true,
  automaticPayments: false,
} as const;

export const PAYMENT_COMMISSION_BPS = 500;

export function calculateCommissionFc(grossAmount: number): number {
  if (!Number.isSafeInteger(grossAmount) || grossAmount <= 0) throw new Error("Le montant doit être un entier FC positif.");
  return Math.floor(grossAmount / 10_000) * PAYMENT_COMMISSION_BPS
    + Math.round(((grossAmount % 10_000) * PAYMENT_COMMISSION_BPS) / 10_000);
}

export const PAYMENT_DISABLED_MESSAGE =
  "Les paiements Mobile Money sont temporairement désactivés. Orange Money, Airtel Money, AfriMoney et M-Pesa seront disponibles après configuration et activation explicite.";

export const BOOST_DISABLED_MESSAGE =
  "Les boosts et abonnements ne sont pas disponibles; les achats de produits sont séparés et utilisent Mobile Money avec une commission de 5 %.";

export const PAYMENT_STATUS_MESSAGE =
  "Paiement Mobile Money : Orange Money, Airtel Money, AfriMoney et M-Pesa sont préparés mais restent désactivés jusqu’à leur activation explicite.";
