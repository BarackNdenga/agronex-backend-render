import { resolveAgronexOwnerOpenId } from "../admin-owner-config";

function resolveAgronexAdminEmails(value: string | undefined) {
  return new Set((value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  adminEmails: resolveAgronexAdminEmails(process.env.AGRONEX_ADMIN_EMAILS),
  ownerOpenId: resolveAgronexOwnerOpenId({
    AGRONEX_OWNER_OPEN_ID: process.env.AGRONEX_OWNER_OPEN_ID,
    OWNER_OPEN_ID: process.env.OWNER_OPEN_ID,
  }),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
