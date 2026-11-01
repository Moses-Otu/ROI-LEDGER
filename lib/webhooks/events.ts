import type { SnapshotChange } from "@/lib/ledger/recalculate";

export type WebhookEvent =
  | "deployment.flag_changed"
  | "deployment.cost_per_run_spike"
  | "snapshot.monthly_summary";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "deployment.flag_changed",
  "deployment.cost_per_run_spike",
  "snapshot.monthly_summary",
];

export interface PendingEvent {
  orgId: string;
  event: WebhookEvent;
  /** Used to avoid re-sending the same alert (e.g. a spike) every day. */
  dedupeKey?: string;
  data: Record<string, unknown>;
}

function summary(c: SnapshotChange) {
  const r = c.result;
  return {
    deployment_id: c.deploymentId,
    name: c.name,
    currency: c.currency,
    as_of: r.asOf,
    cost_total: r.costTotal,
    value_total: r.valueTotal,
    net: r.net,
    roi: r.roi,
    payback_date: r.paybackDate,
    payback_projected: r.paybackProjected,
    cost_per_successful_run: r.costPerSuccessfulRun,
    flag: r.flag,
    confidence: r.confidence,
  };
}

/** Pure: which per-deployment events a recalculation should fire. */
export function eventsForChange(c: SnapshotChange, spikePct: number): PendingEvent[] {
  const out: PendingEvent[] = [];
  if (c.previous && c.previous.flag !== c.result.flag) {
    out.push({
      orgId: c.orgId,
      event: "deployment.flag_changed",
      dedupeKey: `${c.deploymentId}:${c.previous.flag}->${c.result.flag}:${c.result.asOf}`,
      data: { ...summary(c), previous_flag: c.previous.flag, reasons: c.result.explain.flag.notes },
    });
  }
  const { current, previous } = c.result.weeklyCostPerRun;
  if (current !== null && previous !== null && previous > 0 && current > previous * (1 + spikePct)) {
    out.push({
      orgId: c.orgId,
      event: "deployment.cost_per_run_spike",
      dedupeKey: `${c.deploymentId}:spike`,
      data: {
        ...summary(c),
        cost_per_run_this_week: current,
        cost_per_run_last_week: previous,
        change_pct: Math.round(((current - previous) / previous) * 1000) / 10,
        threshold_pct: spikePct * 100,
      },
    });
  }
  return out;
}

export function monthlySummaryEvent(orgId: string, month: string, changes: SnapshotChange[]): PendingEvent {
  const rows = changes.map(summary);
  const sum = (k: "cost_total" | "value_total" | "net") => rows.reduce((s, r) => s + r[k], 0);
  return {
    orgId,
    event: "snapshot.monthly_summary",
    dedupeKey: `summary:${month}`,
    data: {
      month,
      currency: changes[0]?.currency ?? null,
      totals: {
        cost_total: Math.round(sum("cost_total") * 100) / 100,
        value_total: Math.round(sum("value_total") * 100) / 100,
        net: Math.round(sum("net") * 100) / 100,
      },
      deployments: rows,
    },
  };
}
