import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { ENV } from "./_core/env";
import { resolveAgronexOAuthRole } from "./admin-owner-config";

export const SOCIAL_PROVIDERS = ["google", "tiktok"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
type Env = Record<string, string | undefined>;
export type SocialOAuthConfig = {
  publicBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  tiktokClientKey: string;
  tiktokClientSecret: string;
};

type OAuthState = { state: string; nonce: string; provider: SocialProvider; issuedAt: number };
type SocialIdentity = { subject: string; name: string; email: string | null };
const STATE_COOKIE_PREFIX = "__Host-agx-social-";
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function getSocialOAuthConfig(env: Env = process.env): SocialOAuthConfig {
  const configuredBaseUrl = env.AGRONEX_PUBLIC_BASE_URL?.trim() || "https://agronexapp-uqaftoxe.manus.space";
  let publicBaseUrl = "";
  try {
    const parsed = new URL(configuredBaseUrl);
    if (parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" && parsed.pathname === "/" && !parsed.search && !parsed.hash) {
      publicBaseUrl = parsed.origin;
    }
  } catch { /* invalid URL remains disabled */ }
  return {
    publicBaseUrl,
    googleClientId: env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
    googleClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "",
    tiktokClientKey: env.TIKTOK_OAUTH_CLIENT_KEY?.trim() ?? "",
    tiktokClientSecret: env.TIKTOK_OAUTH_CLIENT_SECRET?.trim() ?? "",
  };
}

export function isSocialProviderConfigured(provider: SocialProvider, config: SocialOAuthConfig): boolean {
  if (!config.publicBaseUrl) return false;
  if (provider === "google") return Boolean(config.googleClientId && config.googleClientSecret);
  return Boolean(config.tiktokClientKey && config.tiktokClientSecret);
}

export function getSocialCallbackUrl(provider: SocialProvider, config: SocialOAuthConfig): string {
  return `${config.publicBaseUrl}/api/oauth/social/${provider}/callback`;
}

export function buildSocialAuthorizationUrl(input: {
  provider: SocialProvider;
  config: SocialOAuthConfig;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const url = input.provider === "google"
    ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
    : new URL("https://www.tiktok.com/v2/auth/authorize/");
  const params = url.searchParams;
  if (input.provider === "google") {
    params.set("client_id", input.config.googleClientId);
    params.set("redirect_uri", input.redirectUri);
    params.set("response_type", "code");
    params.set("scope", "openid email profile");
    params.set("state", input.state);
    params.set("nonce", input.nonce);
    params.set("prompt", "select_account");
  } else {
    params.set("client_key", input.config.tiktokClientKey);
    params.set("redirect_uri", input.redirectUri);
    params.set("response_type", "code");
    params.set("scope", "user.info.basic");
    params.set("state", input.state);
  }
  return url.toString();
}

function stateCookieName(provider: SocialProvider) {
  return `${STATE_COOKIE_PREFIX}${provider}`;
}

function createStateCookieValue(provider: SocialProvider): OAuthState {
  return {
    provider,
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    issuedAt: Date.now(),
  };
}

function encodeStateCookie(state: OAuthState) {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function validateSocialStateCookie(provider: SocialProvider, cookieValue: string | undefined, returnedState: string | undefined, now = Date.now()): OAuthState | null {
  if (!cookieValue || !returnedState || cookieValue.length > 512 || returnedState.length > 256) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8")) as OAuthState;
    if (decoded.provider !== provider || !decoded.state || !decoded.nonce || !Number.isSafeInteger(decoded.issuedAt)) return null;
    if (now - decoded.issuedAt < 0 || now - decoded.issuedAt > 10 * 60 * 1000) return null;
    const expected = Buffer.from(decoded.state);
    const actual = Buffer.from(returnedState);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  const result = await response.json().catch(() => null) as any;
  const providerError = result?.error;
  if (!response.ok || !result || (providerError && providerError.code !== "ok")) throw new Error("Social provider request failed");
  return result;
}

async function getGoogleIdentity(code: string, state: OAuthState, config: SocialOAuthConfig, redirectUri: string): Promise<SocialIdentity> {
  const body = new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
  const tokens = await fetchJson("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (typeof tokens.id_token !== "string") throw new Error("Social provider token missing");
  const { payload } = await jwtVerify(tokens.id_token, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: config.googleClientId,
  });
  if (payload.nonce !== state.nonce || typeof payload.sub !== "string" || payload.email_verified !== true) {
    throw new Error("Social provider identity invalid");
  }
  return { subject: payload.sub, name: typeof payload.name === "string" && payload.name.trim() ? payload.name : "Nouveau membre", email: typeof payload.email === "string" ? payload.email : null };
}

async function getTikTokIdentity(code: string, config: SocialOAuthConfig, redirectUri: string): Promise<SocialIdentity> {
  const body = new URLSearchParams({ client_key: config.tiktokClientKey, client_secret: config.tiktokClientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
  const tokenResponse = await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (typeof tokenResponse.access_token !== "string" || typeof tokenResponse.open_id !== "string") throw new Error("Social provider token missing");
  const infoUrl = new URL("https://open.tiktokapis.com/v2/user/info/");
  infoUrl.searchParams.set("fields", "open_id,display_name,avatar_url");
  const info = await fetchJson(infoUrl.toString(), { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } });
  const user = info.data?.user;
  if (typeof user?.open_id !== "string" || user.open_id !== tokenResponse.open_id) throw new Error("Social provider identity invalid");
  return { subject: user.open_id, name: typeof user.display_name === "string" && user.display_name.trim() ? user.display_name : "Nouveau membre", email: null };
}

async function getIdentity(provider: SocialProvider, code: string, state: OAuthState, config: SocialOAuthConfig, redirectUri: string) {
  if (provider === "google") return getGoogleIdentity(code, state, config, redirectUri);
  return getTikTokIdentity(code, config, redirectUri);
}

function getProviderParam(req: Request): SocialProvider | null {
  const value = req.params.provider;
  return SOCIAL_PROVIDERS.includes(value as SocialProvider) ? value as SocialProvider : null;
}

function redirectAuthError(res: Response, error: string) {
  res.redirect(302, `/?auth=${encodeURIComponent(error)}`);
}

export function registerSocialOAuthRoutes(app: Express) {
  app.get("/api/oauth/social/:provider", (req: Request, res: Response) => {
    const provider = getProviderParam(req);
    if (!provider) { res.status(404).send("Fournisseur de connexion non disponible."); return; }
    const config = getSocialOAuthConfig();
    if (!isSocialProviderConfigured(provider, config)) { res.status(503).send("Cette méthode de connexion n’est pas encore configurée."); return; }
    const canonicalHost = new URL(config.publicBaseUrl).host.toLowerCase();
    if (req.get("host")?.toLowerCase() !== canonicalHost) {
      res.redirect(302, `${config.publicBaseUrl}/api/oauth/social/${provider}`);
      return;
    }
    const state = createStateCookieValue(provider);
    res.cookie(stateCookieName(provider), encodeStateCookie(state), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 * 1000,
    });
    res.redirect(302, buildSocialAuthorizationUrl({ provider, config, redirectUri: getSocialCallbackUrl(provider, config), state: state.state, nonce: state.nonce }));
  });

  app.get("/api/oauth/social/:provider/callback", async (req: Request, res: Response) => {
    const provider = getProviderParam(req);
    if (!provider) { res.status(404).send("Fournisseur de connexion non disponible."); return; }
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const cookieName = stateCookieName(provider);
    const oauthState = validateSocialStateCookie(provider, cookies[cookieName], typeof req.query.state === "string" ? req.query.state : undefined);
    res.clearCookie(cookieName, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    if (!oauthState) { res.status(403).send("Connexion interrompue; recommence le processus."); return; }
    if (typeof req.query.error === "string" || typeof req.query.error_description === "string") { redirectAuthError(res, "cancelled"); return; }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code || code.length > 2048) { redirectAuthError(res, "failed"); return; }
    const config = getSocialOAuthConfig();
    if (!isSocialProviderConfigured(provider, config)) { redirectAuthError(res, "unavailable"); return; }
    try {
      const identity = await getIdentity(provider, code, oauthState, config, getSocialCallbackUrl(provider, config));
      if (!identity.subject || identity.subject.length > 512 || !identity.name.trim()) throw new Error("Social provider identity invalid");
      const prefix = provider === "google" ? "g" : "t";
      const digest = createHmac("sha256", `agronex-social:${provider}`).update(identity.subject).digest("base64url");
      const openId = `${prefix}:${digest}`;
      const existingUser = await db.getUserByOpenId(openId);
      const authenticatedRole = resolveAgronexOAuthRole({
        provider,
        openId,
        email: identity.email,
        existingRole: existingUser?.role,
        policy: { ownerOpenId: ENV.ownerOpenId, adminEmails: ENV.adminEmails },
      });
      if (authenticatedRole !== "user") {
        redirectAuthError(res, "admin-only");
        return;
      }
      const userRecord = { openId, name: identity.name.trim().slice(0, 160), loginMethod: provider, lastSignedIn: new Date(), ...(identity.email ? { email: identity.email } : {}) };
      await db.upsertUser(userRecord, { authenticatedRole });
      if (!await db.getUserByOpenId(openId)) throw new Error("Social account persistence failed");
      const sessionToken = await sdk.createSessionToken(openId, { name: identity.name.trim().slice(0, 160), expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch {
      // Do not log authorization codes, access tokens, provider responses, or secrets.
      redirectAuthError(res, "failed");
    }
  });
}
