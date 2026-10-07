import { and, desc, eq, gte, or, sum } from "drizzle-orm";
import { PAYMENT_COMMISSION_BPS, PAYMENT_FEATURES } from "@shared/payment-policy";
import {
  agronexOrders,
  agronexPaymentRequests,
  agronexPaymentSettings,
  agronexPayoutRequests,
  agronexPosts,
  agronexProfiles,
  agronexWalletEntries,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { assertPayoutAvailable, calculateAgronexSplit, computeLedgerBalance, normalizeMobileMoneyPhone, normalizeMobileMoneyReference } from "./payments";
import { MOBILE_MONEY_PROVIDERS, type MobileMoneyProvider } from "./mobile-money";

type Provider = MobileMoneyProvider;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Le registre des paiements est temporairement indisponible.");
  return db;
}

function cleanName(value: string | null | undefined) {
  const name = value?.trim() ?? "";
  return name || null;
}

function normalizedSettings(row: typeof agronexPaymentSettings.$inferSelect | undefined) {
  const enabled = Boolean(row?.enabled && (row.mpesaPhone || row.airtelPhone || row.orangePhone || row.afrimoneyPhone));
  const mpesaPhone = enabled ? row?.mpesaPhone ?? null : null;
  const airtelPhone = enabled ? row?.airtelPhone ?? null : null;
  const orangePhone = enabled ? row?.orangePhone ?? null : null;
  const afrimoneyPhone = enabled ? row?.afrimoneyPhone ?? null : null;
  return {
    enabled,
    automaticEnabled: false,
    gatewayConfigured: false,
    gatewayMode: "sandbox" as const,
    mpesaName: mpesaPhone ? row?.mpesaName ?? "AGRONEX" : null,
    mpesaPhone,
    airtelName: airtelPhone ? row?.airtelName ?? "AGRONEX" : null,
    airtelPhone,
    orangeName: orangePhone ? row?.orangeName ?? "AGRONEX" : null,
    orangePhone,
    afrimoneyName: afrimoneyPhone ? row?.afrimoneyName ?? "AGRONEX" : null,
    afrimoneyPhone,
    providers: MOBILE_MONEY_PROVIDERS,
    commissionBps: PAYMENT_COMMISSION_BPS,
    currency: "FC" as const,
    mode: "manual" as const,
  };
}

export async function getPublicPaymentOptions() {
  const db = await requireDb();
  const [row] = await db.select().from(agronexPaymentSettings).where(eq(agronexPaymentSettings.id, 1)).limit(1);
  return normalizedSettings(row);
}

export async function savePaymentSettings(actorId: number, input: {
  enabled: boolean;
  automaticEnabled?: boolean;
  mpesaName: string;
  mpesaPhone: string;
  airtelName: string;
  airtelPhone: string;
  orangeName: string;
  orangePhone: string;
  afrimoneyName: string;
  afrimoneyPhone: string;
}) {
  const db = await requireDb();
  const mpesaName = cleanName(input.mpesaName);
  const mpesaPhone = input.mpesaPhone.trim() ? normalizeMobileMoneyPhone(input.mpesaPhone) : null;
  const airtelName = cleanName(input.airtelName);
  const airtelPhone = input.airtelPhone.trim() ? normalizeMobileMoneyPhone(input.airtelPhone) : null;
  const orangeName = cleanName(input.orangeName);
  const orangePhone = input.orangePhone.trim() ? normalizeMobileMoneyPhone(input.orangePhone) : null;
  const afrimoneyName = cleanName(input.afrimoneyName);
  const afrimoneyPhone = input.afrimoneyPhone.trim() ? normalizeMobileMoneyPhone(input.afrimoneyPhone) : null;
  if (Boolean(mpesaName) !== Boolean(mpesaPhone) || Boolean(airtelName) !== Boolean(airtelPhone) || Boolean(orangeName) !== Boolean(orangePhone) || Boolean(afrimoneyName) !== Boolean(afrimoneyPhone)) {
    throw new Error("Pour chaque opérateur, renseigne à la fois le nom du bénéficiaire et son numéro, ou laisse les deux vides.");
  }
  if (input.enabled && !mpesaPhone && !airtelPhone && !orangePhone && !afrimoneyPhone) throw new Error("Ajoute au moins un numéro marchand avant d’activer les paiements.");
  if (input.automaticEnabled) throw new Error("Les paiements automatiques sont désactivés dans cette version.");
  const now = Date.now();
  await db.insert(agronexPaymentSettings).values({
    id: 1, enabled: input.enabled, automaticEnabled: false, mpesaName, mpesaPhone, airtelName, airtelPhone, orangeName, orangePhone, afrimoneyName, afrimoneyPhone, updatedBy: actorId, updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { enabled: input.enabled, automaticEnabled: false, mpesaName, mpesaPhone, airtelName, airtelPhone, orangeName, orangePhone, afrimoneyName, afrimoneyPhone, updatedBy: actorId, updatedAt: now } });
  return getPublicPaymentOptions();
}

export async function createManualAgronexOrder(userId: number, input: { postId: string; qty: number; provider: Provider }) {
  if (!PAYMENT_FEATURES.manualP2P) throw new Error("Le paiement manuel n’est pas disponible.");
  const db = await requireDb();
  const now = Date.now();
  if (!Number.isSafeInteger(input.qty) || input.qty < 1) throw new Error("La quantité est invalide.");

  return db.transaction(async (tx) => {
    const [settingsRow] = await tx.select().from(agronexPaymentSettings).where(eq(agronexPaymentSettings.id, 1)).for("update").limit(1);
    const settings = normalizedSettings(settingsRow);
    if (!settings.enabled) throw new Error("Les paiements ne sont pas configurés par l’administration.");
    const destinationPhone = settings[`${input.provider}Phone` as keyof typeof settings] as string | null;
    const destinationName = settings[`${input.provider}Name` as keyof typeof settings] as string | null;
    if (!destinationPhone || !destinationName) throw new Error("Ce moyen de paiement n’est pas activé actuellement.");
    const [buyer] = await tx.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
    if (!buyer || (buyer.role !== "acheteur" && buyer.role !== "investisseur")) throw new Error("Seuls les comptes Acheteur ou Investisseur peuvent acheter sur le marché.");
    const [post] = await tx.select().from(agronexPosts).where(eq(agronexPosts.id, input.postId)).for("update").limit(1);
    if (!post || post.status !== "disponible") throw new Error("Cette offre n’est plus disponible.");
    if (post.farmerId === userId) throw new Error("Vous ne pouvez pas acheter votre propre produit.");
    if (input.qty > post.qty) throw new Error("La quantité demandée dépasse le stock disponible.");
    const grossAmount = post.price * input.qty;
    if (!Number.isSafeInteger(grossAmount) || grossAmount <= 0) throw new Error("Le montant total dépasse la plage prise en charge.");
    const split = calculateAgronexSplit(grossAmount);
    const [farmer] = await tx.select().from(agronexProfiles).where(eq(agronexProfiles.userId, post.farmerId)).limit(1);
    if (!farmer) throw new Error("Le profil du vendeur n’est plus disponible.");

    const remainingQty = post.qty - input.qty;
    const stockUpdate = await tx.update(agronexPosts).set({ qty: remainingQty, status: remainingQty > 0 ? "disponible" : "reserve" })
      .where(and(eq(agronexPosts.id, post.id), eq(agronexPosts.status, "disponible"), gte(agronexPosts.qty, input.qty)));
    if (!stockUpdate[0].affectedRows) throw new Error("Le stock vient d’être réservé par un autre acheteur.");

    const orderId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const pendingReference = `PENDING-${paymentId}`;
    await tx.insert(agronexOrders).values({
      id: orderId, postId: post.id, postTitle: post.title, farmerId: farmer.userId, farmerName: farmer.name,
      pickup: post.location, buyerId: buyer.userId, buyerName: buyer.name, buyerLocation: buyer.location,
      qty: input.qty, unit: post.unit, unitPrice: post.price, grossAmount, paymentStatus: "pending",
      status: "a_transporter", transporterId: null, transporterName: null, createdAt: now,
    });
    await tx.insert(agronexPaymentRequests).values({
      id: paymentId, orderId, buyerId: buyer.userId, farmerId: farmer.userId,
      buyerName: buyer.name, farmerName: farmer.name, postTitle: post.title,
      provider: input.provider, destinationName, destinationPhone, grossAmount, commissionAmount: split.commissionAmount, farmerAmount: split.farmerAmount,
      reference: pendingReference, status: "pending", reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: now,
    });
    return {
      paymentId, orderId, status: "pending" as const, product: post.title, qty: input.qty, unit: post.unit,
      unitPrice: post.price, ...split, currency: "FC" as const, commissionBps: PAYMENT_COMMISSION_BPS,
      provider: input.provider, destinationName, destinationPhone, createdAt: now,
    };
  });
}

export async function confirmManualPayment(userId: number, input: { paymentId: string; reference: string }) {
  const reference = normalizeMobileMoneyReference(input.reference);
  if (reference.startsWith("PENDING-")) throw new Error("Saisis la référence réelle du SMS de ton opérateur.");
  const db = await requireDb();
  const now = Date.now();
  try {
    return await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(agronexPaymentRequests).where(eq(agronexPaymentRequests.id, input.paymentId)).for("update").limit(1);
      if (!payment || payment.buyerId !== userId) throw new Error("Demande de paiement introuvable.");
      if (payment.status !== "pending" || payment.reference !== `PENDING-${payment.id}`) throw new Error("Cette demande ne peut plus recevoir de référence.");
      await tx.update(agronexPaymentRequests).set({ reference }).where(eq(agronexPaymentRequests.id, payment.id));
      return { success: true as const, paymentId: payment.id, reference, confirmedAt: now };
    });
  } catch (error) {
    if (String(error).includes("Duplicate entry") || (error as { code?: string })?.code === "ER_DUP_ENTRY") throw new Error("Cette référence Mobile Money a déjà été utilisée. Vérifie le SMS de confirmation.");
    throw error;
  }
}

export async function cancelUnpaidManualOrder(userId: number, paymentId: string) {
  const db = await requireDb();
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(agronexPaymentRequests).where(eq(agronexPaymentRequests.id, paymentId)).for("update").limit(1);
    if (!payment || payment.buyerId !== userId) throw new Error("Demande de paiement introuvable.");
    if (payment.status !== "pending" || payment.reference !== `PENDING-${payment.id}`) throw new Error("Une demande avec référence de transfert soumise doit être traitée par un administrateur.");
    await releaseReservedStock(tx, payment.orderId);
    await tx.update(agronexPaymentRequests).set({ status: "rejected", reviewedAt: now, reviewNote: "Annulée par l’acheteur avant transfert." }).where(eq(agronexPaymentRequests.id, payment.id));
    await tx.update(agronexOrders).set({ paymentStatus: "rejected", status: "annulee" }).where(eq(agronexOrders.id, payment.orderId));
    return { success: true as const };
  });
}

export async function getMyManualPayments(userId: number) {
  const db = await requireDb();
  const [profile] = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
  if (!profile) throw new Error("Terminez d’abord la création de votre profil AGRONEX.");
  const [payments, payouts, entries, pendingPayouts] = await Promise.all([
    db.select().from(agronexPaymentRequests).where(or(eq(agronexPaymentRequests.buyerId, userId), eq(agronexPaymentRequests.farmerId, userId))).orderBy(desc(agronexPaymentRequests.createdAt)).limit(100),
    db.select().from(agronexPayoutRequests).where(eq(agronexPayoutRequests.farmerId, userId)).orderBy(desc(agronexPayoutRequests.requestedAt)).limit(100),
    db.select({ amount: agronexWalletEntries.amount, direction: agronexWalletEntries.direction }).from(agronexWalletEntries).where(eq(agronexWalletEntries.userId, userId)),
    db.select({ total: sum(agronexPayoutRequests.amount) }).from(agronexPayoutRequests).where(and(eq(agronexPayoutRequests.farmerId, userId), eq(agronexPayoutRequests.status, "pending"))),
  ]);
  const balance = computeLedgerBalance(entries.map((entry) => ({ amount: Number(entry.amount), direction: entry.direction })));
  const pendingAmount = Number(pendingPayouts[0]?.total ?? 0);
    return {
      role: profile.role,
    payoutProvider: profile.payoutProvider,
    payoutPhone: profile.payoutPhone,
    balance,
    pendingPayout: pendingAmount,
    availableBalance: Math.max(0, balance - pendingAmount),
    payments,
    payouts,
  };
}

export async function saveFarmerPayoutDetails(userId: number, provider: Provider, phoneInput: string) {
  const phone = normalizeMobileMoneyPhone(phoneInput);
  const db = await requireDb();
  const [profile] = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
  if (!profile || profile.role !== "agriculteur") throw new Error("Seuls les agriculteurs peuvent enregistrer leur compte de versement vendeur.");
  await db.update(agronexProfiles).set({ payoutProvider: provider, payoutPhone: phone, payoutUpdatedAt: Date.now() }).where(eq(agronexProfiles.userId, userId));
  return { payoutProvider: provider, payoutPhone: phone };
}

export async function requestManualPayout(userId: number, input: { amount: number; provider: Provider; phone: string }) {
  const db = await requireDb();
  const phone = normalizeMobileMoneyPhone(input.phone);
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).for("update").limit(1);
    if (!profile || profile.role !== "agriculteur") throw new Error("Seuls les agriculteurs peuvent demander un retrait de leur solde.");
    const entries = await tx.select({ amount: agronexWalletEntries.amount, direction: agronexWalletEntries.direction }).from(agronexWalletEntries).where(eq(agronexWalletEntries.userId, userId));
    const pendingRows = await tx.select({ amount: agronexPayoutRequests.amount }).from(agronexPayoutRequests).where(and(eq(agronexPayoutRequests.farmerId, userId), eq(agronexPayoutRequests.status, "pending")));
    const balance = computeLedgerBalance(entries.map((entry) => ({ amount: Number(entry.amount), direction: entry.direction })));
    const pending = pendingRows.reduce((total, row) => total + Number(row.amount), 0);
    assertPayoutAvailable(balance, pending, input.amount);
    const id = crypto.randomUUID();
    await tx.insert(agronexPayoutRequests).values({ id, farmerId: userId, farmerName: profile.name, amount: input.amount, provider: input.provider, phone, status: "pending", requestedAt: now, reviewedBy: null, reviewedAt: null, payoutReference: null, note: null });
    return { id, amount: input.amount, provider: input.provider, phone, status: "pending" as const, requestedAt: now };
  });
}

export async function getManualPaymentAdminData() {
  const db = await requireDb();
  const [settings, payments, payouts, commissions, admins] = await Promise.all([
    db.select().from(agronexPaymentSettings).where(eq(agronexPaymentSettings.id, 1)).limit(1),
    db.select().from(agronexPaymentRequests).orderBy(desc(agronexPaymentRequests.createdAt)).limit(150),
    db.select().from(agronexPayoutRequests).orderBy(desc(agronexPayoutRequests.requestedAt)).limit(150),
    db.select({ amount: agronexWalletEntries.amount, direction: agronexWalletEntries.direction }).from(agronexWalletEntries).where(and(eq(agronexWalletEntries.accountType, "platform"), eq(agronexWalletEntries.entryType, "commission"))),
    db.select({ role: users.role }).from(users).where(eq(users.role, "admin")),
  ]);
  const confirmedCommission = computeLedgerBalance(commissions.map((entry) => ({ amount: Number(entry.amount), direction: entry.direction })));
  return {
    settings: settings[0] ? {
      enabled: settings[0].enabled, automaticEnabled: false, gatewayConfigured: false, gatewayMode: "sandbox" as const, mpesaName: settings[0].mpesaName ?? "", mpesaPhone: settings[0].mpesaPhone ?? "",
      airtelName: settings[0].airtelName ?? "", airtelPhone: settings[0].airtelPhone ?? "", orangeName: settings[0].orangeName ?? "", orangePhone: settings[0].orangePhone ?? "", afrimoneyName: settings[0].afrimoneyName ?? "", afrimoneyPhone: settings[0].afrimoneyPhone ?? "",
    } : { enabled: false, automaticEnabled: false, gatewayConfigured: false, gatewayMode: "sandbox" as const, mpesaName: "", mpesaPhone: "", airtelName: "", airtelPhone: "", orangeName: "", orangePhone: "", afrimoneyName: "", afrimoneyPhone: "" },
    commissions: confirmedCommission,
    paymentRequests: payments,
    payoutRequests: payouts,
    adminCount: admins.length,
  };
}

async function releaseReservedStock(tx: any, orderId: string) {
  const [order] = await tx.select().from(agronexOrders).where(eq(agronexOrders.id, orderId)).for("update").limit(1);
  if (!order || order.paymentStatus === "approved" || order.paymentStatus === "refunded" || order.paymentStatus === "rejected" || order.status === "annulee") return;
  const [post] = await tx.select().from(agronexPosts).where(eq(agronexPosts.id, order.postId)).for("update").limit(1);
  if (!post) return;
  const restored = post.qty + order.qty;
  await tx.update(agronexPosts).set({ qty: restored, status: "disponible" }).where(eq(agronexPosts.id, post.id));
}

export async function reviewManualPayment(actorId: number, input: { paymentId: string; decision: "approve" | "reject" | "refund_required" | "refunded"; note: string }) {
  const db = await requireDb();
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(agronexPaymentRequests).where(eq(agronexPaymentRequests.id, input.paymentId)).for("update").limit(1);
    if (!payment) throw new Error("Demande de paiement introuvable.");
        if (input.decision === "refunded") {
      if (payment.status !== "refund_required") throw new Error("Seul un paiement en attente de remboursement peut être marqué remboursé.");
      await releaseReservedStock(tx, payment.orderId);
      await tx.update(agronexPaymentRequests).set({ status: "refunded", reviewedBy: actorId, reviewedAt: now, reviewNote: input.note || null }).where(eq(agronexPaymentRequests.id, payment.id));
      await tx.update(agronexOrders).set({ paymentStatus: "refunded", status: "annulee" }).where(eq(agronexOrders.id, payment.orderId));
      return { status: "refunded" as const };
    }
    if (payment.status !== "pending") throw new Error("Cette demande a déjà été traitée.");
    if (payment.reference === `PENDING-${payment.id}` && input.decision !== "reject") throw new Error("Aucune référence de transfert n’a été soumise; ne valide pas ce paiement.");
    if (input.decision === "approve") {
      await tx.update(agronexPaymentRequests).set({ status: "approved", reviewedBy: actorId, reviewedAt: now, reviewNote: input.note || null }).where(eq(agronexPaymentRequests.id, payment.id));
      await tx.update(agronexOrders).set({ paymentStatus: "approved" }).where(eq(agronexOrders.id, payment.orderId));
      await tx.insert(agronexWalletEntries).values([
        { id: crypto.randomUUID(), accountType: "farmer", userId: payment.farmerId, entryType: "sale_credit", direction: "credit", amount: payment.farmerAmount, paymentRequestId: payment.id, payoutRequestId: null, createdAt: now },
        { id: crypto.randomUUID(), accountType: "platform", userId: null, entryType: "commission", direction: "credit", amount: payment.commissionAmount, paymentRequestId: payment.id, payoutRequestId: null, createdAt: now },
      ]);
      return { status: "approved" as const, farmerAmount: payment.farmerAmount, commissionAmount: payment.commissionAmount };
    }
    const status = input.decision === "refund_required" ? "refund_required" as const : "rejected" as const;
    if (status === "rejected") await releaseReservedStock(tx, payment.orderId);
    await tx.update(agronexPaymentRequests).set({ status, reviewedBy: actorId, reviewedAt: now, reviewNote: input.note || null }).where(eq(agronexPaymentRequests.id, payment.id));
    await tx.update(agronexOrders).set({ paymentStatus: status, ...(status === "rejected" ? { status: "annulee" as const } : {}) }).where(eq(agronexOrders.id, payment.orderId));
    return { status };
  });
}

export async function reviewManualPayout(actorId: number, input: { payoutId: string; decision: "paid" | "reject"; reference: string; note: string }) {
  const db = await requireDb();
  const now = Date.now();
  try {
    return await db.transaction(async (tx) => {
      const [payout] = await tx.select().from(agronexPayoutRequests).where(eq(agronexPayoutRequests.id, input.payoutId)).for("update").limit(1);
      if (!payout || payout.status !== "pending") throw new Error("Cette demande de retrait est absente ou déjà traitée.");
      if (payout.paymentRequestId) throw new Error("Ce versement est lié à une commande et ne peut pas être traité manuellement.");
      if (input.decision === "reject") {
        await tx.update(agronexPayoutRequests).set({ status: "rejected", reviewedBy: actorId, reviewedAt: now, note: input.note || null }).where(eq(agronexPayoutRequests.id, payout.id));
        return { status: "rejected" as const };
      }
      const reference = normalizeMobileMoneyReference(input.reference);
      const [profile] = await tx.select().from(agronexProfiles).where(eq(agronexProfiles.userId, payout.farmerId)).for("update").limit(1);
      if (!profile || profile.role !== "agriculteur") throw new Error("Le profil agriculteur associé à ce retrait n’est plus disponible.");
      const entries = await tx.select({ amount: agronexWalletEntries.amount, direction: agronexWalletEntries.direction }).from(agronexWalletEntries).where(eq(agronexWalletEntries.userId, payout.farmerId));
      const pendingRows = await tx.select({ amount: agronexPayoutRequests.amount }).from(agronexPayoutRequests).where(and(eq(agronexPayoutRequests.farmerId, payout.farmerId), eq(agronexPayoutRequests.status, "pending")));
      const balance = computeLedgerBalance(entries.map((entry) => ({ amount: Number(entry.amount), direction: entry.direction })));
      const pending = pendingRows.reduce((total, row) => total + Number(row.amount), 0);
      assertPayoutAvailable(balance, 0, pending);
      await tx.update(agronexPayoutRequests).set({ status: "paid", reviewedBy: actorId, reviewedAt: now, payoutReference: reference, note: input.note || null }).where(eq(agronexPayoutRequests.id, payout.id));
      await tx.insert(agronexWalletEntries).values({ id: crypto.randomUUID(), accountType: "farmer", userId: payout.farmerId, entryType: "payout", direction: "debit", amount: Number(payout.amount), paymentRequestId: null, payoutRequestId: payout.id, createdAt: now });
      return { status: "paid" as const, amount: Number(payout.amount), reference };
    });
  } catch (error) {
    if (String(error).includes("Duplicate entry") || (error as { code?: string })?.code === "ER_DUP_ENTRY") throw new Error("Cette référence de versement a déjà été utilisée pour cet opérateur.");
    throw error;
  }
}
