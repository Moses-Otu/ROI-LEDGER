import "server-only";
import { decryptJson } from "@/lib/crypto/aes-gcm";
import type { AdminClient } from "@/lib/supabase/admin";
import { createConnector, SYNC_OVERLAP_MS, type ConnectorType } from "./index";

const BACKFILL_DAYS = 30;
/** Leave the most recent minutes alone: providers may still be writing them. */
const SETTLE_MS = 10 * 60_000;
const CHUNK = 500;

export interface ConnectorRow {
  id: string;
  org_id: string;
  type: ConnectorType;
  name: string;
  config: Record<string, unknown>;
  credentials: string | null;
  cursor: { until?: string } | null;
  status: string;
}

export interface SyncOutcome {
  connectorId: string;
  ok: boolean;
  records: number;
  deploymentIds: string[];
  error?: string;
}

export async function syncConnector(db: AdminClient, c: ConnectorRow, now = new Date()): Promise<SyncOutcome> {
  const { data: syncRun } = await db
    .from("sync_runs")
    .insert({ connector_id: c.id, org_id: c.org_id })
    .select("id")
    .single();

  try {
    const [{ data: org }, { data: deployments, error }] = await Promise.all([
      db.from("organisations").select("currency").eq("id", c.org_id).single(),
      db.from("deployments").select("id, external_refs").eq("org_id", c.org_id),
    ]);
    if (error) throw new Error(error.message);

    const connector = createConnector(c.type, {
      config: c.config ?? {},
      credentials: c.credentials ? decryptJson<Record<string, string>>(c.credentials) : {},
      deployments: deployments ?? [],
      currency: org?.currency ?? "NGN",
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    });

    const until = new Date(now.getTime() - SETTLE_MS);
    const since = c.cursor?.until
      ? new Date(Date.parse(c.cursor.until) - SYNC_OVERLAP_MS[c.type])
      : new Date(now.getTime() - BACKFILL_DAYS * 86_400_000);

    const [runs, costs] = await Promise.all([connector.fetchRuns(since, until), connector.fetchCosts(since, until)]);

    for (let i = 0; i < runs.length; i += CHUNK) {
      const { error: e } = await db.rpc("upsert_runs", { p_org: c.org_id, p_rows: dedupe(runs.slice(i, i + CHUNK)) });
      if (e) throw new Error(e.message);
    }
    for (let i = 0; i < costs.length; i += CHUNK) {
      const { error: e } = await db.rpc("upsert_cost_entries", { p_org: c.org_id, p_rows: costs.slice(i, i + CHUNK) });
      if (e) throw new Error(e.message);
    }

    const records = runs.length + costs.length;
    const finished = new Date().toISOString();
    await db
      .from("connectors")
      .update({ cursor: { until: until.toISOString() }, last_synced_at: finished, last_error: null, status: "active" })
      .eq("id", c.id);
    if (syncRun) {
      await db.from("sync_runs").update({ finished_at: finished, records_in: records, status: "success" }).eq("id", syncRun.id);
    }
    const touched = new Set([...runs, ...costs].map((r) => r.deployment_id));
    return { connectorId: c.id, ok: true, records, deploymentIds: [...touched] };
  } catch (e) {
    const message = (e as Error).message.slice(0, 1000);
    await db.from("connectors").update({ last_error: message, status: "error" }).eq("id", c.id);
    if (syncRun) {
      await db
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), status: "failed", error: message })
        .eq("id", syncRun.id);
    }
    return { connectorId: c.id, ok: false, records: 0, deploymentIds: [], error: message };
  }
}

function dedupe<T extends { deployment_id: string; external_id: string }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(`${r.deployment_id}|${r.external_id}`, r);
  return [...m.values()];
}
