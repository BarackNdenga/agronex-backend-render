import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import {
  agronexConnectionRequests,
  agronexFollows,
  agronexPostComments,
  agronexPostLikes,
  agronexSavedPosts,
  agronexSocialNotifications,
  agronexSocialPosts,
  agronexSocialSettings,
  agronexProfiles,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

const requireDb = async () => {
  const db = await getDb();
  if (!db) throw new Error("La base AGRONEX est momentanément indisponible.");
  return db;
};

async function requireProfile(userId: number) {
  const db = await requireDb();
  const [profile] = await db.select().from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
  if (!profile) throw new Error("Créez d’abord votre profil AGRONEX pour utiliser le réseau.");
  return { db, profile };
}

async function connected(db: Awaited<ReturnType<typeof requireDb>>, a: number, b: number) {
  if (a === b) return true;
  const [row] = await db.select({ id: agronexConnectionRequests.id }).from(agronexConnectionRequests)
    .where(and(eq(agronexConnectionRequests.status, "accepted"), or(
      and(eq(agronexConnectionRequests.senderId, a), eq(agronexConnectionRequests.recipientId, b)),
      and(eq(agronexConnectionRequests.senderId, b), eq(agronexConnectionRequests.recipientId, a)),
    ))).limit(1);
  return Boolean(row);
}

async function canSeeProfile(db: Awaited<ReturnType<typeof requireDb>>, viewerId: number, ownerId: number) {
  if (viewerId === ownerId) return true;
  const [settings] = await db.select().from(agronexSocialSettings).where(eq(agronexSocialSettings.userId, ownerId)).limit(1);
  return !settings?.privateProfile || connected(db, viewerId, ownerId);
}

async function canSeePost(db: Awaited<ReturnType<typeof requireDb>>, viewerId: number, post: { authorId: number; visibility: "public" | "connections" }) {
  if (post.authorId === viewerId) return true;
  if (post.visibility === "connections" && !(await connected(db, viewerId, post.authorId))) return false;
  return canSeeProfile(db, viewerId, post.authorId);
}

async function addNotification(db: Awaited<ReturnType<typeof requireDb>>, recipientId: number, actorId: number, kind: "follow" | "connection" | "connection_accepted" | "like" | "comment" | "repost", message: string, postId: string | null = null) {
  if (recipientId === actorId) return;
  await db.insert(agronexSocialNotifications).values({ id: crypto.randomUUID(), recipientId, actorId, postId, kind, message, readAt: null, createdAt: Date.now() });
}

export async function getSocialFeed(userId: number, mode: "for-you" | "following" | "connections") {
  const { db } = await requireProfile(userId);
  const follows = mode === "following"
    ? await db.select({ id: agronexFollows.followingId }).from(agronexFollows).where(eq(agronexFollows.followerId, userId)).limit(1000)
    : [];
  const followIds = follows.map((row) => row.id);
  if (mode === "following" && !followIds.length) return [];
  const rows = await db.select({
    id: agronexSocialPosts.id, authorId: agronexSocialPosts.authorId, body: agronexSocialPosts.body,
    mediaUrl: agronexSocialPosts.mediaUrl, sourcePostId: agronexSocialPosts.sourcePostId,
    kind: agronexSocialPosts.kind, visibility: agronexSocialPosts.visibility, createdAt: agronexSocialPosts.createdAt,
    authorName: agronexProfiles.name, authorAvatar: agronexProfiles.avatarUrl, authorLocation: agronexProfiles.location,
    authorRole: agronexProfiles.role,
  }).from(agronexSocialPosts).innerJoin(agronexProfiles, eq(agronexSocialPosts.authorId, agronexProfiles.userId))
    .where(mode === "following" ? inArray(agronexSocialPosts.authorId, followIds) : undefined)
    .orderBy(desc(agronexSocialPosts.createdAt)).limit(60);
  if (!rows.length) return [];
  const postIds = rows.map((row) => row.id);
  const sourceIds = Array.from(new Set(rows.flatMap((row) => row.sourcePostId ? [row.sourcePostId] : [])));
  const sourceRows = sourceIds.length ? await db.select({
    id: agronexSocialPosts.id, authorId: agronexSocialPosts.authorId, body: agronexSocialPosts.body,
    mediaUrl: agronexSocialPosts.mediaUrl, visibility: agronexSocialPosts.visibility, createdAt: agronexSocialPosts.createdAt,
    authorName: agronexProfiles.name, authorAvatar: agronexProfiles.avatarUrl,
  }).from(agronexSocialPosts).innerJoin(agronexProfiles, eq(agronexSocialPosts.authorId, agronexProfiles.userId))
    .where(inArray(agronexSocialPosts.id, sourceIds)) : [];
  const sourceMap = new Map<string, (typeof sourceRows)[number]>();
  for (const source of sourceRows) if (await canSeePost(db, userId, source)) sourceMap.set(source.id, source);
  const [likes, comments, myLikes, mySaves, followSet, requestRows] = await Promise.all([
    db.select({ postId: agronexPostLikes.postId, count: sql<number>`count(*)` }).from(agronexPostLikes).where(inArray(agronexPostLikes.postId, postIds)).groupBy(agronexPostLikes.postId),
    db.select({ postId: agronexPostComments.postId, count: sql<number>`count(*)` }).from(agronexPostComments).where(inArray(agronexPostComments.postId, postIds)).groupBy(agronexPostComments.postId),
    db.select({ postId: agronexPostLikes.postId }).from(agronexPostLikes).where(and(eq(agronexPostLikes.userId, userId), inArray(agronexPostLikes.postId, postIds))),
    db.select({ postId: agronexSavedPosts.postId }).from(agronexSavedPosts).where(and(eq(agronexSavedPosts.userId, userId), inArray(agronexSavedPosts.postId, postIds))),
    db.select({ followingId: agronexFollows.followingId }).from(agronexFollows).where(eq(agronexFollows.followerId, userId)),
    db.select({ id: agronexConnectionRequests.id, senderId: agronexConnectionRequests.senderId, recipientId: agronexConnectionRequests.recipientId, status: agronexConnectionRequests.status })
      .from(agronexConnectionRequests).where(or(eq(agronexConnectionRequests.senderId, userId), eq(agronexConnectionRequests.recipientId, userId))).limit(2000),
  ]);
  const likeCounts = new Map(likes.map((x) => [x.postId, Number(x.count)]));
  const commentCounts = new Map(comments.map((x) => [x.postId, Number(x.count)]));
  const liked = new Set(myLikes.map((x) => x.postId));
  const saved = new Set(mySaves.map((x) => x.postId));
  const following = new Set(followSet.map((x) => x.followingId));
  const areConnections = (otherId: number) => requestRows.some((x) => x.status === "accepted" && ((x.senderId === userId && x.recipientId === otherId) || (x.senderId === otherId && x.recipientId === userId)));
  const requestByOther = (otherId: number) => requestRows.find((x) => (x.senderId === userId && x.recipientId === otherId) || (x.senderId === otherId && x.recipientId === userId));
  const visible = [];
  for (const post of rows) {
    if (mode === "connections" && !areConnections(post.authorId) && post.authorId !== userId) continue;
    if (!(await canSeePost(db, userId, post))) continue;
    const request = requestByOther(post.authorId);
    visible.push({
      ...post, likeCount: likeCounts.get(post.id) ?? 0, commentCount: commentCounts.get(post.id) ?? 0,
      liked: liked.has(post.id), saved: saved.has(post.id), following: following.has(post.authorId),
      sourcePost: post.sourcePostId ? sourceMap.get(post.sourcePostId) ?? null : null,
      connected: areConnections(post.authorId), requestStatus: request?.status ?? null,
      requestDirection: request ? (request.senderId === userId ? "outgoing" : "incoming") : null, requestId: request?.id ?? null,
    });
  }
  return visible;
}

export async function getSocialPost(userId: number, postId: string) {
  const { db } = await requireProfile(userId);
  const [post] = await db.select({
    id: agronexSocialPosts.id, authorId: agronexSocialPosts.authorId, body: agronexSocialPosts.body,
    mediaUrl: agronexSocialPosts.mediaUrl, sourcePostId: agronexSocialPosts.sourcePostId,
    kind: agronexSocialPosts.kind, visibility: agronexSocialPosts.visibility, createdAt: agronexSocialPosts.createdAt,
    authorName: agronexProfiles.name, authorAvatar: agronexProfiles.avatarUrl, authorLocation: agronexProfiles.location, authorRole: agronexProfiles.role,
  }).from(agronexSocialPosts).innerJoin(agronexProfiles, eq(agronexSocialPosts.authorId, agronexProfiles.userId)).where(eq(agronexSocialPosts.id, postId)).limit(1);
  if (!post || !(await canSeePost(db, userId, post))) return null;
  const [likes, comments, liked, saved, follow, relationship] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(agronexPostLikes).where(eq(agronexPostLikes.postId, postId)),
    db.select({ count: sql<number>`count(*)` }).from(agronexPostComments).where(eq(agronexPostComments.postId, postId)),
    db.select().from(agronexPostLikes).where(and(eq(agronexPostLikes.postId, postId), eq(agronexPostLikes.userId, userId))).limit(1),
    db.select().from(agronexSavedPosts).where(and(eq(agronexSavedPosts.postId, postId), eq(agronexSavedPosts.userId, userId))).limit(1),
    db.select().from(agronexFollows).where(and(eq(agronexFollows.followerId, userId), eq(agronexFollows.followingId, post.authorId))).limit(1),
    db.select().from(agronexConnectionRequests).where(or(
      and(eq(agronexConnectionRequests.senderId, userId), eq(agronexConnectionRequests.recipientId, post.authorId)),
      and(eq(agronexConnectionRequests.senderId, post.authorId), eq(agronexConnectionRequests.recipientId, userId)),
    )).orderBy(desc(agronexConnectionRequests.updatedAt)).limit(1),
  ]);
  let sourcePost = null;
  if (post.sourcePostId) {
    const [source] = await db.select({ id: agronexSocialPosts.id, authorId: agronexSocialPosts.authorId, body: agronexSocialPosts.body, mediaUrl: agronexSocialPosts.mediaUrl, visibility: agronexSocialPosts.visibility, createdAt: agronexSocialPosts.createdAt, authorName: agronexProfiles.name, authorAvatar: agronexProfiles.avatarUrl })
      .from(agronexSocialPosts).innerJoin(agronexProfiles, eq(agronexSocialPosts.authorId, agronexProfiles.userId)).where(eq(agronexSocialPosts.id, post.sourcePostId)).limit(1);
    if (source && await canSeePost(db, userId, source)) sourcePost = source;
  }
  const request = relationship[0];
  return {
    ...post, likeCount: Number(likes[0]?.count ?? 0), commentCount: Number(comments[0]?.count ?? 0),
    liked: Boolean(liked[0]), saved: Boolean(saved[0]), following: Boolean(follow[0]),
    connected: request?.status === "accepted", requestStatus: request?.status ?? null,
    requestDirection: request ? (request.senderId === userId ? "outgoing" : "incoming") : null,
    requestId: request?.id ?? null, sourcePost,
  };
}

export async function createSocialPost(userId: number, input: { body: string; mediaUrl: string | null; visibility: "public" | "connections" }) {
  const { db } = await requireProfile(userId);
  const body = input.body.trim();
  if (!body && !input.mediaUrl) throw new Error("Ajoutez un texte ou une photo à votre publication.");
  if (input.mediaUrl && !input.mediaUrl.startsWith(`/manus-storage/agronex/${userId}/social/`)) throw new Error("La photo doit provenir de votre espace de stockage social AGRONEX.");
  const row = { id: crypto.randomUUID(), authorId: userId, body, mediaUrl: input.mediaUrl, sourcePostId: null, kind: "post" as const, visibility: input.visibility, createdAt: Date.now() };
  await db.insert(agronexSocialPosts).values(row);
  return row;
}

export async function findSocialPeople(viewerId: number, query: string) {
  const { db } = await requireProfile(viewerId);
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const rows = await db.select({ userId: agronexProfiles.userId, name: agronexProfiles.name, avatarUrl: agronexProfiles.avatarUrl, bio: agronexProfiles.bio, location: agronexProfiles.location, role: agronexProfiles.role })
    .from(agronexProfiles).where(and(ne(agronexProfiles.userId, viewerId), or(like(agronexProfiles.name, `%${q}%`), like(agronexProfiles.location, `%${q}%`), like(agronexProfiles.role, `%${q}%`))))
    .orderBy(asc(agronexProfiles.name)).limit(40);
  const visible = [];
  for (const person of rows) if (await canSeeProfile(db, viewerId, person.userId)) visible.push(person);
  return visible;
}

export async function findSocialPosts(viewerId: number, query: string) {
  const { db } = await requireProfile(viewerId);
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.select({
    id: agronexSocialPosts.id, authorId: agronexSocialPosts.authorId, body: agronexSocialPosts.body,
    mediaUrl: agronexSocialPosts.mediaUrl, sourcePostId: agronexSocialPosts.sourcePostId,
    kind: agronexSocialPosts.kind, visibility: agronexSocialPosts.visibility, createdAt: agronexSocialPosts.createdAt,
    authorName: agronexProfiles.name, authorAvatar: agronexProfiles.avatarUrl,
    authorLocation: agronexProfiles.location, authorRole: agronexProfiles.role,
  }).from(agronexSocialPosts).innerJoin(agronexProfiles, eq(agronexSocialPosts.authorId, agronexProfiles.userId))
    .where(or(like(agronexSocialPosts.body, pattern), like(agronexProfiles.name, pattern), like(agronexProfiles.location, pattern), like(agronexProfiles.role, pattern)))
    .orderBy(desc(agronexSocialPosts.createdAt)).limit(100);
  const visible = [];
  for (const post of rows) if (await canSeePost(db, viewerId, post)) visible.push(post);
  return visible.slice(0, 30);
}

export async function getSocialProfile(viewerId: number, targetId: number) {
  const { db } = await requireProfile(viewerId);
  const [profile] = await db.select({ userId: agronexProfiles.userId, name: agronexProfiles.name, avatarUrl: agronexProfiles.avatarUrl, bio: agronexProfiles.bio, location: agronexProfiles.location, role: agronexProfiles.role, createdAt: agronexProfiles.createdAt })
    .from(agronexProfiles).innerJoin(users, eq(agronexProfiles.userId, users.id)).where(eq(agronexProfiles.userId, targetId)).limit(1);
  if (!profile) return null;
  if (!(await canSeeProfile(db, viewerId, targetId))) return { ...profile, isPrivate: true, posts: [], followerCount: 0, followingCount: 0, connected: false, following: false, requestStatus: null, requestDirection: null };
  const [posts, followerRows, followingRows, followRows, relationRows] = await Promise.all([
    db.select().from(agronexSocialPosts).where(eq(agronexSocialPosts.authorId, targetId)).orderBy(desc(agronexSocialPosts.createdAt)).limit(20),
    db.select({ count: sql<number>`count(*)` }).from(agronexFollows).where(eq(agronexFollows.followingId, targetId)),
    db.select({ count: sql<number>`count(*)` }).from(agronexFollows).where(eq(agronexFollows.followerId, targetId)),
    db.select().from(agronexFollows).where(and(eq(agronexFollows.followerId, viewerId), eq(agronexFollows.followingId, targetId))).limit(1),
    db.select().from(agronexConnectionRequests).where(or(
      and(eq(agronexConnectionRequests.senderId, viewerId), eq(agronexConnectionRequests.recipientId, targetId)),
      and(eq(agronexConnectionRequests.senderId, targetId), eq(agronexConnectionRequests.recipientId, viewerId)),
    )).orderBy(desc(agronexConnectionRequests.updatedAt)).limit(1),
  ]);
  const isConnected = relationRows[0]?.status === "accepted";
  const visiblePosts = [];
  for (const post of posts) if (await canSeePost(db, viewerId, post)) visiblePosts.push(post);
  return {
    ...profile, isPrivate: false, posts: visiblePosts,
    followerCount: Number(followerRows[0]?.count ?? 0), followingCount: Number(followingRows[0]?.count ?? 0),
    connected: isConnected, following: Boolean(followRows[0]), requestStatus: relationRows[0]?.status ?? null,
    requestDirection: relationRows[0] ? (relationRows[0].senderId === viewerId ? "outgoing" : "incoming") : null,
  };
}

export async function followSocialUser(userId: number, targetId: number) {
  const { db } = await requireProfile(userId);
  if (userId === targetId) throw new Error("Vous ne pouvez pas vous suivre vous-même.");
  const [target] = await db.select({ userId: agronexProfiles.userId }).from(agronexProfiles).where(eq(agronexProfiles.userId, targetId)).limit(1);
  if (!target) throw new Error("Ce profil n’existe pas.");
  const [existing] = await db.select().from(agronexFollows).where(and(eq(agronexFollows.followerId, userId), eq(agronexFollows.followingId, targetId))).limit(1);
  if (existing) await db.delete(agronexFollows).where(and(eq(agronexFollows.followerId, userId), eq(agronexFollows.followingId, targetId)));
  else {
    await db.insert(agronexFollows).values({ followerId: userId, followingId: targetId, createdAt: Date.now() }).onConflictDoNothing();
    await addNotification(db, targetId, userId, "follow", "a commencé à vous suivre.");
  }
  return { following: !existing };
}

export async function requestSocialConnection(userId: number, targetId: number) {
  const { db } = await requireProfile(userId);
  if (userId === targetId) throw new Error("Vous ne pouvez pas vous inviter vous-même.");
  const [settings] = await db.select().from(agronexSocialSettings).where(eq(agronexSocialSettings.userId, targetId)).limit(1);
  if (settings && !settings.allowConnectionRequests) throw new Error("Ce membre n’accepte pas les demandes de connexion.");
  const [target] = await db.select({ userId: agronexProfiles.userId }).from(agronexProfiles).where(eq(agronexProfiles.userId, targetId)).limit(1);
  if (!target) throw new Error("Ce profil n’existe pas.");
  if (await connected(db, userId, targetId)) return { status: "accepted" as const };
  const [existing] = await db.select().from(agronexConnectionRequests).where(or(
    and(eq(agronexConnectionRequests.senderId, userId), eq(agronexConnectionRequests.recipientId, targetId)),
    and(eq(agronexConnectionRequests.senderId, targetId), eq(agronexConnectionRequests.recipientId, userId)),
  )).orderBy(desc(agronexConnectionRequests.updatedAt)).limit(1);
  if (existing?.status === "pending") return { status: "pending" as const, direction: existing.senderId === userId ? "outgoing" as const : "incoming" as const };
  const now = Date.now();
  if (existing) await db.update(agronexConnectionRequests).set({ senderId: userId, recipientId: targetId, status: "pending", createdAt: now, updatedAt: now }).where(eq(agronexConnectionRequests.id, existing.id));
  else await db.insert(agronexConnectionRequests).values({ id: crypto.randomUUID(), senderId: userId, recipientId: targetId, status: "pending", createdAt: now, updatedAt: now });
  await addNotification(db, targetId, userId, "connection", "vous a envoyé une demande de connexion.");
  return { status: "pending" as const, direction: "outgoing" as const };
}

export async function answerSocialConnection(userId: number, requestId: string, accept: boolean) {
  const { db } = await requireProfile(userId);
  const [request] = await db.select().from(agronexConnectionRequests).where(and(eq(agronexConnectionRequests.id, requestId), eq(agronexConnectionRequests.recipientId, userId), eq(agronexConnectionRequests.status, "pending"))).limit(1);
  if (!request) throw new Error("Cette demande n’est plus disponible.");
  const now = Date.now();
  await db.update(agronexConnectionRequests).set({ status: accept ? "accepted" : "declined", updatedAt: now }).where(eq(agronexConnectionRequests.id, request.id));
  if (accept) await addNotification(db, request.senderId, userId, "connection_accepted", "a accepté votre demande de connexion.");
  return { status: accept ? "accepted" as const : "declined" as const };
}

export async function listSocialConnections(userId: number) {
  const { db } = await requireProfile(userId);
  const rows = await db.select().from(agronexConnectionRequests).where(and(or(eq(agronexConnectionRequests.senderId, userId), eq(agronexConnectionRequests.recipientId, userId)), eq(agronexConnectionRequests.status, "pending"))).orderBy(desc(agronexConnectionRequests.createdAt)).limit(50);
  const incoming = rows.filter((x) => x.recipientId === userId);
  const outgoing = rows.filter((x) => x.senderId === userId);
  const accepted = await db.select().from(agronexConnectionRequests).where(and(or(eq(agronexConnectionRequests.senderId, userId), eq(agronexConnectionRequests.recipientId, userId)), eq(agronexConnectionRequests.status, "accepted"))).orderBy(desc(agronexConnectionRequests.updatedAt)).limit(100);
  const ids = Array.from(new Set([...incoming.map((x) => x.senderId), ...outgoing.map((x) => x.recipientId), ...accepted.map((x) => x.senderId === userId ? x.recipientId : x.senderId)]));
  const profiles = ids.length ? await db.select({ userId: agronexProfiles.userId, name: agronexProfiles.name, avatarUrl: agronexProfiles.avatarUrl, bio: agronexProfiles.bio, location: agronexProfiles.location, role: agronexProfiles.role }).from(agronexProfiles).where(inArray(agronexProfiles.userId, ids)) : [];
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));
  return {
    incoming: incoming.map((r) => ({ id: r.id, createdAt: r.createdAt, profile: profileMap.get(r.senderId) })).filter((x) => x.profile),
    outgoing: outgoing.map((r) => ({ id: r.id, createdAt: r.createdAt, profile: profileMap.get(r.recipientId) })).filter((x) => x.profile),
    accepted: accepted.map((r) => profileMap.get(r.senderId === userId ? r.recipientId : r.senderId)).filter(Boolean),
  };
}

export async function createSocialComment(userId: number, postId: string, body: string) {
  const { db } = await requireProfile(userId);
  const [post] = await db.select().from(agronexSocialPosts).where(eq(agronexSocialPosts.id, postId)).limit(1);
  if (!post || !(await canSeePost(db, userId, post))) throw new Error("Cette publication n’est pas disponible.");
  const text = body.trim();
  if (!text) throw new Error("Le commentaire ne peut pas être vide.");
  const row = { id: crypto.randomUUID(), postId, authorId: userId, body: text, createdAt: Date.now() };
  await db.insert(agronexPostComments).values(row);
  const [profile] = await db.select({ name: agronexProfiles.name }).from(agronexProfiles).where(eq(agronexProfiles.userId, userId)).limit(1);
  await addNotification(db, post.authorId, userId, "comment", `a commenté votre publication : ${text.slice(0, 100)}`, postId);
  return { ...row, authorName: profile?.name ?? "Membre" };
}

export async function listSocialComments(userId: number, postId: string) {
  const { db } = await requireProfile(userId);
  const [post] = await db.select().from(agronexSocialPosts).where(eq(agronexSocialPosts.id, postId)).limit(1);
  if (!post || !(await canSeePost(db, userId, post))) throw new Error("Cette publication n’est pas disponible.");
  return db.select({ id: agronexPostComments.id, postId: agronexPostComments.postId, authorId: agronexPostComments.authorId, body: agronexPostComments.body, createdAt: agronexPostComments.createdAt, authorName: agronexProfiles.name, avatarUrl: agronexProfiles.avatarUrl })
    .from(agronexPostComments).innerJoin(agronexProfiles, eq(agronexPostComments.authorId, agronexProfiles.userId)).where(eq(agronexPostComments.postId, postId)).orderBy(asc(agronexPostComments.createdAt)).limit(100);
}

export async function toggleSocialPost(userId: number, postId: string, action: "like" | "save") {
  const { db } = await requireProfile(userId);
  const [post] = await db.select().from(agronexSocialPosts).where(eq(agronexSocialPosts.id, postId)).limit(1);
  if (!post || !(await canSeePost(db, userId, post))) throw new Error("Cette publication n’est pas disponible.");
  const table = action === "like" ? agronexPostLikes : agronexSavedPosts;
  const [existing] = await db.select().from(table).where(and(eq(table.postId, postId), eq(table.userId, userId))).limit(1);
  if (existing) await db.delete(table).where(and(eq(table.postId, postId), eq(table.userId, userId)));
  else {
    await db.insert(table).values({ postId, userId, createdAt: Date.now() }).onConflictDoNothing();
    if (action === "like") await addNotification(db, post.authorId, userId, "like", "a aimé votre publication.", postId);
  }
  return { active: !existing };
}

export async function repostSocialPost(userId: number, postId: string, quote: string) {
  const { db } = await requireProfile(userId);
  const [post] = await db.select().from(agronexSocialPosts).where(eq(agronexSocialPosts.id, postId)).limit(1);
  if (!post || !(await canSeePost(db, userId, post))) throw new Error("Cette publication n’est pas disponible.");
  const body = quote.trim();
  const row = { id: crypto.randomUUID(), authorId: userId, body, mediaUrl: null, sourcePostId: postId, kind: body ? "quote" as const : "repost" as const, visibility: "public" as const, createdAt: Date.now() };
  await db.insert(agronexSocialPosts).values(row);
  await addNotification(db, post.authorId, userId, "repost", body ? "a cité votre publication." : "a repartagé votre publication.", postId);
  return row;
}

export async function listSavedSocialPosts(userId: number) {
  const { db } = await requireProfile(userId);
  const saved = await db.select({ postId: agronexSavedPosts.postId }).from(agronexSavedPosts).where(eq(agronexSavedPosts.userId, userId)).orderBy(desc(agronexSavedPosts.createdAt)).limit(60);
  if (!saved.length) return [];
  const rows = await db.select({ id: agronexSocialPosts.id, authorId: agronexSocialPosts.authorId, body: agronexSocialPosts.body, mediaUrl: agronexSocialPosts.mediaUrl, sourcePostId: agronexSocialPosts.sourcePostId, kind: agronexSocialPosts.kind, visibility: agronexSocialPosts.visibility, createdAt: agronexSocialPosts.createdAt, authorName: agronexProfiles.name, authorAvatar: agronexProfiles.avatarUrl, authorLocation: agronexProfiles.location, authorRole: agronexProfiles.role })
    .from(agronexSocialPosts).innerJoin(agronexProfiles, eq(agronexSocialPosts.authorId, agronexProfiles.userId)).where(inArray(agronexSocialPosts.id, saved.map((x) => x.postId)));
  const map = new Map(rows.map((x) => [x.id, x]));
  const visible = [];
  for (const item of saved) { const post = map.get(item.postId); if (post && await canSeePost(db, userId, post)) visible.push({ ...post, likeCount: 0, commentCount: 0, liked: false, saved: true, following: false, connected: false, requestStatus: null, requestDirection: null }); }
  return visible;
}

export async function updateSocialSettings(userId: number, input: { privateProfile: boolean; allowConnectionRequests: boolean }) {
  const { db } = await requireProfile(userId);
  const now = Date.now();
  await db.insert(agronexSocialSettings).values({ userId, ...input, updatedAt: now }).onConflictDoUpdate({ target: agronexSocialSettings.userId, set: { ...input, updatedAt: now } });
  return { ...input };
}

export async function getSocialSettings(userId: number) {
  const { db } = await requireProfile(userId);
  const [settings] = await db.select().from(agronexSocialSettings).where(eq(agronexSocialSettings.userId, userId)).limit(1);
  return settings ?? { userId, privateProfile: false, allowConnectionRequests: true, updatedAt: Date.now() };
}

export async function updateSocialProfile(userId: number, input: { name: string; location: string; bio: string; avatarUrl: string | null }) {
  const { db } = await requireProfile(userId);
  if (input.avatarUrl && !input.avatarUrl.startsWith(`/manus-storage/agronex/${userId}/profiles/`)) throw new Error("La photo de profil doit provenir de votre propre stockage AGRONEX.");
  if (input.avatarUrl && !input.avatarUrl.startsWith("https://")) throw new Error("L’avatar doit être hébergé dans le stockage AGRONEX.");
  await db.update(agronexProfiles).set({ name: input.name.trim(), location: input.location.trim(), bio: input.bio.trim(), avatarUrl: input.avatarUrl, updatedAt: Date.now() }).where(eq(agronexProfiles.userId, userId));
  return { success: true as const };
}

export async function listSocialNotifications(userId: number) {
  const { db } = await requireProfile(userId);
  return db.select({ id: agronexSocialNotifications.id, kind: agronexSocialNotifications.kind, message: agronexSocialNotifications.message, readAt: agronexSocialNotifications.readAt, createdAt: agronexSocialNotifications.createdAt, postId: agronexSocialNotifications.postId, actorId: agronexSocialNotifications.actorId, actorName: agronexProfiles.name, actorAvatar: agronexProfiles.avatarUrl })
    .from(agronexSocialNotifications).leftJoin(agronexProfiles, eq(agronexSocialNotifications.actorId, agronexProfiles.userId)).where(eq(agronexSocialNotifications.recipientId, userId)).orderBy(desc(agronexSocialNotifications.createdAt)).limit(100);
}

export async function markSocialNotificationsRead(userId: number) {
  const { db } = await requireProfile(userId);
  const now = Date.now();
  await db.update(agronexSocialNotifications).set({ readAt: now }).where(and(eq(agronexSocialNotifications.recipientId, userId), sql`${agronexSocialNotifications.readAt} IS NULL`));
  return { success: true as const };
}
