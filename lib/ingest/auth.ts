import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { hashIngestKey } from "./keys";

/** Resolves the `x-ingest-key` header to an organisation id, or null. */
export async function authenticateIngestKey(db: AdminClient, key: string | null): Promise<string | null> {
  if (!key || key.length < 20 || key.length > 200) return null;
  const { data } = await db
    .from("ingest_keys")
    .select("id, org_id")
    .eq("key_hash", hashIngestKey(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  await db.from("ingest_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.org_id as string;
}
