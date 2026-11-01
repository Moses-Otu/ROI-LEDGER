"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { issuesToErrors, type FormState } from "@/components/forms/field";
import { cookies } from "next/headers";
import { ORG_COOKIE, requireUser } from "@/lib/dal";
import { recalculateDeployment } from "@/lib/ledger/recalculate";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2, "Name your organisation"),
  industry: z.string().trim().max(100).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  default_loaded_hourly_rate: z.coerce.number().nonnegative("Must be 0 or more"),
});

export async function createOrganisation(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_organisation", {
    p_name: parsed.data.name,
    p_currency: parsed.data.currency,
    p_default_loaded_hourly_rate: parsed.data.default_loaded_hourly_rate,
    p_industry: parsed.data.industry || null,
  });
  if (error) return { message: error.message };
  (await cookies()).delete(ORG_COOKIE);
  redirect("/deployments");
}

/** Creates the clearly-labelled demo organisation (fake data) and switches to it. */
export async function createDemo(): Promise<void> {
  const { supabase } = await requireUser();
  const { data: orgId, error } = await supabase.rpc("create_demo_org");
  if (error || !orgId) throw new Error(error?.message ?? "Could not create demo data");
  const db = createAdminClient();
  const { data: deps } = await db.from("deployments").select("id").eq("org_id", orgId);
  for (const d of deps ?? []) await recalculateDeployment(db, d.id);
  (await cookies()).set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/deployments");
}
