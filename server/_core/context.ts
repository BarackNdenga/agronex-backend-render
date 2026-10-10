import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type AuthRequest = { headers: Headers | { authorization?: string; cookie?: string } };
export type TrpcContext = { req: AuthRequest; user: User | null };

export async function createContext(opts: { req: AuthRequest }): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    // Authentication is optional for public procedures; protected routes enforce it.
    user = null;
  }
  return { req: opts.req, user };
}
