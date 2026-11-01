import "server-only";
import { syncConnector, type ConnectorRow, type SyncOutcome } from "@/lib/connectors/sync";
import { resolveThresholds } from "@/lib/roi";
import type { AdminClient } from "@/lib/supabase/admin";
import { dispatchEvent } from "@/lib/webhooks/deliver";
import { eventsForChange, monthlySummaryEvent, type PendingEvent } from "@/lib/webhooks/events";
import { recalculateDeployment, todayUtc, type SnapshotChange } from "./recalculate";

/** Recalculates deployments and fires flag/spike webhooks for what changed. */
export async function recalculateAndNotify(db: AdminClient, deploymentIds: string[], asOf = todayUtc()) {
  const changes: SnapshotChange[] = [];
  const failures: { deploymentId: string; error: string }[] = [];
  const spikeByOrg = new Map<string, number>();

  for (const id of deploymentIds) {
    try {
      changes.push(await recalculateDeployment(db, id, asOf));
    } catch (e) {
      failures.push({ deploymentId: id, error: (e as Error).message });
    }
  }

  const events: PendingEvent[] = [];
  for (const c of changes) {
    if (!spikeByOrg.has(c.orgId)) {
      const { data } = await db.from("organisations").select("flag_thresholds").eq("id", c.orgId).single();
      spikeByOrg.set(c.orgId, resolveThresholds(data?.flag_thresholds).cost_per_run_spike_pct);
    }
    events.push(...eventsForChange(c, spikeByOrg.get(c.orgId)!));
  }
  for (const ev of events) await dispatchEvent(db, ev).catch((e) => console.error("webhook failed", e));

  return { changes, failures, events: events.length };
}

/**
 * The daily job: sync every non-paused connector from its cursor, recalculate
 * every deployment (time passing changes ROI even without new data), fire
 * webhooks, and on the 1st of the month send the monthly summary.
 */
export async function runDailyPipeline(db: AdminClient, now = new Date()) {
  const { data: connectors, error } = await db
    .from("connectors")
    .select("id, org_id, type, name, config, credentials, cursor, status")
    .neq("status", "paused");
  if (error) throw new Error(error.message);

  const syncs: SyncOutcome[] = [];
  for (const c of (connectors ?? []) as ConnectorRow[]) syncs.push(await syncConnector(db, c, now));

  const { data: deployments } = await db
    .from("deployments")
    .select("id, org_id")
    .in("status", ["live", "paused"]);
  const asOf = now.toISOString().slice(0, 10);
  const result = await recalculateAndNotify(db, (deployments ?? []).map((d) => d.id), asOf);

  let summaries = 0;
  if (now.getUTCDate() === 1) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const month = prev.toISOString().slice(0, 7);
    const byOrg = new Map<string, SnapshotChange[]>();
    for (const c of result.changes) byOrg.set(c.orgId, [...(byOrg.get(c.orgId) ?? []), c]);
    for (const [orgId, changes] of byOrg) {
      await dispatchEvent(db, monthlySummaryEvent(orgId, month, changes)).catch((e) =>
        console.error("monthly summary failed", e),
      );
      summaries++;
    }
  }

  return {
    connectors: syncs.map((s) => ({ id: s.connectorId, ok: s.ok, records: s.records, error: s.error })),
    recalculated: result.changes.length,
    recalc_failures: result.failures,
    webhook_events: result.events,
    monthly_summaries: summaries,
  };
}
