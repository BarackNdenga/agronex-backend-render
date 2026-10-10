import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

const MEDIA_URL_TTL_SECONDS = 30 * 60;

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (!key || key.split("/").some((part) => !part || part === "." || part === "..") || !/^[A-Za-z0-9/_\-.]+$/.test(key)) {
    throw new Error("Clé de stockage AGRONEX invalide.");
  }
  return key;
}

function storageAdmin() {
  if (!ENV.supabaseSecretKey) throw new Error("Le stockage Supabase n’est pas configuré côté serveur.");
  return createClient(ENV.supabaseUrl, ENV.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function signatureFor(key: string, expiresAt: number) {
  if (!ENV.supabaseSecretKey) throw new Error("La clé secrète Supabase manque pour signer les médias.");
  return createHmac("sha256", ENV.supabaseSecretKey).update(`${key}\n${expiresAt}`).digest("hex");
}

export function signStorageUrl(relKey: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const key = normalizeKey(relKey);
  const expiresAt = nowSeconds + MEDIA_URL_TTL_SECONDS;
  const signature = signatureFor(key, expiresAt);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${ENV.supabaseUrl}/functions/v1/agronex-api/manus-storage/${encodedKey}?expires=${expiresAt}&sig=${signature}`;
}

export function verifyStorageSignature(relKey: string, expiresAt: number, signature: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  let key: string;
  try { key = normalizeKey(relKey); } catch { return false; }
  if (!Number.isSafeInteger(expiresAt) || expiresAt < nowSeconds || expiresAt > nowSeconds + MEDIA_URL_TTL_SECONDS + 60) return false;
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signatureFor(key, expiresAt), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function appendHashSuffix(relKey: string): string {
  const safeKey = normalizeKey(relKey);
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = safeKey.lastIndexOf(".");
  if (lastDot === -1) return `${safeKey}_${hash}`;
  return `${safeKey.slice(0, lastDot)}_${hash}${safeKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(relKey);
  const { error } = await storageAdmin().storage.from(ENV.storageBucket).upload(key, data, {
    contentType,
    upsert: false,
    cacheControl: "1800",
  });
  if (error) throw new Error("Échec de l’envoi du fichier dans Supabase Storage.");
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return signStorageUrl(relKey);
}

export async function storageDownload(relKey: string) {
  const key = normalizeKey(relKey);
  const { data, error } = await storageAdmin().storage.from(ENV.storageBucket).download(key);
  if (error || !data) throw new Error("Fichier AGRONEX introuvable dans Supabase Storage.");
  return data;
}
