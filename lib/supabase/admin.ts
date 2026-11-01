import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS, so every query MUST be scoped by org_id
 * explicitly. Only use from route handlers, cron and server actions after the
 * caller's org has been established.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
