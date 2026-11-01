"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { issuesToErrors, type FormState } from "@/components/forms/field";
import { CURRENCY_CODES } from "@/lib/currencies";
import { ORG_COOKIE, requireUser } from "@/lib/dal";

const schema = z.object({
  name: z.string().trim().min(2, "Name your organisation"),
  industry: z.string().trim().max(100).optional(),
  currency: z.enum(CURRENCY_CODES, "Choose GBP, EUR or USD"),
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
