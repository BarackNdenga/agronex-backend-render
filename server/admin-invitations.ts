import { createHash, randomBytes } from "node:crypto";

export const AGRONEX_ADMIN_LIMIT = 4;
export const ADMIN_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminInvitationErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";

export class AdminInvitationError extends Error {
  constructor(public readonly code: AdminInvitationErrorCode, message: string) {
    super(message);
    this.name = "AdminInvitationError";
  }
}

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createAdminInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashAdminInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function assertAdminSeatAvailable(adminCount: number, pendingInvitationCount: number, replacesExistingInvitation = false) {
  const reservedSeats = adminCount + pendingInvitationCount - (replacesExistingInvitation ? 1 : 0);
  if (reservedSeats >= AGRONEX_ADMIN_LIMIT) {
    throw new AdminInvitationError("CONFLICT", "Les quatre places administrateur sont déjà attribuées ou réservées.");
  }
}

export function assertAdminInvitationClaim(input: {
  invitation: { email: string; expiresAt: number; redeemedAt: number | null; revokedAt: number | null };
  accountEmail: string | null;
  accountRole: "admin" | "user";
  currentAdminCount: number;
  now: number;
}) {
  const { invitation, accountEmail, accountRole, currentAdminCount, now } = input;
  if (invitation.revokedAt) throw new AdminInvitationError("CONFLICT", "Cette invitation a été révoquée.");
  if (invitation.redeemedAt) throw new AdminInvitationError("CONFLICT", "Cette invitation a déjà été utilisée.");
  if (invitation.expiresAt <= now) throw new AdminInvitationError("CONFLICT", "Cette invitation a expiré. Demandez un nouveau lien.");
  const normalizedAccountEmail = accountEmail ? normalizeInvitationEmail(accountEmail) : "";
  if (!normalizedAccountEmail || normalizeInvitationEmail(invitation.email) !== normalizedAccountEmail) {
    throw new AdminInvitationError("FORBIDDEN", "Cette invitation est réservée à une autre adresse e-mail.");
  }
  if (accountRole === "admin") throw new AdminInvitationError("CONFLICT", "Ce compte est déjà administrateur.");
  if (currentAdminCount >= AGRONEX_ADMIN_LIMIT) throw new AdminInvitationError("CONFLICT", "Les quatre places administrateur sont déjà occupées.");
}
