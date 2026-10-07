import { calculateCommissionFc } from "@shared/payment-policy";

export type MoneySplit = { grossAmount: number; commissionAmount: number; farmerAmount: number };

/** All marketplace prices are stored in integer FC; 5% is rounded to the nearest whole FC. */
export function calculateAgronexSplit(grossAmount: number): MoneySplit {
  if (!Number.isSafeInteger(grossAmount) || grossAmount <= 0) throw new Error("Le montant doit être un nombre entier de FC positif.");
  const commissionAmount = calculateCommissionFc(grossAmount);
  return { grossAmount, commissionAmount, farmerAmount: grossAmount - commissionAmount };
}

export function normalizeMobileMoneyReference(value: string): string {
  const reference = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (reference.length < 3 || reference.length > 120 || !/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(reference)) {
    throw new Error("La référence doit contenir de 3 à 120 caractères latins/chiffres.");
  }
  return reference;
}

export function normalizeMobileMoneyPhone(value: string): string {
  const phone = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{8,16}$/.test(phone)) throw new Error("Saisis un numéro Mobile Money valide (8 à 16 chiffres, indicatif facultatif).");
  return phone;
}

export function computeLedgerBalance(entries: Array<{ amount: number; direction: "credit" | "debit" }>): number {
  return entries.reduce((total, entry) => {
    if (!Number.isSafeInteger(entry.amount) || entry.amount < 0) throw new Error("Écriture de portefeuille invalide.");
    const next = total + (entry.direction === "credit" ? entry.amount : -entry.amount);
    if (!Number.isSafeInteger(next)) throw new Error("Le solde dépasse la plage prise en charge.");
    return next;
  }, 0);
}

export function assertPayoutAvailable(balance: number, pending: number, amount: number) {
  if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(pending) || balance < 0 || pending < 0) {
    throw new Error("Le solde ou les retraits en attente sont invalides.");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Le montant du retrait doit être un nombre entier de FC supérieur à zéro.");
  if (amount > balance - pending) throw new Error("Le solde disponible est insuffisant pour ce retrait.");
}
