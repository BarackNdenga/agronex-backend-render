// Storage abstraction for AGRONEX media.
// Cloudflare Workers use the R2 binding; Forge remains a temporary local/legacy
// fallback until the Worker runtime is wired to its R2 environment binding.

import { ENV } from "./_core/env";

type R2ObjectLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
};

type R2BucketLike = {
  put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
};

let r2Bucket: R2BucketLike | undefined;

/** Called by the Cloudflare Worker bootstrap with its static `MEDIA` binding. */
export function configureR2Bucket(bucket: R2BucketLike | undefined) {
  r2Bucket = bucket;
}

export function getR2Bucket() {
  return r2Bucket;
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: configure the Cloudflare MEDIA bucket binding or the legacy Forge storage credentials",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

export function normalizeStorageKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (!key || key.includes("\\") || key.includes("\0") || key.split("/").some((part) => part === ".." || part === "." || part === "")) {
    throw new Error("Invalid storage key");
  }
  return key;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeStorageKey(relKey));
  if (r2Bucket) {
    const value = typeof data === "string" ? data : new Uint8Array(data);
    await r2Bucket.put(key, value, { httpMetadata: { contentType } });
    return { key, url: `/manus-storage/${key}` };
  }

  const { forgeUrl, forgeKey } = getForgeConfig();
  // Legacy Forge path remains available for the existing Node deployment only.
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  let body: string | Blob;
  if (typeof data === "string") body = data;
  else {
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    body = new Blob([buffer], { type: contentType });
  }
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!uploadResp.ok) throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeStorageKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

/**
 * Compatibility helper: R2 objects are served through the Worker media route;
 * the legacy Forge runtime can still return a time-limited presigned URL.
 */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeStorageKey(relKey);
  if (r2Bucket) {
    throw new Error("Signed URLs are not available through the R2 binding; use the media route or a configured custom domain.");
  }

  const { forgeUrl, forgeKey } = getForgeConfig();
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = (await resp.json()) as { url: string };
  return url;
}
