import { fetchJson, joinUrl } from "./http";
import { n8nExternalId, type Connector, type ConnectorContext, type NormalisedRun } from "./types";

/**
 * n8n public API (checked against n8n-io/n8n master,
 * packages/cli/src/public-api/v1/handlers/executions/spec/paths/getExecutions.generated.yml):
 * - Auth: X-N8N-API-KEY header. Base path /api/v1.
 * - GET /executions?workflowId&limit(≤250)&cursor&includeData=false&startedAfter
 *   → { data: [{ id, status, startedAt, stoppedAt, workflowId, mode, retryOf, ... }], nextCursor }
 *
 * `startedAfter` is recent; older n8n versions ignore it, so paging also stops
 * once executions are older than `since` (results come newest first).
 * includeData stays false: execution data can hold content.
 */
interface Execution {
  id: string | number;
  status: "canceled" | "crashed" | "error" | "new" | "running" | "success" | "unknown" | "waiting";
  startedAt: string | null;
  stoppedAt: string | null;
  workflowId: string;
  mode?: string;
  retryOf?: string | null;
}

const LIMIT = 250;
const MAX_PAGES = 400;

export function mapN8nStatus(s: Execution["status"]): NormalisedRun["status"] | null {
  switch (s) {
    case "success":
      return "success";
    case "error":
    case "crashed":
    case "canceled":
      return "failed";
    case "waiting":
      return "needs_human"; // paused on a Wait/approval step
    default:
      return null; // new/running/unknown: picked up by a later sync
  }
}

export function n8nConnector(ctx: ConnectorContext): Connector {
  const base = String(ctx.config.base_url ?? "").replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  const headers = { "x-n8n-api-key": ctx.credentials.api_key };
  const api = (path: string, q: Record<string, string | undefined> = {}) => joinUrl(`${base}/api/v1/`, path, q);

  const workflowToDeployment = new Map<string, string>();
  for (const d of ctx.deployments) {
    const ids = (d.external_refs ?? {}).n8n_workflow_ids;
    for (const id of Array.isArray(ids) ? ids : []) workflowToDeployment.set(String(id), d.id);
  }

  return {
    async testConnection() {
      if (!base) return { ok: false, message: "Set the n8n base URL" };
      try {
        await fetchJson(ctx.fetch, api("workflows", { limit: "1" }), { headers }, { sleep: ctx.sleep, retries: 1 });
        return { ok: true, message: `Connected. ${workflowToDeployment.size} workflow(s) mapped to deployments` };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },

    async fetchRuns(since, until) {
      const runs: NormalisedRun[] = [];
      for (const [workflowId, deploymentId] of workflowToDeployment) {
        let cursor: string | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const res = await fetchJson<{ data: Execution[]; nextCursor: string | null }>(
            ctx.fetch,
            api("executions", {
              workflowId,
              limit: String(LIMIT),
              includeData: "false",
              startedAfter: since.toISOString(),
              cursor,
            }),
            { headers },
            { sleep: ctx.sleep },
          );
          let reachedOlder = false;
          for (const e of res.data ?? []) {
            if (!e.startedAt) continue;
            const t = Date.parse(e.startedAt);
            if (t < since.getTime()) {
              reachedOlder = true;
              continue;
            }
            if (t >= until.getTime()) continue;
            const status = mapN8nStatus(e.status);
            if (!status) continue;
            runs.push({
              deployment_id: deploymentId,
              external_id: n8nExternalId(e.id),
              source: "n8n",
              started_at: e.startedAt,
              finished_at: e.stoppedAt,
              status,
              token_cost: null,
              tokens_in: null,
              tokens_out: null,
              model: null,
              metadata: {
                n8n_workflow_id: String(e.workflowId),
                n8n_status: e.status,
                ...(e.mode ? { n8n_mode: e.mode } : {}),
                ...(e.retryOf ? { n8n_retry_of: String(e.retryOf) } : {}),
              },
            });
          }
          cursor = res.nextCursor ?? undefined;
          if (!cursor || reachedOlder) break;
        }
      }
      return runs;
    },

    async fetchCosts() {
      return [];
    },
  };
}
