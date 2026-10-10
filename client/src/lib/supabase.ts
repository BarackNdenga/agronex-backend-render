import { createClient } from "@supabase/supabase-js";

// These are public client settings. Never place a Supabase secret/service-role key here.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://qzvxygcdlxgamksjvfby.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_mS3M7-9PTCJ88Qbxp4WfRg_3Mf_ZARF";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
