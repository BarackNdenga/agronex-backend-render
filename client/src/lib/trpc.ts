import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();
export const apiBaseUrl = String(import.meta.env.VITE_API_URL || "https://qzvxygcdlxgamksjvfby.supabase.co/functions/v1/agronex-api").replace(/\/$/, "");
