/// <reference types="@cloudflare/workers-types" />
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getRuntimeBinding } from "./_core/runtime-bindings";
import { runD1Batch } from "./_core/d1";
import * as d1Schema from "../drizzle/schema.d1";
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
} from "../drizzle/schema.d1";
import { ENV } from "./_core/env";
import { ADMIN_INVITATION_TTL_MS, AGRONEX_ADMIN_LIMIT, AdminInvitationError, assertAdminInvitationClaim, assertAdminSeatAvailable, createAdminInvitationToken, hashAdminInvitationToken, normalizeInvitationEmail } from "./admin-invitations";
import { randomUUID } from "node:crypto";

export async function getDb() {
  const binding = getRuntimeBinding<D1Database>("DB");
  return binding ? drizzle(binding, { schema: d1Schema }) : null;
}

function requireDb() {
  return getDb().then((db) => {
    if (!db) throw new Error("La base de données AGRONEX est momentanément indisponible.");
    return db;
  });
}

export async function upsertUser(user: InsertUser, options: { authenticatedRole?: "user" | "admin" } = {}): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Partial<InsertUser> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (options.authenticatedRole !== undefined) {
    values.role = options.authenticatedRole;
    updateSet.role = options.authenticatedRole;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
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
    .onConflictDoUpdate({ target: agronexProfiles.userId, set: { ...input, updatedAt: now } });
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
    .where(and(eq(agronexOrders.id, orderId), eq(agronexOrders.status, "a_transporter"), eq(agronexOrders.paymentStatus, "approved")))
    .returning({ id: agronexOrders.id });
  if (!result.length) throw new Error("Cette mission a déjà été prise ou n’existe plus.");
}

export async function deliverAgronexOrder(userId: number, orderId: string) {
  const db = await requireDb();
  await profileOrThrow(userId);
  const result = await db.update(agronexOrders).set({ status: "livree" })
    .where(and(eq(agronexOrders.id, orderId), eq(agronexOrders.transporterId, userId), eq(agronexOrders.status, "en_transport")))
    .returning({ id: agronexOrders.id });
  if (!result.length) throw new Error("Cette mission ne vous est pas attribuée ou est déjà terminée.");
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

function assertInvitationOwner(actorOpenId: string) {
  if (!ENV.ownerOpenId || actorOpenId !== ENV.ownerOpenId) {
    throw new AdminInvitationError("FORBIDDEN", "Seul le propriétaire AGRONEX peut gérer les invitations administrateur.");
  }
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
  const invitationId = randomUUID();

  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.openId, actorOpenId)).limit(1);
  if (!owner) throw new AdminInvitationError("NOT_FOUND", "Le compte propriétaire AGRONEX est introuvable.");
  const [existingAdmin] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), eq(users.role, "admin"))).limit(1);
  if (existingAdmin) throw new AdminInvitationError("CONFLICT", "Cette adresse appartient déjà à un administrateur.");

  const result = await runD1Batch([
    { sql: 'UPDATE agronex_admin_invitations SET revokedAt = ? WHERE email = ? AND redeemedAt IS NULL AND revokedAt IS NULL AND expiresAt > ?', values: [now, email, now] },
    { sql: `INSERT INTO agronex_admin_invitations (id, email, tokenHash, createdBy, createdAt, expiresAt)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
        AND NOT EXISTS (SELECT 1 FROM users WHERE email = ? AND role = 'admin')
        AND ((SELECT COUNT(*) FROM users WHERE role = 'admin') +
             (SELECT COUNT(*) FROM agronex_admin_invitations WHERE redeemedAt IS NULL AND revokedAt IS NULL AND expiresAt > ?)) < ?`,
      values: [invitationId, email, tokenHash, owner.id, now, expiresAt, owner.id, email, now, AGRONEX_ADMIN_LIMIT] },
  ]);
  if ((result[1]?.meta.changes ?? 0) !== 1) {
    const [adminCountRow] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin"));
    const [inviteCountRow] = await db.select({ count: sql<number>`count(*)` }).from(agronexAdminInvitations).where(activeInvitationCondition(now));
    assertAdminSeatAvailable(Number(adminCountRow?.count ?? 0), Number(inviteCountRow?.count ?? 0));
    throw new AdminInvitationError("CONFLICT", "Cette adresse appartient déjà à un administrateur ou une invitation concurrente vient d’être créée.");
  }
  const [adminCountRow] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin"));
  const [inviteCountRow] = await db.select({ count: sql<number>`count(*)` }).from(agronexAdminInvitations).where(activeInvitationCondition(now));
  return { id: invitationId, email, token, createdAt: now, expiresAt, seatsUsed: Number(adminCountRow?.count ?? 0) + Number(inviteCountRow?.count ?? 0) };
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
  if (!ENV.ownerOpenId) throw new AdminInvitationError("FORBIDDEN", "Le propriétaire AGRONEX n’est pas configuré.");
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
  if (!owner) throw new AdminInvitationError("NOT_FOUND", "Le compte propriétaire AGRONEX est introuvable.");
  const [invite] = await db.select().from(agronexAdminInvitations).where(eq(agronexAdminInvitations.tokenHash, tokenHash)).limit(1);
  if (!invite) throw new AdminInvitationError("NOT_FOUND", "Cette invitation administrateur est invalide.");
  const [current] = await db.select({ role: users.role, openId: users.openId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!current) throw new AdminInvitationError("NOT_FOUND", "Votre compte AGRONEX est introuvable.");
  const [adminCountRow] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin"));
  assertAdminInvitationClaim({ invitation: invite, accountEmail: email, accountRole: current.role, currentAdminCount: Number(adminCountRow?.count ?? 0), now });

  const result = await runD1Batch([
    { sql: `UPDATE users SET role = 'admin' WHERE id = ? AND role = 'user' AND lower(email) = ?
      AND EXISTS (SELECT 1 FROM agronex_admin_invitations WHERE tokenHash = ? AND lower(email) = ? AND redeemedAt IS NULL AND revokedAt IS NULL AND expiresAt > ?)`,
      values: [userId, email, tokenHash, email, now] },
    { sql: `UPDATE agronex_admin_invitations SET redeemedAt = ?, redeemedBy = ?
      WHERE tokenHash = ? AND lower(email) = ? AND redeemedAt IS NULL AND revokedAt IS NULL AND expiresAt > ?
        AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin' AND lower(email) = ?)`,
      values: [now, userId, tokenHash, email, now, userId, email] },
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1 || (result[1]?.meta.changes ?? 0) !== 1) {
    throw new AdminInvitationError("CONFLICT", "Cette invitation vient d’être utilisée ou n’est plus valide.");
  }
  return { success: true as const, expiresAt: invite.expiresAt };
}

export async function revokeAgronexAdminInvitation(actorOpenId: string, invitationId: string) {
  assertInvitationOwner(actorOpenId);
  const db = await requireDb();
  const now = Date.now();
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.openId, actorOpenId)).limit(1);
  if (!owner) throw new AdminInvitationError("NOT_FOUND", "Le compte propriétaire AGRONEX est introuvable.");
  const result = await db.update(agronexAdminInvitations).set({ revokedAt: now })
    .where(and(eq(agronexAdminInvitations.id, invitationId), isNull(agronexAdminInvitations.redeemedAt), isNull(agronexAdminInvitations.revokedAt)))
    .returning({ id: agronexAdminInvitations.id });
  if (!result.length) throw new AdminInvitationError("NOT_FOUND", "Cette invitation n’est plus active.");
  return { success: true as const };
}

export async function revokeAgronexAdmin(actorOpenId: string, targetId: number) {
  if (!ENV.ownerOpenId || actorOpenId !== ENV.ownerOpenId) throw new Error("Seul le propriétaire du projet peut gérer les administrateurs.");
  const db = await requireDb();
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
  if (!owner) throw new AdminInvitationError("NOT_FOUND", "Le compte propriétaire AGRONEX est introuvable.");
  const [target] = await db.select({ id: users.id, openId: users.openId, role: users.role }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target || target.role !== "admin") throw new Error("Ce compte n’est pas administrateur.");
  if (target.openId === ENV.ownerOpenId) throw new Error("Le compte propriétaire ne peut pas être retiré.");
  const result = await db.update(users).set({ role: "user" }).where(and(eq(users.id, targetId), eq(users.role, "admin"), sql`${users.openId} <> ${ENV.ownerOpenId}`)).returning({ id: users.id });
  if (!result.length) throw new Error("Ce compte n’est plus administrateur.");
  return { id: targetId, revoked: true };
}
