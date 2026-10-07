import { describe, expect, it } from "vitest";
import {
  buildSocialAuthorizationUrl,
  getSocialCallbackUrl,
  getSocialOAuthConfig,
  isSocialProviderConfigured,
  SOCIAL_PROVIDERS,
  validateSocialStateCookie,
} from "./social-oauth";

const config = getSocialOAuthConfig({
  AGRONEX_PUBLIC_BASE_URL: "https://agronex.example",
  GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
  TIKTOK_OAUTH_CLIENT_KEY: "tiktok-client-key",
  TIKTOK_OAUTH_CLIENT_SECRET: "tiktok-secret",
});

function stateCookie(provider: "google" | "tiktok", issuedAt = 1_000_000) {
  return Buffer.from(JSON.stringify({ provider, state: "state-value-123456789", nonce: "nonce-value-123456789", issuedAt })).toString("base64url");
}

describe("social OAuth configuration", () => {
  it("exposes only Google and TikTok; Facebook is removed", () => {
    expect(SOCIAL_PROVIDERS).toEqual(["google", "tiktok"]);
  });

  it("reports each provider only when its server-side credentials and HTTPS origin exist", () => {
    expect(isSocialProviderConfigured("google", config)).toBe(true);
    expect(isSocialProviderConfigured("tiktok", config)).toBe(true);
    const incomplete = getSocialOAuthConfig({ AGRONEX_PUBLIC_BASE_URL: "https://agronex.example", GOOGLE_OAUTH_CLIENT_ID: "only-an-id" });
    expect(isSocialProviderConfigured("google", incomplete)).toBe(false);
    expect(isSocialProviderConfigured("tiktok", incomplete)).toBe(false);
    expect(isSocialProviderConfigured("google", getSocialOAuthConfig({ ...process.env, AGRONEX_PUBLIC_BASE_URL: "http://localhost:3000" }))).toBe(false);
  });

  it.each(["google", "tiktok"] as const)("uses a fixed HTTPS callback for %s", (provider) => {
    expect(getSocialCallbackUrl(provider, config)).toBe(`https://agronex.example/api/oauth/social/${provider}/callback`);
  });

  it("keeps client secrets out of authorization URLs and requests minimal provider permissions", () => {
    const google = new URL(buildSocialAuthorizationUrl({ provider: "google", config, redirectUri: getSocialCallbackUrl("google", config), state: "state", nonce: "nonce" }));
    expect(google.hostname).toBe("accounts.google.com");
    expect(google.searchParams.get("scope")).toBe("openid email profile");
    expect(google.searchParams.get("nonce")).toBe("nonce");
    expect(google.searchParams.has("client_secret")).toBe(false);

    const tiktok = new URL(buildSocialAuthorizationUrl({ provider: "tiktok", config, redirectUri: getSocialCallbackUrl("tiktok", config), state: "state", nonce: "nonce" }));
    expect(tiktok.searchParams.get("scope")).toBe("user.info.basic");
    expect(tiktok.searchParams.get("client_secret")).toBeNull();
  });
});

describe("social OAuth state", () => {
  const now = 1_000_000;
  it("accepts the matching provider state during its short validity period", () => {
    expect(validateSocialStateCookie("google", stateCookie("google", now), "state-value-123456789", now)?.nonce).toBe("nonce-value-123456789");
  });
  it("rejects mismatches, cross-provider replay, malformed data and expired state", () => {
    expect(validateSocialStateCookie("google", stateCookie("google", now), "wrong-state", now)).toBeNull();
    expect(validateSocialStateCookie("tiktok", stateCookie("google", now), "state-value-123456789", now)).toBeNull();
    expect(validateSocialStateCookie("google", "not-json", "state-value-123456789", now)).toBeNull();
    expect(validateSocialStateCookie("tiktok", stateCookie("tiktok", now - 10 * 60 * 1000 - 1), "state-value-123456789", now)).toBeNull();
    expect(validateSocialStateCookie("tiktok", stateCookie("tiktok", now + 1), "state-value-123456789", now)).toBeNull();
  });
});
