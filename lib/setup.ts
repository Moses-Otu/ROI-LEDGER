import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SetupStepKey = "details" | "baseline" | "costs" | "time" | "data";

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  path: string;
  done: boolean;
}

export interface SetupProgress {
  steps: SetupStep[];
  complete: boolean;
  /** The first step that isn't done, or null when setup is complete. */
  next: SetupStep | null;
}

const count = async (q: PromiseLike<{ count: number | null }>) => ((await q).count ?? 0) > 0;

/**
 * Which setup steps a deployment has completed, in order:
 * details → baseline → costs → human time → data (runs, or a data source mapped).
 */
export async function getSetupProgress(db: SupabaseClient, deploymentId: string): Promise<SetupProgress> {
  const head = { count: "exact" as const, head: true };
  const [{ data: dep }, hasBaseline, hasCosts, hasTime, hasRuns] = await Promise.all([
    db.from("deployments").select("external_refs").eq("id", deploymentId).maybeSingle(),
    count(db.from("baselines").select("id", head).eq("deployment_id", deploymentId)),
    count(db.from("cost_entries").select("id", head).eq("deployment_id", deploymentId)),
    count(db.from("human_time_logs").select("id", head).eq("deployment_id", deploymentId)),
    count(db.from("runs").select("id", head).eq("deployment_id", deploymentId)),
  ]);
  const refs = (dep?.external_refs ?? {}) as Record<string, unknown>;
  const hasMapping = Object.values(refs).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));

  const base = `/deployments/${deploymentId}`;
  const steps: SetupStep[] = [
    { key: "details", label: "Details", path: `${base}/edit`, done: true },
    { key: "baseline", label: "Baseline", path: `${base}/baseline`, done: hasBaseline },
    { key: "costs", label: "Costs", path: `${base}/costs`, done: hasCosts },
    { key: "time", label: "Human time", path: `${base}/time`, done: hasTime },
    { key: "data", label: "Data", path: `${base}/data`, done: hasRuns || hasMapping },
  ];
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, complete: next === null, next };
}

/** Where to go after saving a step: the next unfinished step, else the dashboard. */
export async function nextSetupHref(db: SupabaseClient, deploymentId: string): Promise<string> {
  const { next } = await getSetupProgress(db, deploymentId);
  return next ? next.path : `/deployments/${deploymentId}`;
}
