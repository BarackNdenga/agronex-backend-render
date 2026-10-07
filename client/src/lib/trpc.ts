import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();
export const apiBaseUrl = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
