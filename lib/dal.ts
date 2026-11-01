import "server-only";
import { cookies } from "next/headers";
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

export const ORG_COOKIE = "roi_org";

/**
 * The user's current organisation and role: the one picked in the org switcher
 * (cookie), else their first membership. Redirects to onboarding when they
 * don't belong to one yet. The cookie is only a preference; membership is
 * always checked.
 */
export async function requireOrg() {
  const { supabase, userId, email } = await requireUser();
  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, role, organisations(*)")
    .eq("user_id", userId)
    .order("created_at");
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const membership = memberships?.find((m) => m.org_id === preferred) ?? memberships?.[0];
  if (!membership?.organisations) redirect("/onboarding");
  const org = membership.organisations as unknown as CurrentOrg;
  return {
    supabase,
    userId,
    email,
    org: { ...org, default_loaded_hourly_rate: Number(org.default_loaded_hourly_rate) },
    role: membership.role as "admin" | "member",
    isAdmin: membership.role === "admin",
    memberships: (memberships ?? []).map((m) => ({
      id: m.org_id as string,
      name: (m.organisations as unknown as CurrentOrg).name,
    })),
  };
}

export async function requireAdmin() {
  const ctx = await requireOrg();
  if (!ctx.isAdmin) throw new Error("Only organisation admins can do this");
  return ctx;
}
