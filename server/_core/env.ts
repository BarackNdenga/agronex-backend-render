import { resolveAgronexOwnerOpenId } from "../admin-owner-config";
import { getRuntimeVariable } from "./runtime-bindings";

function resolveAgronexAdminEmails(value: string | undefined) {
  return new Set((value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export const ENV = {
  get appId() { return getRuntimeVariable("VITE_APP_ID") ?? ""; },
  get cookieSecret() { return getRuntimeVariable("JWT_SECRET") ?? ""; },
  get databaseUrl() { return getRuntimeVariable("DATABASE_URL") ?? ""; },
  get oAuthServerUrl() { return getRuntimeVariable("OAUTH_SERVER_URL") ?? ""; },
  get adminEmails() { return resolveAgronexAdminEmails(getRuntimeVariable("AGRONEX_ADMIN_EMAILS")); },
  get ownerOpenId() {
    return resolveAgronexOwnerOpenId({
      AGRONEX_OWNER_OPEN_ID: getRuntimeVariable("AGRONEX_OWNER_OPEN_ID"),
      OWNER_OPEN_ID: getRuntimeVariable("OWNER_OPEN_ID"),
    });
  },
  get isProduction() { return getRuntimeVariable("NODE_ENV") === "production"; },
  get forgeApiUrl() { return getRuntimeVariable("BUILT_IN_FORGE_API_URL") ?? ""; },
  get forgeApiKey() { return getRuntimeVariable("BUILT_IN_FORGE_API_KEY") ?? ""; },
};
