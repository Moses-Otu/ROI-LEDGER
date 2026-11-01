import { flattenRefs } from "@/lib/ingest/resolve";
import { fetchJson, joinUrl } from "./http";
import { n8nExternalId, usdConverter, type Connector, type ConnectorContext, type NormalisedRun } from "./types";

/**
 * Langfuse public API (checked against cloud.langfuse.com/generated/api/openapi.yml):
 * - Auth: HTTP Basic, public key as username, secret key as password.
 * - GET /api/public/projects → { data: [{ id, name, ... }] }
 * - GET /api/public/v2/observations: cursor pagination (meta.cursor), `fields` groups,
 *   structured `filter` JSON. Costs (`totalCost`) are in USD.
 *
 * Only `core,basic,usage,model,metadata,trace_context` are requested; never `io`,
 * so prompt/output content is not fetched at all.
 */
interface ObservationV2 {
  id: string;
  traceId: string | null;
  startTime: string;
  endTime: string | null;
  type: string;
  level?: string;
  model?: string | null;
  usageDetails?: Record<string, number> | null;
  totalCost?: number | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}

interface ObservationsV2Response {
  data: ObservationV2[];
  meta: { cursor?: string | null };
}

const PAGE_LIMIT = 1000;
const MAX_PAGES = 200;

export function langfuseConnector(ctx: ConnectorContext): Connector {
  const base = String(ctx.config.base_url || "https://cloud.langfuse.com");
  const { public_key, secret_key } = ctx.credentials;
  const headers = {
    authorization: `Basic ${Buffer.from(`${public_key}:${secret_key}`).toString("base64")}`,
  };
  const executionKey = String(ctx.config.execution_id_key || "n8n_execution_id");
  const defaultDeployment = (ctx.config.default_deployment_id as string) || null;

  // Trace tag → deployment, from each deployment's external_refs.langfuse_tags.
  const tagIndex = new Map<string, string>();
  for (const d of ctx.deployments) {
    for (const t of flattenRefs({ t: (d.external_refs ?? {}).langfuse_tags })) tagIndex.set(t, d.id);
  }

  return {
    async testConnection() {
      try {
        const res = await fetchJson<{ data: { id: string; name: string }[] }>(
          ctx.fetch,
          joinUrl(base, "/api/public/projects"),
          { headers },
          { sleep: ctx.sleep, retries: 1 },
        );
        const name = res.data?.[0]?.name;
        return { ok: true, message: name ? `Connected to project "${name}"` : "Connected" };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },

    async fetchRuns(since, until) {
      const convert = usdConverter(ctx);
      const filter = JSON.stringify([
        { type: "datetime", column: "startTime", operator: ">=", value: since.toISOString() },
        { type: "datetime", column: "startTime", operator: "<", value: until.toISOString() },
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
      ]);

      const observations: ObservationV2[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetchJson<ObservationsV2Response>(
          ctx.fetch,
          joinUrl(base, "/api/public/v2/observations", {
            fields: "core,basic,usage,model,metadata,trace_context",
            limit: String(PAGE_LIMIT),
            filter,
            cursor,
          }),
          { headers },
          { sleep: ctx.sleep },
        );
        observations.push(...(res.data ?? []));
        cursor = res.meta?.cursor ?? undefined;
        if (!cursor) break;
      }

      // One run per trace. Generations of a trace are summed.
      const byTrace = new Map<string, ObservationV2[]>();
      for (const o of observations) {
        const key = o.traceId ?? o.id;
        const list = byTrace.get(key);
        if (list) list.push(o);
        else byTrace.set(key, [o]);
      }

      const runs: NormalisedRun[] = [];
      for (const [traceId, obs] of byTrace) {
        const tags = obs.flatMap((o) => o.tags ?? []);
        const deploymentId = tags.map((t) => tagIndex.get(t)).find(Boolean) ?? defaultDeployment;
        if (!deploymentId) continue;

        // Match the n8n execution when the workflow put its id in metadata.
        // TODO: trace-level metadata isn't exposed on v2 observations; this reads
        // the generation's own metadata, so the key must be set on the generation.
        const executionId = obs
          .map((o) => o.metadata?.[executionKey])
          .find((v) => typeof v === "string" || typeof v === "number");

        let cost: number | null = null;
        let tokensIn = 0;
        let tokensOut = 0;
        let started = obs[0].startTime;
        let finished: string | null = null;
        for (const o of obs) {
          if (typeof o.totalCost === "number") cost = (cost ?? 0) + o.totalCost;
          tokensIn += Number(o.usageDetails?.input ?? 0);
          tokensOut += Number(o.usageDetails?.output ?? 0);
          if (o.startTime < started) started = o.startTime;
          if (o.endTime && (!finished || o.endTime > finished)) finished = o.endTime;
        }

        runs.push({
          deployment_id: deploymentId,
          external_id: executionId !== undefined ? n8nExternalId(String(executionId)) : `langfuse:${traceId}`,
          source: "langfuse",
          started_at: started,
          finished_at: finished,
          status: obs.some((o) => o.level === "ERROR") ? "failed" : "success",
          token_cost: cost === null ? null : convert(cost),
          tokens_in: tokensIn || null,
          tokens_out: tokensOut || null,
          model: obs.at(-1)?.model ?? null,
          metadata: {
            langfuse_trace_id: traceId,
            generations: obs.length,
            ...(cost !== null ? { cost_usd: Math.round(cost * 1e6) / 1e6 } : {}),
          },
        });
      }
      return runs;
    },

    async fetchCosts() {
      return []; // Langfuse costs are per run.
    },
  };
}
