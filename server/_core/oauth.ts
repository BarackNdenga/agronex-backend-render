import type { Express, Request, Response } from "express";

/** Legacy Node OAuth endpoints are deliberately retired; Supabase Edge Functions own all production auth. */
export function registerOAuthRoutes(app: Express) {
  app.all("/api/oauth/*", (_req: Request, res: Response) => {
    res.status(410).json({ error: "OAuth is served by the Supabase Edge Function." });
  });
}
