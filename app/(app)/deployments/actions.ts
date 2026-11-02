"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { issuesToErrors, type FormState } from "@/components/forms/field";
import { requireOrg } from "@/lib/dal";
import { recalculateAndNotify } from "@/lib/ledger/pipeline";
import { nextSetupHref } from "@/lib/setup";
import { createAdminClient } from "@/lib/supabase/admin";

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optNumber = z.preprocess(blankToUndefined, z.coerce.number().nonnegative().optional());
const optRate = z.preprocess(
  blankToUndefined,
  z.coerce.number().min(0, "Between 0 and 100").max(100, "Between 0 and 100").optional(),
);
const optText = (max = 500) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const optDate = z.preprocess(blankToUndefined, z.iso.date().optional());
const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const deploymentSchema = z.object({
  name: z.string().trim().min(2, "Give it a name"),
  type: z.enum(["agent", "workflow", "seat_tool", "custom_gpt"]),
  description: optText(2000),
  task_replaced: optText(1000),
  owner_name: optText(200),
  owner_contact: optText(200),
  status: z.enum(["planned", "live", "paused", "retired"]),
  go_live_date: optDate,
  expected_life_months: z.coerce.number().int().positive().default(24),
  predicted_monthly_value: optNumber,
  predicted_monthly_cost: optNumber,
});

/** Confirms the deployment belongs to the caller's org (RLS-scoped read). */
async function ownDeployment(id: string) {
  const ctx = await requireOrg();
  const { data } = await ctx.supabase.from("deployments").select("id").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!data) throw new Error("Deployment not found");
  return ctx;
}

async function refresh(deploymentId: string) {
  // Snapshots are written by the server only; ownership was checked above.
  await recalculateAndNotify(createAdminClient(), [deploymentId]).catch((e) => console.error(e));
  revalidatePath(`/deployments/${deploymentId}`);
  revalidatePath("/deployments");
}

export async function saveDeployment(id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = deploymentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  if (parsed.data.status === "live" && !parsed.data.go_live_date) {
    return { errors: { go_live_date: "A live deployment needs a go-live date" } };
  }
  const { supabase, org } = id ? await ownDeployment(id) : await requireOrg();

  const external_refs = {
    n8n_workflow_ids: list(form.get("n8n_workflow_ids")),
    langfuse_tags: list(form.get("langfuse_tags")),
    langfuse_project: String(form.get("langfuse_project") ?? "").trim() || undefined,
    openrouter_key_label: String(form.get("openrouter_key_label") ?? "").trim() || undefined,
  };
  const row = {
    ...parsed.data,
    description: parsed.data.description ?? null,
    task_replaced: parsed.data.task_replaced ?? null,
    owner_name: parsed.data.owner_name ?? null,
    owner_contact: parsed.data.owner_contact ?? null,
    go_live_date: parsed.data.go_live_date ?? null,
    predicted_monthly_value: parsed.data.predicted_monthly_value ?? null,
    predicted_monthly_cost: parsed.data.predicted_monthly_cost ?? null,
    external_refs,
    org_id: org.id,
  };

  const { data, error } = id
    ? await supabase.from("deployments").update(row).eq("id", id).select("id").single()
    : await supabase.from("deployments").insert(row).select("id").single();
  if (error || !data) return { message: error?.message ?? "Could not save" };
  await refresh(data.id);
  // Guided setup: a new deployment goes to the baseline step; edits go to the next unfinished step.
  redirect(id ? await nextSetupHref(supabase, data.id) : `/deployments/${data.id}/baseline`);
}

const baselineSchema = z.object({
  volume_per_month: z.coerce.number().nonnegative("Must be 0 or more"),
  minutes_per_task: z.coerce.number().positive("Must be more than 0"),
  loaded_hourly_rate: z.coerce.number().nonnegative("Must be 0 or more"),
  error_rate_pct: optRate,
  ai_error_rate_pct: optRate,
  cost_per_error: optNumber,
  turnaround_hours: optNumber,
  source: z.enum(["measured", "reconstructed", "estimate"]),
  notes: optText(4000),
});

export async function saveBaseline(deploymentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = baselineSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  const { supabase, org } = await ownDeployment(deploymentId);
  const b = parsed.data;
  const { error } = await supabase.from("baselines").insert({
    org_id: org.id,
    deployment_id: deploymentId,
    volume_per_month: b.volume_per_month,
    minutes_per_task: b.minutes_per_task,
    loaded_hourly_rate: b.loaded_hourly_rate,
    error_rate: b.error_rate_pct === undefined ? null : b.error_rate_pct / 100,
    ai_error_rate: b.ai_error_rate_pct === undefined ? null : b.ai_error_rate_pct / 100,
    cost_per_error: b.cost_per_error ?? null,
    turnaround_hours: b.turnaround_hours ?? null,
    source: b.source,
    notes: b.notes ?? null,
  });
  if (error) return { message: error.message };
  await refresh(deploymentId);
  redirect(await nextSetupHref(supabase, deploymentId));
}

const humanTimeSchema = z.object({
  period_start: z.iso.date("Pick a start date"),
  period_end: z.iso.date("Pick an end date"),
  review: optNumber,
  fix: optNumber,
  escalation: optNumber,
  maintenance: optNumber,
  hourly_rate: optNumber,
  logged_by: optText(200),
});

/** Quick weekly entry: one row per activity with minutes > 0. */
export async function logHumanTime(deploymentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = humanTimeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  const h = parsed.data;
  if (h.period_end < h.period_start) return { errors: { period_end: "End must be on or after start" } };
  const activities = (["review", "fix", "escalation", "maintenance"] as const).filter((a) => (h[a] ?? 0) > 0);
  if (activities.length === 0) return { errors: { review: "Enter minutes for at least one activity" } };

  const { supabase, org } = await ownDeployment(deploymentId);
  const { error } = await supabase.from("human_time_logs").insert(
    activities.map((activity) => ({
      org_id: org.id,
      deployment_id: deploymentId,
      period_start: h.period_start,
      period_end: h.period_end,
      activity,
      minutes: h[activity],
      hourly_rate: h.hourly_rate ?? null,
      logged_by: h.logged_by ?? null,
      source: "form",
    })),
  );
  if (error) return { message: error.message };
  await refresh(deploymentId);
  return { ok: true, message: `Logged ${activities.length} entr${activities.length === 1 ? "y" : "ies"}` };
}

const costSchema = z.object({
  category: z.enum(["build", "setup", "training", "licence", "tokens", "hosting", "tooling", "maintenance", "other"]),
  is_one_off: z.enum(["true", "false"]).transform((v) => v === "true"),
  amount: z.coerce.number().nonnegative("Must be 0 or more"),
  period_start: z.iso.date("Pick a start date"),
  period_end: optDate,
  notes: optText(1000),
});

export async function addCostEntry(deploymentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = costSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  const c = parsed.data;
  const periodEnd = c.period_end ?? c.period_start;
  if (periodEnd < c.period_start) return { errors: { period_end: "End must be on or after start" } };
  const { supabase, org } = await ownDeployment(deploymentId);
  const { error } = await supabase.from("cost_entries").insert({
    org_id: org.id,
    deployment_id: deploymentId,
    category: c.category,
    is_one_off: c.is_one_off,
    amount: c.amount,
    period_start: c.period_start,
    period_end: periodEnd,
    notes: c.notes ?? null,
  });
  if (error) return { message: error.message };
  await refresh(deploymentId);
  return { ok: true, message: "Cost added" };
}

export async function deleteEntry(
  deploymentId: string,
  table: "cost_entries" | "human_time_logs",
  entryId: string,
): Promise<void> {
  const { supabase } = await ownDeployment(deploymentId);
  await supabase.from(table).delete().eq("id", entryId).eq("deployment_id", deploymentId);
  await refresh(deploymentId);
}

export async function recalculateNow(deploymentId: string): Promise<{ ok: boolean; message: string }> {
  await ownDeployment(deploymentId);
  const { failures } = await recalculateAndNotify(createAdminClient(), [deploymentId]);
  revalidatePath(`/deployments/${deploymentId}`);
  revalidatePath("/deployments");
  return failures.length ? { ok: false, message: failures[0].error } : { ok: true, message: "Recalculated" };
}
