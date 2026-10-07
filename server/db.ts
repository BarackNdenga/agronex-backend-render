import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AgronexMessage,
  AgronexOrder,
  AgronexPost,
  agronexAdminInvitations,
  InsertUser,
  agronexMessages,
  agronexOrders,
  agronexPosts,
  agronexProfiles,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { ADMIN_INVITATION_TTL_MS, AGRONEX_ADMIN_LIMIT, AdminInvitationError, assertAdminInvitationClaim, assertAdminSeatAvailable, createAdminInvitationToken, hashAdminInvitationToken, normalizeInvitationEmail } from "./admin-invitations";
import { randomUUID } from "node:crypto";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

function requireDb() {
  return getDb().then((db) => {
    if (!db) throw new Error("La base de données AGRONEX est momentanément indisponible.");
    return db;
  });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  const normalizedEmail = typeof user.email === "string" ? normalizeInvitationEmail(user.email) : "";
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId || (normalizedEmail && ENV.adminEmails.has(normalizedEmail))) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export async function getAgronexProfile(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function saveAgronexProfile(userId: number, input: { name: string; phone: string; location: string; role: "agriculteur" | "acheteur" | "transporteur" | "investisseur" }) {
  const db = await requireDb();
  const now = Date.now();
  await db.insert(agronexProfiles).values({ userId, ...input, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { ...input, updatedAt: now } });
  return getAgronexProfile(userId);
}

async function profileOrThrow(userId: number) {
  const profile = await getAgronexProfile(userId);
  if (!profile) throw new Error("Terminez d’abord la création de votre profil AGRONEX.");
  return profile;
}

export async function listAgronexPosts(): Promise<AgronexPost[]> {
  const db = await requireDb();
  return db.select().from(agronexPosts).where(eq(agronexPosts.status, "disponible")).orderBy(desc(agronexPosts.createdAt)).limit(100);
}

export async function listMyAgronexPosts(userId: number): Promise<AgronexPost[]> {
  const db = await requireDb();
  return db.select().from(agronexPosts).where(eq(agronexPosts.farmerId, userId)).orderBy(desc(agronexPosts.createdAt)).limit(100);
}

export async function createAgronexPost(userId: number, input: { title: string; qty: number; unit: string; price: number; location: string; photoUrl: string | null }) {
  const db = await requireDb();
  const profile = await profileOrThrow(userId);
  if (profile.role !== "agriculteur") throw new Error("Seuls les agriculteurs peuvent publier des produits.");
  const row: AgronexPost = { id: crypto.randomUUID(), farmerId: userId, farmerName: profile.name, ...input, status: "disponible", createdAt: Date.now() };
  await db.insert(agronexPosts).values(row);
  return row;
}

export async function createAgronexOrder(userId: number, input: { postId: string; qty: number }) {
  void userId; void input;
  throw new Error("La commande directe est fermée : utilise une demande de paiement Mobile Money, qui sera vérifiée par un administrateur.");
}

export async function listMyAgronexOrders(userId: number, type: "buyer" | "transporter" | "open") {
  const db = await requireDb();
  await profileOrThrow(userId);
  if (type === "buyer") return db.select().from(agronexOrders).where(eq(agronexOrders.buyerId, userId)).orderBy(desc(agronexOrders.createdAt)).limit(100);
  if (type === "transporter") return db.select().from(agronexOrders).where(and(eq(agronexOrders.transporterId, userId), eq(agronexOrders.paymentStatus, "approved"))).orderBy(desc(agronexOrders.createdAt)).limit(100);
  return db.select().from(agronexOrders).where(and(eq(agronexOrders.status, "a_transporter"), eq(agronexOrders.paymentStatus, "approved"))).orderBy(desc(agronexOrders.createdAt)).limit(100);
}

export async function claimAgronexOrder(userId: number, orderId: string) {
  const db = await requireDb();
  const profile = await profileOrThrow(userId);
  if (profile.role !== "transporteur") throw new Error("Seuls les transporteurs peuvent accepter une mission.");
  const result = await db.update(agronexOrders).set({ status: "en_transport", transporterId: userId, transporterName: profile.name })
    .where(and(eq(agronexOrders.id, orderId), eq(agronexOrders.status, "a_transporter"), eq(agronexOrders.paymentStatus, "approved")));
  if (!result[0].affectedRows) throw new Error("Cette mission a déjà été prise ou n’existe plus.");
}

export async function deliverAgronexOrder(userId: number, orderId: string) {
  const db = await requireDb();
  await profileOrThrow(userId);
  const result = await db.update(agronexOrders).set({ status: "livree" })
    .where(and(eq(agronexOrders.id, orderId), eq(agronexOrders.transporterId, userId), eq(agronexOrders.status, "en_transport")));
  if (!result[0].affectedRows) throw new Error("Cette mission ne vous est pas attribuée ou est déjà terminée.");
}

export async function listMyAgronexMessages(userId: number): Promise<AgronexMessage[]> {
  const db = await requireDb();
  const profile = await profileOrThrow(userId);
  const rows = profile.role === "investisseur"
    ? await db.select().from(agronexMessages).where(eq(agronexMessages.fromId, userId)).orderBy(desc(agronexMessages.createdAt)).limit(100)
    : await db.select().from(agronexMessages).where(eq(agronexMessages.toId, userId)).orderBy(desc(agronexMessages.createdAt)).limit(100);
  return rows;
}

export async function sendAgronexMessage(userId: number, input: { farmerId: number; text: string }) {
  const db = await requireDb();
  const sender = await profileOrThrow(userId);
  const farmer = await getAgronexProfile(input.farmerId);
  if (sender.role !== "investisseur" || !farmer || farmer.role !== "agriculteur") throw new Error("Seuls les investisseurs peuvent écrire à un agriculteur.");
  const row: AgronexMessage = { id: crypto.randomUUID(), fromId: userId, fromName: sender.name, toId: farmer.userId, toName: farmer.name, text: input.text, createdAt: Date.now() };
  await db.insert(agronexMessages).values(row);
  return row;
}

export async function getAgronexAdminOverview() {
  const db = await requireDb();
  const [userCount, profileCount, postCount, orderCount, messageCount, adminUsers, recentOrders] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(agronexProfiles),
    db.select({ count: sql<number>`count(*)` }).from(agronexPosts),
    db.select({ count: sql<number>`count(*)` }).from(agronexOrders),
    db.select({ count: sql<number>`count(*)` }).from(agronexMessages),
    db.select({ id: users.id, name: users.name, email: users.email, lastSignedIn: users.lastSignedIn })
      .from(users).where(eq(users.role, "admin")).orderBy(asc(users.createdAt)).limit(4),
    db.select({ id: agronexOrders.id, postTitle: agronexOrders.postTitle, buyerName: agronexOrders.buyerName, status: agronexOrders.status, createdAt: agronexOrders.createdAt })
      .from(agronexOrders).orderBy(desc(agronexOrders.createdAt)).limit(8),
  ]);
  return {
    counts: {
      users: Number(userCount[0]?.count ?? 0), profiles: Number(profileCount[0]?.count ?? 0),
      posts: Number(postCount[0]?.count ?? 0), orders: Number(orderCount[0]?.count ?? 0),
      messages: Number(messageCount[0]?.count ?? 0), admins: adminUsers.length,
    },
    admins: adminUsers,
    recentOrders,
  };
}

type AdminDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type AdminTxCallback = Parameters<AdminDb["transaction"]>[0];
type AdminTx = Parameters<AdminTxCallback>[0];

function assertInvitationOwner(actorOpenId: string) {
  if (!ENV.ownerOpenId || actorOpenId !== ENV.ownerOpenId) {
    throw new AdminInvitationError("FORBIDDEN", "Seul le propriétaire AGRONEX peut gérer les invitations administrateur.");
  }
}

async function lockAdminOwner(tx: AdminTx) {
  if (!ENV.ownerOpenId) throw new AdminInvitationError("FORBIDDEN", "Le propriétaire AGRONEX n’est pas configuré.");
  const owner = await tx.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).for("update");
  if (!owner.length) throw new AdminInvitationError("NOT_FOUND", "Le compte propriétaire AGRONEX est introuvable.");
}

const activeInvitationCondition = (now: number) => and(
  isNull(agronexAdminInvitations.redeemedAt),
  isNull(agronexAdminInvitations.revokedAt),
  gt(agronexAdminInvitations.expiresAt, now),
);

export async function listAgronexAdminInvitations(actorOpenId: string) {
  assertInvitationOwner(actorOpenId);
  const db = await requireDb();
  return db.select({ id: agronexAdminInvitations.id, email: agronexAdminInvitations.email, createdAt: agronexAdminInvitations.createdAt, expiresAt: agronexAdminInvitations.expiresAt })
    .from(agronexAdminInvitations).where(activeInvitationCondition(Date.now())).orderBy(asc(agronexAdminInvitations.expiresAt)).limit(4);
}

export async function createAgronexAdminInvitation(actorOpenId: string, rawEmail: string) {
  assertInvitationOwner(actorOpenId);
  const email = normalizeInvitationEmail(rawEmail);
  const db = await requireDb();
  const now = Date.now();
  const expiresAt = now + ADMIN_INVITATION_TTL_MS;
  const { token, tokenHash } = createAdminInvitationToken();

  return db.transaction(async (tx) => {
    await lockAdminOwner(tx);
    const existingUsers = await tx.select({ role: users.role }).from(users).where(eq(users.email, email)).limit(1);
    if (existingUsers[0]?.role === "admin") throw new AdminInvitationError("CONFLICT", "Cette adresse appartient déjà à un administrateur.");

    const replaceable = await tx.select({ id: agronexAdminInvitations.id }).from(agronexAdminInvitations)
      .where(and(eq(agronexAdminInvitations.email, email), activeInvitationCondition(now))).for("update");
    if (replaceable.length) {
      await tx.update(agronexAdminInvitations).set({ revokedAt: now }).where(and(eq(agronexAdminInvitations.email, email), activeInvitationCondition(now)));
    }

    const [adminCountRow] = await tx.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin"));
    const [inviteCountRow] = await tx.select({ count: sql<number>`count(*)` }).from(agronexAdminInvitations).where(activeInvitationCondition(now));
    const admins = Number(adminCountRow?.count ?? 0);
    const reservations = Number(inviteCountRow?.count ?? 0);
    const seats = admins + reservations;
    assertAdminSeatAvailable(admins, reservations);

    const invitation = { id: randomUUID(), email, tokenHash, createdBy: (await tx.select({ id: users.id }).from(users).where(eq(users.openId, actorOpenId)).limit(1))[0]?.id, createdAt: now, expiresAt };
    if (!invitation.createdBy) throw new AdminInvitationError("NOT_FOUND", "Le compte propriétaire AGRONEX est introuvable.");
    await tx.insert(agronexAdminInvitations).values(invitation);
    return { id: invitation.id, email, token, createdAt: now, expiresAt, seatsUsed: seats + 1 };
  });
}

export async function listActiveAgronexAdminInvitations() {
  const db = await requireDb();
  return db.select({ id: agronexAdminInvitations.id, email: agronexAdminInvitations.email, expiresAt: agronexAdminInvitations.expiresAt })
    .from(agronexAdminInvitations).where(activeInvitationCondition(Date.now())).limit(4);
}

export async function getAgronexAdminInvitationInfo(token: string) {
  const db = await requireDb();
  const tokenHash = hashAdminInvitationToken(token);
  const [invite] = await db.select({ email: agronexAdminInvitations.email, expiresAt: agronexAdminInvitations.expiresAt, redeemedAt: agronexAdminInvitations.redeemedAt, revokedAt: agronexAdminInvitations.revokedAt })
    .from(agronexAdminInvitations).where(eq(agronexAdminInvitations.tokenHash, tokenHash)).limit(1);
  if (!invite) throw new AdminInvitationError("NOT_FOUND", "Cette invitation administrateur est invalide.");
  let status: "valid" | "expired" | "revoked" | "used" = "valid";
  if (invite.redeemedAt) status = "used";
  else if (invite.revokedAt) status = "revoked";
  else if (invite.expiresAt <= Date.now()) status = "expired";
  return { email: invite.email, expiresAt: invite.expiresAt, status };
}

export async function redeemAgronexAdminInvitation(token: string, userId: number, rawEmail: string | null) {
  const email = rawEmail ? normalizeInvitationEmail(rawEmail) : "";
  if (!email) throw new AdminInvitationError("FORBIDDEN", "Votre compte AGRONEX doit contenir l’adresse e-mail à laquelle cette invitation a été envoyée.");
  const tokenHash = hashAdminInvitationToken(token);
  const db = await requireDb();
  const now = Date.now();

  return db.transaction(async (tx) => {
    await lockAdminOwner(tx);
    const [invite] = await tx.select().from(agronexAdminInvitations).where(eq(agronexAdminInvitations.tokenHash, tokenHash)).for("update");
    if (!invite) throw new AdminInvitationError("NOT_FOUND", "Cette invitation administrateur est invalide.");
    const [current] = await tx.select({ role: users.role, openId: users.openId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!current) throw new AdminInvitationError("NOT_FOUND", "Votre compte AGRONEX est introuvable.");
    const [adminCountRow] = await tx.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin"));
    assertAdminInvitationClaim({ invitation: invite, accountEmail: email, accountRole: current.role, currentAdminCount: Number(adminCountRow?.count ?? 0), now });

    await tx.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    await tx.update(agronexAdminInvitations).set({ redeemedAt: now, redeemedBy: userId }).where(eq(agronexAdminInvitations.id, invite.id));
    return { success: true as const, expiresAt: invite.expiresAt };
  });
}

export async function revokeAgronexAdminInvitation(actorOpenId: string, invitationId: string) {
  assertInvitationOwner(actorOpenId);
  const db = await requireDb();
  const now = Date.now();
  return db.transaction(async (tx) => {
    await lockAdminOwner(tx);
    const [invite] = await tx.select({ id: agronexAdminInvitations.id, revokedAt: agronexAdminInvitations.revokedAt, redeemedAt: agronexAdminInvitations.redeemedAt })
      .from(agronexAdminInvitations).where(eq(agronexAdminInvitations.id, invitationId)).for("update");
    if (!invite || invite.redeemedAt || invite.revokedAt) throw new AdminInvitationError("NOT_FOUND", "Cette invitation n’est plus active.");
    await tx.update(agronexAdminInvitations).set({ revokedAt: now }).where(eq(agronexAdminInvitations.id, invitationId));
    return { success: true as const };
  });
}

export async function revokeAgronexAdmin(actorOpenId: string, targetId: number) {
  if (!ENV.ownerOpenId || actorOpenId !== ENV.ownerOpenId) throw new Error("Seul le propriétaire du projet peut gérer les administrateurs.");
  const db = await requireDb();
  return db.transaction(async (tx) => {
    await lockAdminOwner(tx);
    const [target] = await tx.select({ id: users.id, openId: users.openId, role: users.role }).from(users).where(eq(users.id, targetId)).limit(1);
    if (!target || target.role !== "admin") throw new Error("Ce compte n’est pas administrateur.");
    if (target.openId === ENV.ownerOpenId) throw new Error("Le compte propriétaire ne peut pas être retiré.");
    await tx.update(users).set({ role: "user" }).where(eq(users.id, targetId));
    return { id: targetId, revoked: true };
  });
}
