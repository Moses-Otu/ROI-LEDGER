import "server-only";
import { calculateRoi, type RoiInput, type RoiResult } from "@/lib/roi";
import type { AdminClient } from "@/lib/supabase/admin";

const PAGE = 1000;

/** PostgREST caps rows per request; page through everything. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface DeploymentContext {
  deployment: Record<string, unknown> & { id: string; org_id: string; name: string };
  org: Record<string, unknown> & { id: string; currency: string };
  baseline: Record<string, unknown> | null;
  input: RoiInput;
}

/** Loads everything the ROI module needs for one deployment. */
export async function loadDeploymentContext(
  db: AdminClient,
  deploymentId: string,
  asOf: string,
): Promise<DeploymentContext> {
  const { data: deployment, error } = await db
    .from("deployments")
    .select("*, organisations(*)")
    .eq("id", deploymentId)
    .single();
  if (error || !deployment) throw new Error(error?.message ?? "Deployment not found");
  const org = deployment.organisations as DeploymentContext["org"];

  const [{ data: baselines }, runs, costs, human] = await Promise.all([
    db
      .from("baselines")
      .select("*")
      .eq("deployment_id", deploymentId)
      .order("captured_at", { ascending: false })
      .limit(1),
    fetchAll<{ started_at: string; status: "success" | "failed" | "needs_human"; token_cost: unknown }>(
      (from, to) =>
        db
          .from("runs")
          .select("started_at, status, token_cost")
          .eq("deployment_id", deploymentId)
          .order("started_at")
          .order("id")
          .range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      db.from("cost_entries").select("*").eq("deployment_id", deploymentId).order("id").range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      db.from("human_time_logs").select("*").eq("deployment_id", deploymentId).order("id").range(from, to),
    ),
  ]);
  const b = baselines?.[0] ?? null;

  const input: RoiInput = {
    asOf,
    org: {
      currency: org.currency,
      defaultLoadedHourlyRate: Number(org.default_loaded_hourly_rate ?? 0),
      flagThresholds: (org.flag_thresholds as RoiInput["org"]["flagThresholds"]) ?? null,
    },
    deployment: {
      status: deployment.status,
      goLiveDate: deployment.go_live_date,
      predictedMonthlyValue: num(deployment.predicted_monthly_value),
      predictedMonthlyCost: num(deployment.predicted_monthly_cost),
    },
    baseline: b
      ? {
          volumePerMonth: Number(b.volume_per_month),
          minutesPerTask: Number(b.minutes_per_task),
          loadedHourlyRate: Number(b.loaded_hourly_rate),
          errorRate: num(b.error_rate),
          aiErrorRate: num(b.ai_error_rate),
          costPerError: num(b.cost_per_error),
          source: b.source,
        }
      : null,
    runs: runs.map((r) => ({ startedAt: r.started_at, status: r.status, tokenCost: num(r.token_cost) })),
    costEntries: costs.map((c) => ({
      category: c.category as RoiInput["costEntries"][number]["category"],
      isOneOff: Boolean(c.is_one_off),
      amount: Number(c.amount),
      periodStart: String(c.period_start),
      periodEnd: String(c.period_end),
    })),
    humanTime: human.map((h) => ({
      periodStart: String(h.period_start),
      periodEnd: String(h.period_end),
      minutes: Number(h.minutes),
      hourlyRate: num(h.hourly_rate),
    })),
  };

  return { deployment, org, baseline: b, input };
}

export interface SnapshotChange {
  deploymentId: string;
  orgId: string;
  name: string;
  currency: string;
  previous: { flag: string; as_of: string; cost_per_successful_run: number | null } | null;
  result: RoiResult;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Recalculates one deployment and upserts today's snapshot. */
export async function recalculateDeployment(
  db: AdminClient,
  deploymentId: string,
  asOf = todayUtc(),
): Promise<SnapshotChange> {
  const ctx = await loadDeploymentContext(db, deploymentId, asOf);
  const result = calculateRoi(ctx.input);

  const { data: prev } = await db
    .from("roi_snapshots")
    .select("flag, as_of, cost_per_successful_run")
    .eq("deployment_id", deploymentId)
    .lt("as_of", asOf)
    .order("as_of", { ascending: false })
    .limit(1);

  const { error } = await db.from("roi_snapshots").upsert(
    {
      org_id: ctx.org.id,
      deployment_id: deploymentId,
      as_of: asOf,
      cost_one_off: result.costOneOff,
      cost_running: result.costRunning,
      cost_human: result.costHuman,
      cost_total: result.costTotal,
      value_total: result.valueTotal,
      net: result.net,
      roi: result.roi,
      payback_date: result.paybackDate,
      payback_projected: result.paybackProjected,
      cost_per_successful_run: result.costPerSuccessfulRun,
      success_rate: result.successRate,
      human_touch_rate: result.humanTouchRate,
      confidence: result.confidence,
      flag: result.flag,
      inputs: result.inputs,
    },
    { onConflict: "deployment_id,as_of" },
  );
  if (error) throw new Error(error.message);

  const p = prev?.[0];
  return {
    deploymentId,
    orgId: ctx.org.id,
    name: ctx.deployment.name,
    currency: ctx.org.currency,
    previous: p
      ? { flag: p.flag, as_of: p.as_of, cost_per_successful_run: num(p.cost_per_successful_run) }
      : null,
    result,
  };
}
