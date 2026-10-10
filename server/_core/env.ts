import { resolveAgronexOwnerEmail } from "../admin-owner-config";

type RuntimeGlobal = typeof globalThis & {
  Deno?: { env?: { get(name: string): string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

const runtime = globalThis as RuntimeGlobal;
const read = (name: string) => {
  try { return runtime.Deno?.env?.get(name) ?? runtime.process?.env?.[name] ?? ""; }
  catch { return runtime.process?.env?.[name] ?? ""; }
};
const parseKeyring = (name: string) => {
  try {
    const values = JSON.parse(read(name)) as Record<string, string>;
    return values.default || Object.values(values)[0] || "";
  } catch { return ""; }
};
const configuredFrontend = read("AGRONEX_PUBLIC_BASE_URL") || "https://agronexapp-uqaftoxe.manus.space";
let frontendOrigin = "https://agronexapp-uqaftoxe.manus.space";
try {
  const parsed = new URL(configuredFrontend);
  if (parsed.protocol === "https:" && !parsed.username && !parsed.password) frontendOrigin = parsed.origin;
} catch { /* retain the known production origin */ }

export const ENV = {
  databaseUrl: read("DATABASE_URL") || read("SUPABASE_DB_URL"),
  ownerEmail: resolveAgronexOwnerEmail({ AGRONEX_OWNER_EMAIL: read("AGRONEX_OWNER_EMAIL") }),
  forgeApiUrl: read("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: read("BUILT_IN_FORGE_API_KEY"),
  supabaseUrl: read("SUPABASE_URL") || "https://qzvxygcdlxgamksjvfby.supabase.co",
  supabasePublishableKey: parseKeyring("SUPABASE_PUBLISHABLE_KEYS") || read("SUPABASE_ANON_KEY") || "sb_publishable_mS3M7-9PTCJ88Qbxp4WfRg_3Mf_ZARF",
  supabaseSecretKey: parseKeyring("SUPABASE_SECRET_KEYS") || read("SUPABASE_SERVICE_ROLE_KEY"),
  frontendOrigin,
  storageBucket: read("AGRONEX_STORAGE_BUCKET") || "agronex-media",
  corsOrigins: new Set([frontendOrigin, ...read("CORS_ORIGINS").split(",").map((origin) => origin.trim()).filter(Boolean)]),
};
