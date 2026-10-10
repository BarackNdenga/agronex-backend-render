import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../server/routers.ts";
import { createContext } from "../../../server/_core/context.ts";
import { ENV } from "../../../server/_core/env.ts";
import { storageDownload, verifyStorageSignature } from "../../../server/storage.ts";

const FUNCTION_PREFIX = "/functions/v1/agronex-api";
const ALLOWED_HEADERS = "authorization, apikey, content-type, x-client-info, trpc-accept, x-supabase-api-version";

function routePath(url: URL) {
  const index = url.pathname.indexOf(FUNCTION_PREFIX);
  return index >= 0 ? (url.pathname.slice(index + FUNCTION_PREFIX.length) || "/") : url.pathname;
}

function addCors(response: Response, origin: string | null) {
  const headers = new Headers(response.headers);
  if (origin && ENV.corsOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function normalizedRequest(request: Request, path: string) {
  const url = new URL(request.url);
  url.pathname = path;
  return new Request(url, request);
}

async function serveMedia(path: string, url: URL) {
  const rawKey = path.slice("/manus-storage/".length);
  let key: string;
  try { key = rawKey.split("/").map(decodeURIComponent).join("/"); }
  catch { return new Response("Invalid media path", { status: 400 }); }
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("sig") ?? "";
  if (!verifyStorageSignature(key, expires, signature)) return new Response("Expired or invalid media URL", { status: 403 });
  try {
    const blob = await storageDownload(key);
    return new Response(await blob.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch {
    return new Response("Media not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && !ENV.corsOrigins.has(origin)) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return addCors(new Response(null, { status: 204 }), origin);

  const path = routePath(url);
  try {
    if (path === "/healthz" && request.method === "GET") {
      return addCors(Response.json({ ok: true, service: "agronex-api", databaseConfigured: Boolean(ENV.databaseUrl) }), origin);
    }
    if (path.startsWith("/manus-storage/")) {
      return addCors(await serveMedia(path, url), origin);
    }
    if (path === "/api/trpc" || path.startsWith("/api/trpc/")) {
      const req = normalizedRequest(request, path);
      const response = await fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: appRouter,
        createContext: ({ req: contextRequest }) => createContext({ req: contextRequest }),
        onError({ path: procedurePath, error }) {
          console.error("[tRPC] Edge procedure failed", { path: procedurePath, code: error.code });
        },
      });
      return addCors(response, origin);
    }
    return addCors(new Response("Not found", { status: 404 }), origin);
  } catch (error) {
    console.error("[AGRONEX Edge] Request failed", error instanceof Error ? error.message : "unknown error");
    return addCors(Response.json({ error: "Internal server error" }, { status: 500 }), origin);
  }
});
