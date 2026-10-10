import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { signStorageUrl } from "../storage";
import type { TrpcContext } from "./context";

function signMediaLinks(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string" && value.startsWith("/manus-storage/")) {
    return signStorageUrl(value.slice("/manus-storage/".length));
  }
  if (!value || typeof value !== "object" || value instanceof Date || value instanceof Uint8Array) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) value[index] = signMediaLinks(value[index], seen);
    return value;
  }
  for (const key of Object.keys(value)) {
    const item = (value as Record<string, unknown>)[key];
    (value as Record<string, unknown>)[key] = signMediaLinks(item, seen);
  }
  return value;
}

const transformer = {
  serialize: (value: unknown) => superjson.serialize(signMediaLinks(value)),
  deserialize: superjson.deserialize,
};

const t = initTRPC.context<TrpcContext>().create({ transformer });
export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const adminProcedure = t.procedure.use(t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
}));
