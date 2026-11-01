import type { DeploymentRefs } from "@/lib/ingest/resolve";
import type { FetchLike } from "./http";

export type ConnectorType = "langfuse" | "openrouter" | "n8n";

/** A run ready for upsert_runs. external_id follows the shared `n8n:<executionId>` convention. */
export interface NormalisedRun {
  deployment_id: string;
  external_id: string;
  source: "n8n" | "langfuse" | "openrouter";
  started_at: string;
  finished_at: string | null;
  status: "success" | "failed" | "needs_human";
  token_cost: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  model: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface NormalisedCost {
  deployment_id: string;
  category: "tokens";
  is_one_off: false;
  amount: number;
  period_start: string;
  period_end: string;
  external_id: string;
  notes: string | null;
}

export interface ConnectorContext {
  config: Record<string, unknown>;
  credentials: Record<string, string>;
  deployments: DeploymentRefs[];
  /** Org currency; USD amounts from providers are converted with config.usd_rate. */
  currency: string;
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export interface Connector {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  fetchRuns(since: Date, until: Date): Promise<NormalisedRun[]>;
  fetchCosts(since: Date, until: Date): Promise<NormalisedCost[]>;
}

/** USD → org currency. Requires config.usd_rate unless the org is in USD. */
export function usdConverter(ctx: ConnectorContext): (usd: number) => number {
  if (ctx.currency === "USD") return (usd) => usd;
  const rate = Number(ctx.config.usd_rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Set "USD → ${ctx.currency} rate" on this connector: provider costs are in USD`);
  }
  return (usd) => usd * rate;
}

export function n8nExternalId(executionId: string | number): string {
  return `n8n:${executionId}`;
}
