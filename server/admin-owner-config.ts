export type OwnerEnvironment = {
  AGRONEX_OWNER_OPEN_ID?: string;
  OWNER_OPEN_ID?: string;
};

export type AgronexOAuthProvider = "manus" | "google" | "tiktok";
export type AgronexRole = "user" | "admin";

export type AgronexOAuthPolicy = {
  ownerOpenId: string;
  adminEmails: ReadonlySet<string>;
};

export function resolveAgronexOwnerOpenId(env: OwnerEnvironment) {
  return env.AGRONEX_OWNER_OPEN_ID?.trim() || env.OWNER_OPEN_ID?.trim() || "";
}

/**
 * Manus is the only authentication provider allowed to establish an admin
 * session. Google/Gmail and TikTok remain member-only, even when their verified
 * email is present in the configured admin allowlist.
 */
export function resolveAgronexOAuthRole(input: {
  provider: AgronexOAuthProvider;
  openId: string;
  email?: string | null;
  existingRole?: AgronexRole | null;
  policy: AgronexOAuthPolicy;
}): AgronexRole | null {
  const normalizedEmail = input.email?.trim().toLowerCase() ?? "";
  const ownerOpenId = input.policy.ownerOpenId.trim();
  const configuredAdmin = Boolean(
    (ownerOpenId && input.openId === ownerOpenId) ||
      (normalizedEmail && input.policy.adminEmails.has(normalizedEmail)),
  );
  const existingAdmin = input.existingRole === "admin";

  if (input.provider === "manus") {
    return configuredAdmin || existingAdmin ? "admin" : null;
  }

  return configuredAdmin || existingAdmin ? null : "user";
}
