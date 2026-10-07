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
} from "../drizzle/schema.d1";
import { getDb } from "./db";
import { isD1UniqueConstraintError, runD1, runD1Batch } from "./_core/d1";
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
  }).onConflictDoUpdate({ target: agronexPaymentSettings.id, set: { enabled: input.enabled, automaticEnabled: false, mpesaName, mpesaPhone, airtelName, airtelPhone, orangeName, orangePhone, afrimoneyName, afrimoneyPhone, updatedBy: actorId, updatedAt: now } });
  return getPublicPaymentOptions();
}

export async function createManualAgronexOrder(userId: number, input: { postId: string; qty: number; provider: Provider }) {
  if (!PAYMENT_FEATURES.manualP2P) throw new Error("Le paiement manuel n’est pas disponible.");
  const db = await requireDb();
  const now = Date.now();
  if (!Number.isSafeInteger(input.qty) || input.qty < 1) throw new Error("La quantité est invalide.");
  const [settingsRow] = await db.select().from(agronexPaymentSettings).where(eq(agronexPaymentSettings.id, 1)).limit(1);
  const settings = normalizedSettings(settingsRow);
  if (!settings.enabled) throw new Error("Les paiements ne sont pas configurés par l’administration.");
  const destinationPhone = settings[`${input.provider}Phone` as keyof typeof settings] as string | null;
  const destinationName = settings[`${input.provider}Name` as keyof typeof settings] as string | null;
  if (!destinationPhone || !destinationName) throw new Error("Ce moyen de paiement n’est pas activé actuellement.");
  const [buyer] = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
  if (!buyer || (buyer.role !== "acheteur" && buyer.role !== "investisseur")) throw new Error("Seuls les comptes Acheteur ou Investisseur peuvent acheter sur le marché.");
  const [post] = await db.select().from(agronexPosts).where(eq(agronexPosts.id, input.postId)).limit(1);
  if (!post || post.status !== "disponible") throw new Error("Cette offre n’est plus disponible.");
  if (post.farmerId === userId) throw new Error("Vous ne pouvez pas acheter votre propre produit.");
  if (input.qty > post.qty) throw new Error("La quantité demandée dépasse le stock disponible.");
  const grossAmount = post.price * input.qty;
  if (!Number.isSafeInteger(grossAmount) || grossAmount <= 0) throw new Error("Le montant total dépasse la plage prise en charge.");
  const split = calculateAgronexSplit(grossAmount);
  const [farmer] = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, post.farmerId)).limit(1);
  if (!farmer) throw new Error("Le profil du vendeur n’est plus disponible.");

  const orderId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const pendingReference = `PENDING-${paymentId}`;
  const providerFields = {
    orange: ["orangePhone", "orangeName"],
    airtel: ["airtelPhone", "airtelName"],
    afrimoney: ["afrimoneyPhone", "afrimoneyName"],
    mpesa: ["mpesaPhone", "mpesaName"],
  } as const;
  const [phoneColumn, nameColumn] = providerFields[input.provider];
  try {
    const result = await runD1Batch([
      { sql: `UPDATE agronex_posts SET qty = qty - ?, status = CASE WHEN qty - ? > 0 THEN 'disponible' ELSE 'reserve' END
        WHERE id = ? AND status = 'disponible' AND qty >= ?
          AND EXISTS (SELECT 1 FROM agronex_payment_settings WHERE id = 1 AND enabled = 1 AND automaticEnabled = 0 AND ${phoneColumn} = ? AND ${nameColumn} = ?)`,
        values: [input.qty, input.qty, post.id, input.qty, destinationPhone, destinationName] },
      { sql: `INSERT INTO agronex_orders (id, postId, postTitle, farmerId, farmerName, pickup, buyerId, buyerName, buyerLocation, qty, unit, unitPrice, grossAmount, paymentStatus, status, transporterId, transporterName, createdAt)
        SELECT ?, CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'a_transporter', NULL, NULL, ?`,
        values: [orderId, post.id, post.title, farmer.userId, farmer.name, post.location, buyer.userId, buyer.name, buyer.location, input.qty, post.unit, post.price, grossAmount, now] },
      { sql: `INSERT INTO agronex_payment_requests (id, orderId, buyerId, farmerId, buyerName, farmerName, postTitle, provider, destinationName, destinationPhone, grossAmount, commissionAmount, farmerAmount, reference, status, reviewedBy, reviewedAt, reviewNote, createdAt)
        SELECT ?, CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?`,
        values: [paymentId, orderId, buyer.userId, farmer.userId, buyer.name, farmer.name, post.title, input.provider, destinationName, destinationPhone, grossAmount, split.commissionAmount, split.farmerAmount, pendingReference, now] },
    ]);
    if (result.some((statement) => statement.meta.changes !== 1)) throw new Error("La réservation atomique de la commande a échoué.");
  } catch (error) {
    if (String(error).includes("NOT NULL constraint failed: agronex_orders.postId")) throw new Error("Le stock vient d’être réservé par un autre acheteur.");
    throw error;
  }
  return {
    paymentId, orderId, status: "pending" as const, product: post.title, qty: input.qty, unit: post.unit,
    unitPrice: post.price, ...split, currency: "FC" as const, commissionBps: PAYMENT_COMMISSION_BPS,
    provider: input.provider, destinationName, destinationPhone, createdAt: now,
  };
}

export async function confirmManualPayment(userId: number, input: { paymentId: string; reference: string }) {
  const reference = normalizeMobileMoneyReference(input.reference);
  if (reference.startsWith("PENDING-")) throw new Error("Saisis la référence réelle du SMS de ton opérateur.");
  const db = await requireDb();
  const now = Date.now();
  const [payment] = await db.select().from(agronexPaymentRequests).where(eq(agronexPaymentRequests.id, input.paymentId)).limit(1);
  if (!payment || payment.buyerId !== userId) throw new Error("Demande de paiement introuvable.");
  if (payment.status !== "pending" || payment.reference !== `PENDING-${payment.id}`) throw new Error("Cette demande ne peut plus recevoir de référence.");
  try {
    const updated = await db.update(agronexPaymentRequests).set({ reference })
      .where(and(eq(agronexPaymentRequests.id, payment.id), eq(agronexPaymentRequests.buyerId, userId), eq(agronexPaymentRequests.status, "pending"), eq(agronexPaymentRequests.reference, `PENDING-${payment.id}`)))
      .returning({ id: agronexPaymentRequests.id });
    if (!updated.length) throw new Error("Cette demande ne peut plus recevoir de référence.");
    return { success: true as const, paymentId: payment.id, reference, confirmedAt: now };
  } catch (error) {
    if (isD1UniqueConstraintError(error)) throw new Error("Cette référence Mobile Money a déjà été utilisée. Vérifie le SMS de confirmation.");
    throw error;
  }
}

export async function cancelUnpaidManualOrder(userId: number, paymentId: string) {
  const db = await requireDb();
  const now = Date.now();
  const [payment] = await db.select().from(agronexPaymentRequests).where(eq(agronexPaymentRequests.id, paymentId)).limit(1);
  if (!payment || payment.buyerId !== userId) throw new Error("Demande de paiement introuvable.");
  if (payment.status !== "pending" || payment.reference !== `PENDING-${payment.id}`) throw new Error("Une demande avec référence de transfert soumise doit être traitée par un administrateur.");
  const [order] = await db.select({ postId: agronexOrders.postId, qty: agronexOrders.qty }).from(agronexOrders).where(eq(agronexOrders.id, payment.orderId)).limit(1);
  if (!order) throw new Error("La commande associée est introuvable.");
  const result = await runD1Batch([
    { sql: "UPDATE agronex_payment_requests SET status = 'rejected', reviewedAt = ?, reviewNote = ? WHERE id = ? AND buyerId = ? AND status = 'pending' AND reference = ?", values: [now, "Annulée par l’acheteur avant transfert.", payment.id, userId, `PENDING-${payment.id}`] },
    { sql: "UPDATE agronex_orders SET paymentStatus = 'rejected', status = 'annulee' WHERE id = ? AND paymentStatus = 'pending' AND changes() = 1", values: [payment.orderId] },
    { sql: "UPDATE agronex_posts SET qty = qty + ?, status = 'disponible' WHERE id = ? AND changes() = 1", values: [order.qty, order.postId] },
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) throw new Error("Cette demande a déjà été traitée.");
  return { success: true as const };
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
  const [profile] = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
  if (!profile || profile.role !== "agriculteur") throw new Error("Seuls les agriculteurs peuvent demander un retrait de leur solde.");
  const [entries, pendingRows] = await Promise.all([
    db.select({ amount: agronexWalletEntries.amount, direction: agronexWalletEntries.direction }).from(agronexWalletEntries).where(eq(agronexWalletEntries.userId, userId)),
    db.select({ amount: agronexPayoutRequests.amount }).from(agronexPayoutRequests).where(and(eq(agronexPayoutRequests.farmerId, userId), eq(agronexPayoutRequests.status, "pending"))),
  ]);
  const balance = computeLedgerBalance(entries.map((entry) => ({ amount: Number(entry.amount), direction: entry.direction })));
  const pending = pendingRows.reduce((total, row) => total + Number(row.amount), 0);
  assertPayoutAvailable(balance, pending, input.amount);
  const id = crypto.randomUUID();
  const result = await runD1({
    sql: `INSERT INTO agronex_payout_requests (id, farmerId, farmerName, amount, provider, phone, status, requestedAt)
      SELECT ?, ?, ?, ?, ?, ?, 'pending', ?
      WHERE EXISTS (SELECT 1 FROM agronex_profiles WHERE userId = ? AND role = 'agriculteur')
        AND COALESCE((SELECT SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) FROM agronex_wallet_entries WHERE userId = ?), 0)
          - COALESCE((SELECT SUM(amount) FROM agronex_payout_requests WHERE farmerId = ? AND status = 'pending'), 0) >= ?`,
    values: [id, userId, profile.name, input.amount, input.provider, phone, now, userId, userId, userId, input.amount],
  });
  if (result.meta.changes !== 1) throw new Error("Le solde disponible a changé; actualise-le avant de demander ce retrait.");
  return { id, amount: input.amount, provider: input.provider, phone, status: "pending" as const, requestedAt: now };
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

export async function reviewManualPayment(actorId: number, input: { paymentId: string; decision: "approve" | "reject" | "refund_required" | "refunded"; note: string }) {
  const db = await requireDb();
  const now = Date.now();
  const [payment] = await db.select().from(agronexPaymentRequests).where(eq(agronexPaymentRequests.id, input.paymentId)).limit(1);
  if (!payment) throw new Error("Demande de paiement introuvable.");
  const expectedStatus = input.decision === "refunded" ? "refund_required" : "pending";
  if (payment.status !== expectedStatus) {
    if (input.decision === "refunded") throw new Error("Seul un paiement en attente de remboursement peut être marqué remboursé.");
    throw new Error("Cette demande a déjà été traitée.");
  }
  if (payment.reference === `PENDING-${payment.id}` && input.decision !== "reject") throw new Error("Aucune référence de transfert n’a été soumise; ne valide pas ce paiement.");
  const [order] = await db.select({ postId: agronexOrders.postId, qty: agronexOrders.qty }).from(agronexOrders).where(eq(agronexOrders.id, payment.orderId)).limit(1);
  if (!order) throw new Error("La commande associée est introuvable.");

  const nextStatus = input.decision === "approve" ? "approved" : input.decision === "refunded" ? "refunded" : input.decision === "refund_required" ? "refund_required" : "rejected";
  const closeOrder = nextStatus === "rejected" || nextStatus === "refunded";
  const releaseStock = closeOrder;
  const commands = [
    { sql: `UPDATE agronex_payment_requests SET status = ?, reviewedBy = ?, reviewedAt = ?, reviewNote = ? WHERE id = ? AND status = ?${input.decision === "approve" ? " AND reference <> ('PENDING-' || id)" : ""}`,
      values: [nextStatus, actorId, now, input.note || null, payment.id, expectedStatus] },
    { sql: `UPDATE agronex_orders SET paymentStatus = ?, ${closeOrder ? "status = 'annulee'" : "status = status"} WHERE id = ? AND changes() = 1`,
      values: [nextStatus, payment.orderId] },
  ];
  if (releaseStock) {
    commands.push({ sql: "UPDATE agronex_posts SET qty = qty + ?, status = 'disponible' WHERE id = ? AND changes() = 1", values: [order.qty, order.postId] });
  } else if (nextStatus === "approved") {
    commands.push({ sql: `INSERT INTO agronex_wallet_entries (id, accountType, userId, entryType, direction, amount, paymentRequestId, payoutRequestId, createdAt)
      SELECT ?, 'farmer', ?, 'sale_credit', 'credit', ?, ?, NULL, ? WHERE changes() = 1`,
      values: [crypto.randomUUID(), payment.farmerId, payment.farmerAmount, payment.id, now] });
    commands.push({ sql: `INSERT INTO agronex_wallet_entries (id, accountType, userId, entryType, direction, amount, paymentRequestId, payoutRequestId, createdAt)
      SELECT ?, 'platform', NULL, 'commission', 'credit', ?, ?, NULL, ? WHERE changes() = 1`,
      values: [crypto.randomUUID(), payment.commissionAmount, payment.id, now] });
  }
  const result = await runD1Batch(commands);
  if ((result[0]?.meta.changes ?? 0) !== 1) throw new Error("Cette demande vient d’être traitée par un autre administrateur.");
  if (nextStatus === "approved") return { status: "approved" as const, farmerAmount: payment.farmerAmount, commissionAmount: payment.commissionAmount };
  return { status: nextStatus };
}

export async function reviewManualPayout(actorId: number, input: { payoutId: string; decision: "paid" | "reject"; reference: string; note: string }) {
  const db = await requireDb();
  const now = Date.now();
  const [payout] = await db.select().from(agronexPayoutRequests).where(eq(agronexPayoutRequests.id, input.payoutId)).limit(1);
  if (!payout || payout.status !== "pending") throw new Error("Cette demande de retrait est absente ou déjà traitée.");
  if (payout.paymentRequestId) throw new Error("Ce versement est lié à une commande et ne peut pas être traité manuellement.");
  if (input.decision === "reject") {
    const updated = await db.update(agronexPayoutRequests).set({ status: "rejected", reviewedBy: actorId, reviewedAt: now, note: input.note || null })
      .where(and(eq(agronexPayoutRequests.id, payout.id), eq(agronexPayoutRequests.status, "pending")))
      .returning({ id: agronexPayoutRequests.id });
    if (!updated.length) throw new Error("Cette demande de retrait vient d’être traitée.");
    return { status: "rejected" as const };
  }

  const reference = normalizeMobileMoneyReference(input.reference);
  const [profile] = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, payout.farmerId)).limit(1);
  if (!profile || profile.role !== "agriculteur") throw new Error("Le profil agriculteur associé à ce retrait n’est plus disponible.");
  const [entries, pendingRows] = await Promise.all([
    db.select({ amount: agronexWalletEntries.amount, direction: agronexWalletEntries.direction }).from(agronexWalletEntries).where(eq(agronexWalletEntries.userId, payout.farmerId)),
    db.select({ amount: agronexPayoutRequests.amount }).from(agronexPayoutRequests).where(and(eq(agronexPayoutRequests.farmerId, payout.farmerId), eq(agronexPayoutRequests.status, "pending"))),
  ]);
  const balance = computeLedgerBalance(entries.map((entry) => ({ amount: Number(entry.amount), direction: entry.direction })));
  const pending = pendingRows.reduce((total, row) => total + Number(row.amount), 0);
  assertPayoutAvailable(balance, 0, pending);
  try {
    const result = await runD1Batch([
      { sql: `UPDATE agronex_payout_requests SET status = 'paid', reviewedBy = ?, reviewedAt = ?, payoutReference = ?, note = ?
        WHERE id = ? AND status = 'pending' AND paymentRequestId IS NULL
          AND EXISTS (SELECT 1 FROM agronex_profiles WHERE userId = farmerId AND role = 'agriculteur')
          AND COALESCE((SELECT SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) FROM agronex_wallet_entries WHERE userId = farmerId), 0)
            - COALESCE((SELECT SUM(amount) FROM agronex_payout_requests WHERE farmerId = agronex_payout_requests.farmerId AND status = 'pending' AND id <> agronex_payout_requests.id), 0) >= amount`,
        values: [actorId, now, reference, input.note || null, payout.id] },
      { sql: `INSERT INTO agronex_wallet_entries (id, accountType, userId, entryType, direction, amount, paymentRequestId, payoutRequestId, createdAt)
        SELECT ?, 'farmer', ?, 'payout', 'debit', ?, NULL, ?, ? WHERE changes() = 1`,
        values: [crypto.randomUUID(), payout.farmerId, Number(payout.amount), payout.id, now] },
    ]);
    if ((result[0]?.meta.changes ?? 0) !== 1) throw new Error("Le solde disponible a changé ou cette demande vient d’être traitée.");
    return { status: "paid" as const, amount: Number(payout.amount), reference };
  } catch (error) {
    if (isD1UniqueConstraintError(error)) throw new Error("Cette référence de versement a déjà été utilisée pour cet opérateur.");
    throw error;
  }
}
