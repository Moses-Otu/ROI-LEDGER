import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CurrentOrg {
  id: string;
  name: string;
  industry: string | null;
  currency: string;
  default_loaded_hourly_rate: number;
  productive_hours_per_year: number;
  flag_thresholds: Record<string, number>;
  is_demo: boolean;
}

/** The signed-in user, or a redirect to /login. Verifies the JWT (getClaims). */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return { supabase, userId: claims.sub as string, email: (claims.email as string) ?? null };
}

/**
 * The user's organisation (MVP: their first membership) and role.
 * Redirects to onboarding when they don't belong to one yet.
 */
export async function requireOrg() {
  const { supabase, userId, email } = await requireUser();
  const { data: membership } = await supabase
    .from("org_members")
    .select("role, organisations(*)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership?.organisations) redirect("/onboarding");
  const org = membership.organisations as unknown as CurrentOrg;
  return {
    supabase,
    userId,
    email,
    org: { ...org, default_loaded_hourly_rate: Number(org.default_loaded_hourly_rate) },
    role: membership.role as "admin" | "member",
    isAdmin: membership.role === "admin",
  };
}

export async function requireAdmin() {
  const ctx = await requireOrg();
  if (!ctx.isAdmin) throw new Error("Only organisation admins can do this");
  return ctx;
}
