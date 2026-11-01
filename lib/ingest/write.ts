import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { contentId } from "./ids";
import { buildRefIndex, resolveDeployment } from "./resolve";
import {
  ingestSchemas,
  MAX_BATCH,
  validateRecords,
  type CostRecord,
  type HumanTimeRecord,
  type IngestKind,
  type RecordError,
  type RunRecord,
} from "./schemas";

export interface IngestResult {
  received: number;
  written: number;
  errors: RecordError[];
  deploymentIds: string[];
}

export class IngestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Validates, resolves deployments and upserts one batch for an organisation.
 * Invalid or unmatched records are reported by index; the rest are written.
 */
export async function ingestBatch(
  db: AdminClient,
  orgId: string,
  kind: IngestKind,
  records: unknown[],
  source: "push" | "csv" = "push",
): Promise<IngestResult> {
  if (records.length === 0) throw new IngestError("No records in request");
  if (records.length > MAX_BATCH) throw new IngestError(`At most ${MAX_BATCH} records per request`);

  const { valid, errors } = validateRecords(ingestSchemas[kind], records);

  const { data: deployments, error } = await db
    .from("deployments")
    .select("id, external_refs")
    .eq("org_id", orgId);
  if (error) throw new IngestError(error.message, 500);
  const ids = new Set((deployments ?? []).map((d) => d.id as string));
  const refIndex = buildRefIndex(deployments ?? []);

  const rows: Record<string, unknown>[] = [];
  const touched = new Set<string>();
  for (const { index, record } of valid) {
    const deploymentId = resolveDeployment(record, ids, refIndex);
    if (!deploymentId) {
      errors.push({ index, error: "No deployment matches deployment_id/deployment_ref in this organisation" });
      continue;
    }
    touched.add(deploymentId);
    rows.push(toRow(kind, deploymentId, record, source));
  }

  let written = 0;
  if (rows.length) {
    const fn = { runs: "upsert_runs", costs: "upsert_cost_entries", "human-time": "upsert_human_time" }[kind];
    const { data, error: rpcError } = await db.rpc(fn, { p_org: orgId, p_rows: dedupe(rows) });
    if (rpcError) throw new IngestError(rpcError.message, 500);
    written = Number(data ?? 0);
  }

  errors.sort((a, b) => a.index - b.index);
  return { received: records.length, written, errors, deploymentIds: [...touched] };
}

function toRow(
  kind: IngestKind,
  deploymentId: string,
  record: RunRecord | CostRecord | HumanTimeRecord,
  source: "push" | "csv",
): Record<string, unknown> {
  if (kind === "runs") {
    const r = record as RunRecord;
    return {
      deployment_id: deploymentId,
      external_id: r.external_id,
      source: source === "csv" ? "csv" : r.source,
      started_at: r.started_at,
      finished_at: r.finished_at ?? null,
      status: r.status,
      token_cost: r.token_cost ?? null,
      tokens_in: r.tokens_in ?? null,
      tokens_out: r.tokens_out ?? null,
      model: r.model ?? null,
      metadata: r.metadata ?? {},
    };
  }
  if (kind === "costs") {
    const r = record as CostRecord;
    return {
      deployment_id: deploymentId,
      category: r.category,
      is_one_off: r.is_one_off,
      amount: r.amount,
      period_start: r.period_start,
      period_end: r.period_end,
      external_id:
        r.external_id ??
        contentId(source, [deploymentId, r.category, r.is_one_off, r.amount, r.period_start, r.period_end]),
      notes: r.notes ?? null,
    };
  }
  const r = record as HumanTimeRecord;
  return {
    deployment_id: deploymentId,
    period_start: r.period_start,
    period_end: r.period_end,
    activity: r.activity,
    minutes: r.minutes,
    hourly_rate: r.hourly_rate ?? null,
    logged_by: r.logged_by ?? null,
    source,
    external_id:
      r.external_id ??
      contentId(source, [deploymentId, r.period_start, r.period_end, r.activity, r.minutes, r.logged_by ?? null]),
  };
}

/** Postgres can't update one row twice in a statement: last record per key wins. */
function dedupe(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) byKey.set(`${row.deployment_id}|${row.external_id}`, row);
  return [...byKey.values()];
}
