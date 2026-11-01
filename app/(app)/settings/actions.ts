"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { issuesToErrors, type FormState } from "@/components/forms/field";
import { CONNECTOR_TYPES, createConnector, type ConnectorType } from "@/lib/connectors";
import { syncConnector, type ConnectorRow } from "@/lib/connectors/sync";
import { decryptJson, encryptJson, encryptSecret } from "@/lib/crypto/aes-gcm";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currencies";
import { requireAdmin } from "@/lib/dal";
import { generateIngestKey } from "@/lib/ingest/keys";
import { recalculateAndNotify } from "@/lib/ledger/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliver } from "@/lib/webhooks/deliver";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";

const done = (message: string): FormState => {
  revalidatePath("/settings");
  return { ok: true, message };
};

// --- Organisation ------------------------------------------------------------

const orgSchema = z.object({
  name: z.string().trim().min(2),
  industry: z.string().trim().max(100).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "3-letter code"),
  default_loaded_hourly_rate: z.coerce.number().nonnegative(),
  productive_hours_per_year: z.coerce.number().int().positive(),
});

export async function updateOrg(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = orgSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  const { supabase, org } = await requireAdmin();
  // GBP/EUR/USD, or keep a legacy code the org already has (amounts are never converted).
  if (!CURRENCY_CODES.includes(parsed.data.currency as CurrencyCode) && parsed.data.currency !== org.currency) {
    return { errors: { currency: "Choose GBP, EUR or USD" } };
  }
  const { error } = await supabase.from("organisations").update(parsed.data).eq("id", org.id);
  return error ? { message: error.message } : done("Organisation saved");
}

const thresholdSchema = z.object({
  scale_min_roi: z.coerce.number(),
  fix_max_human_touch_rate: z.coerce.number().min(0).max(1),
  fix_healthy_volume_ratio: z.coerce.number().min(0),
  kill_min_days_live: z.coerce.number().int().min(0),
  kill_max_volume_ratio: z.coerce.number().min(0),
  cost_per_run_spike_pct: z.coerce.number().min(0),
});

export async function updateThresholds(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form);
  // Percentages in the form, ratios in the database.
  const pctKeys = ["fix_max_human_touch_rate", "fix_healthy_volume_ratio", "kill_max_volume_ratio", "cost_per_run_spike_pct"];
  const converted = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, pctKeys.includes(k) && v !== "" ? Number(v) / 100 : v]),
  );
  const parsed = thresholdSchema.safeParse(converted);
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  const { supabase, org } = await requireAdmin();
  const { error } = await supabase.from("organisations").update({ flag_thresholds: parsed.data }).eq("id", org.id);
  if (error) return { message: error.message };
  const { data: deps } = await supabase.from("deployments").select("id").eq("org_id", org.id);
  await recalculateAndNotify(createAdminClient(), (deps ?? []).map((d) => d.id)).catch(() => undefined);
  revalidatePath("/deployments");
  return done("Thresholds saved and flags recalculated");
}

// --- Connectors --------------------------------------------------------------

export async function createConnectorAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireAdmin();
  const type = String(form.get("type")) as ConnectorType;
  const spec = CONNECTOR_TYPES[type];
  if (!spec) return { message: "Unknown connector type" };
  const name = String(form.get("name") ?? "").trim() || spec.label;

  const credentials: Record<string, string> = {};
  for (const c of spec.credentials) {
    const v = String(form.get(`cred_${c.key}`) ?? "").trim();
    if (!v) return { errors: { [`cred_${c.key}`]: `${c.label} is required` } };
    credentials[c.key] = v;
  }
  const config: Record<string, unknown> = {};
  for (const c of spec.config) {
    const v = String(form.get(`cfg_${c.key}`) ?? "").trim();
    if (v) config[c.key] = c.key === "usd_rate" ? Number(v) : v;
  }
  if (type === "n8n" && !/^https?:\/\//.test(String(config.base_url ?? ""))) {
    return { errors: { cfg_base_url: "Enter your n8n instance URL" } };
  }

  const db = createAdminClient();
  const { error } = await db.from("connectors").insert({
    org_id: org.id,
    type,
    name,
    config,
    credentials: encryptJson(credentials),
  });
  return error ? { message: error.message } : done(`${spec.label} connector added`);
}

async function loadConnector(id: string): Promise<ConnectorRow> {
  const { org } = await requireAdmin();
  const { data, error } = await createAdminClient()
    .from("connectors")
    .select("id, org_id, type, name, config, credentials, cursor, status")
    .eq("id", id)
    .eq("org_id", org.id)
    .single();
  if (error || !data) throw new Error("Connector not found");
  return data as ConnectorRow;
}

export async function testConnectorAction(id: string): Promise<{ ok: boolean; message: string }> {
  const c = await loadConnector(id);
  const db = createAdminClient();
  const [{ data: org }, { data: deployments }] = await Promise.all([
    db.from("organisations").select("currency").eq("id", c.org_id).single(),
    db.from("deployments").select("id, external_refs").eq("org_id", c.org_id),
  ]);
  const connector = createConnector(c.type, {
    config: c.config,
    credentials: c.credentials ? decryptJson(c.credentials) : {},
    deployments: deployments ?? [],
    currency: org?.currency ?? "NGN",
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
  return connector.testConnection();
}

export async function syncConnectorNow(id: string): Promise<{ ok: boolean; message: string }> {
  const c = await loadConnector(id);
  const db = createAdminClient();
  const res = await syncConnector(db, c);
  if (res.ok) await recalculateAndNotify(db, res.deploymentIds);
  revalidatePath("/settings");
  revalidatePath("/deployments");
  return res.ok
    ? { ok: true, message: `Synced ${res.records} record(s)` }
    : { ok: false, message: res.error ?? "Sync failed" };
}

export async function setConnectorPaused(id: string, paused: boolean): Promise<void> {
  const c = await loadConnector(id);
  await createAdminClient().from("connectors").update({ status: paused ? "paused" : "active" }).eq("id", c.id);
  revalidatePath("/settings");
}

export async function deleteConnector(id: string): Promise<void> {
  const c = await loadConnector(id);
  await createAdminClient().from("connectors").delete().eq("id", c.id);
  revalidatePath("/settings");
}

// --- Ingest keys -------------------------------------------------------------

export interface KeyState extends FormState {
  key?: string;
}

export async function createIngestKey(_prev: KeyState, form: FormData): Promise<KeyState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { errors: { name: "Name the key, e.g. 'n8n production'" } };
  const { org } = await requireAdmin();
  const { key, prefix, hash } = generateIngestKey();
  const { error } = await createAdminClient()
    .from("ingest_keys")
    .insert({ org_id: org.id, name, key_prefix: prefix, key_hash: hash });
  if (error) return { message: error.message };
  revalidatePath("/settings");
  return { ok: true, key, message: "Copy this key now. It won't be shown again." };
}

export async function revokeIngestKey(id: string): Promise<void> {
  const { supabase, org } = await requireAdmin();
  await supabase.from("ingest_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", org.id);
  revalidatePath("/settings");
}

// --- Webhooks ----------------------------------------------------------------

export interface WebhookState extends FormState {
  secret?: string;
}

function webhookUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Enter a full URL";
  }
  const isLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|0\.)/.test(u.hostname);
  if (process.env.NODE_ENV === "production" && (u.protocol !== "https:" || isLocal)) {
    return "Use a public https:// URL";
  }
  return null;
}

export async function createWebhook(_prev: WebhookState, form: FormData): Promise<WebhookState> {
  const url = String(form.get("url") ?? "").trim();
  const problem = webhookUrlProblem(url);
  if (problem) return { errors: { url: problem } };
  const events = form.getAll("events").map(String).filter((e) => (WEBHOOK_EVENTS as string[]).includes(e));
  if (events.length === 0) return { errors: { events: "Pick at least one event" } };
  const { org } = await requireAdmin();
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const { error } = await createAdminClient()
    .from("webhooks")
    .insert({ org_id: org.id, url, events, secret: encryptSecret(secret) });
  if (error) return { message: error.message };
  revalidatePath("/settings");
  return { ok: true, secret, message: "Copy the signing secret now. It won't be shown again." };
}

export async function testWebhook(id: string): Promise<{ ok: boolean; message: string }> {
  const { org } = await requireAdmin();
  const db = createAdminClient();
  const { data: hook } = await db.from("webhooks").select("id, url, secret, events").eq("id", id).eq("org_id", org.id).single();
  if (!hook) return { ok: false, message: "Webhook not found" };
  const ok = await deliver(
    db,
    hook,
    { orgId: org.id, event: "deployment.flag_changed", data: { test: true, message: "Test delivery from AI ROI Ledger" } },
    async () => {}, // no backoff for a manual test
  );
  revalidatePath("/settings");
  return ok ? { ok, message: "Delivered (2xx)" } : { ok, message: "Delivery failed; see the log" };
}

export async function setWebhookActive(id: string, active: boolean): Promise<void> {
  const { supabase, org } = await requireAdmin();
  await supabase.from("webhooks").update({ active }).eq("id", id).eq("org_id", org.id);
  revalidatePath("/settings");
}

export async function deleteWebhook(id: string): Promise<void> {
  const { supabase, org } = await requireAdmin();
  await supabase.from("webhooks").delete().eq("id", id).eq("org_id", org.id);
  revalidatePath("/settings");
}

