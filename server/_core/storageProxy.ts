import type { Express } from "express";
import { ENV } from "./env";
import { getR2Bucket, normalizeStorageKey } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const rawKey = (req.params as Record<string, string>)[0];
    if (!rawKey) {
      res.status(400).send("Missing storage key");
      return;
    }

    let key: string;
    try { key = normalizeStorageKey(rawKey); }
    catch { res.status(400).send("Invalid storage key"); return; }

    const r2 = getR2Bucket();
    if (r2) {
      try {
        const object = await r2.get(key);
        if (!object) { res.status(404).send("Media not found"); return; }
        res.set("Cache-Control", "no-store");
        res.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
        res.send(Buffer.from(await object.arrayBuffer()));
      } catch (err) {
        console.error("[StorageProxy] R2 read failed:", err);
        res.status(502).send("Storage proxy error");
      }
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
