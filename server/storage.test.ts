import { afterEach, describe, expect, it, vi } from "vitest";
import { configureR2Bucket, normalizeStorageKey, storageGet, storageGetSignedUrl, storagePut } from "./storage";

afterEach(() => configureR2Bucket(undefined));

describe("Cloudflare R2 storage adapter", () => {
  it("writes media through the R2 binding and returns the app media route", async () => {
    let saved: { key: string; value: string | ArrayBuffer | ArrayBufferView; options?: { httpMetadata?: { contentType?: string } } } | undefined;
    const bucket = {
      put: vi.fn(async (key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { httpMetadata?: { contentType?: string } }) => {
        saved = { key, value, options };
      }),
      get: vi.fn(async () => null),
    };
    configureR2Bucket(bucket);

    const bytes = new Uint8Array([1, 2, 3]);
    const result = await storagePut("agronex/42/social/photo.jpg", bytes, "image/jpeg");

    expect(result.key).toMatch(/^agronex\/42\/social\/photo_[a-f0-9]{8}\.jpg$/);
    expect(result.url).toBe(`/manus-storage/${result.key}`);
    expect(bucket.put).toHaveBeenCalledOnce();
    expect(saved?.key).toBe(result.key);
    expect(Array.from(saved?.value as Uint8Array)).toEqual([1, 2, 3]);
    expect(saved?.options?.httpMetadata?.contentType).toBe("image/jpeg");
  });

  it("rejects traversal, empty path segments, and invalid keys", async () => {
    expect(() => normalizeStorageKey("../private.png")).toThrow("Invalid storage key");
    expect(() => normalizeStorageKey("agronex//photo.png")).toThrow("Invalid storage key");
    await expect(storageGet("agronex/./photo.png")).rejects.toThrow("Invalid storage key");
  });

  it("fails closed when asked for a signed URL from an R2 binding", async () => {
    configureR2Bucket({ put: vi.fn(async () => undefined), get: vi.fn(async () => null) });
    await expect(storageGetSignedUrl("agronex/42/social/photo.jpg")).rejects.toThrow("Signed URLs are not available");
  });
});
