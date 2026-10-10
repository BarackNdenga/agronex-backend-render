import { ForbiddenError } from "@shared/_core/errors";
import { createClient } from "@supabase/supabase-js";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

type RoleInput = {
  existingRole?: "user" | "admin" | null;
  emailVerified: boolean;
  isAllowlistedAdmin: boolean;
  isConfiguredOwner: boolean;
};

/**
 * Existing server-assigned admin roles remain authoritative (including invitation grants).
 * A verified allowlisted/owner email gets its initial admin role only when its app row is created.
 * User-editable Supabase user_metadata is never consulted for authorization.
 */
export function resolveAgronexRole(input: RoleInput): "user" | "admin" {
  if (input.emailVerified && input.isConfiguredOwner) return "admin";
  if (input.existingRole) return input.existingRole;
  return input.emailVerified && (input.isAllowlistedAdmin || input.isConfiguredOwner) ? "admin" : "user";
}

const createAuthClient = () => createClient(ENV.supabaseUrl, ENV.supabasePublishableKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

class SDKServer {
  async authenticateRequest(req: { headers: Headers | { authorization?: string } }): Promise<AuthenticatedUser> {
    const authHeader = req.headers instanceof Headers
      ? req.headers.get("authorization")
      : req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) throw ForbiddenError("Une session Supabase valide est requise.");

    const { data, error } = await createAuthClient().auth.getUser(authHeader.slice(7));
    if (error || !data.user || data.user.is_anonymous) throw ForbiddenError("Session Supabase invalide.");

    const authUser = data.user;
    const email = authUser.email?.trim().toLowerCase() || null;
    const emailVerified = Boolean(authUser.email_confirmed_at);
    const openId = `supabase:${authUser.id}`;
    const existing = await db.getUserByOpenId(openId);
    const allowedEmail = email && emailVerified ? await db.isAllowedAdminEmail(email) : false;
    const isOwner = emailVerified && Boolean(email) && email === ENV.ownerEmail;
    const role = resolveAgronexRole({
      existingRole: existing?.role ?? null,
      emailVerified,
      isAllowlistedAdmin: Boolean(allowedEmail),
      isConfiguredOwner: isOwner,
    });

    const metadataName = authUser.user_metadata?.display_name ?? authUser.user_metadata?.name ?? authUser.user_metadata?.full_name;
    const name = typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim().slice(0, 160)
      : email?.split("@")[0] || "Membre AGRONEX";

    await db.upsertUser({
      openId,
      name,
      email,
      loginMethod: "supabase",
      role,
      lastSignedIn: new Date(),
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw ForbiddenError("Le compte AGRONEX n’a pas pu être chargé.");
    return user;
  }
}

export const sdk = new SDKServer();
