import { fromDay, toDay } from "@/lib/roi/dates";
import { fetchJson, joinUrl } from "./http";
import { usdConverter, type Connector, type ConnectorContext, type NormalisedCost } from "./types";

/**
 * OpenRouter (checked against openrouter.ai/openapi.json):
 * - Auth: Bearer management key (the activity and keys APIs refuse inference keys).
 * - GET /api/v1/keys?offset=N → { data: [{ hash, label, name, disabled, ... }] }
 * - GET /api/v1/activity?date=YYYY-MM-DD&api_key_hash=H → { data: [{ date, model, usage, requests, prompt_tokens, completion_tokens, ... }] }
 *   Covers only the last 30 completed UTC days. `usage` is in USD.
 *
 * OpenRouter has no per-request listing here, so it reports daily token cost
 * entries per key. The ROI module drops them for days that already have per-run
 * token cost (e.g. from Langfuse).
 */
interface OpenRouterKey {
  hash: string;
  label?: string | null;
  name?: string | null;
  disabled?: boolean;
}

interface ActivityItem {
  date: string;
  model: string;
  usage: number;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
}

const BASE = "https://openrouter.ai/api/v1";
const ACTIVITY_DAYS = 30;

export function openRouterConnector(ctx: ConnectorContext): Connector {
  const headers = { authorization: `Bearer ${ctx.credentials.management_key}` };
  const base = String(ctx.config.base_url || BASE);

  async function listKeys(): Promise<OpenRouterKey[]> {
    const out: OpenRouterKey[] = [];
    for (let offset = 0; offset < 10_000; ) {
      const res = await fetchJson<{ data: OpenRouterKey[] }>(
        ctx.fetch,
        joinUrl(base, "/keys", { offset: String(offset), include_disabled: "true" }),
        { headers },
        { sleep: ctx.sleep },
      );
      const page = res.data ?? [];
      out.push(...page);
      if (page.length === 0) break;
      offset += page.length;
    }
    return out;
  }

  return {
    async testConnection() {
      try {
        const keys = await listKeys();
        return { ok: true, message: `Connected: ${keys.length} API key(s) visible` };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },

    async fetchRuns() {
      return [];
    },

    async fetchCosts(since, until) {
      const convert = usdConverter(ctx);
      const labelToDeployment = new Map<string, string>();
      for (const d of ctx.deployments) {
        const label = (d.external_refs ?? {}).openrouter_key_label;
        if (typeof label === "string" && label.trim()) labelToDeployment.set(label.trim(), d.id);
      }
      if (labelToDeployment.size === 0) return [];

      const keys = (await listKeys()).flatMap((k) => {
        const id = labelToDeployment.get((k.label ?? "").trim()) ?? labelToDeployment.get((k.name ?? "").trim());
        return id ? [{ ...k, deploymentId: id }] : [];
      });

      const today = toDay(new Date().toISOString());
      const first = Math.max(toDay(since.toISOString()), today - ACTIVITY_DAYS);
      const last = Math.min(toDay(until.toISOString()), today) - 1; // completed days only

      const costs: NormalisedCost[] = [];
      for (const key of keys) {
        for (let day = first; day <= last; day++) {
          const date = fromDay(day);
          const res = await fetchJson<{ data: ActivityItem[] }>(
            ctx.fetch,
            joinUrl(base, "/activity", { date, api_key_hash: key.hash }),
            { headers },
            { sleep: ctx.sleep },
          );
          const items = res.data ?? [];
          const usd = items.reduce((s, i) => s + Number(i.usage ?? 0), 0);
          if (usd <= 0) continue;
          const requests = items.reduce((s, i) => s + Number(i.requests ?? 0), 0);
          costs.push({
            deployment_id: key.deploymentId,
            category: "tokens",
            is_one_off: false,
            amount: Math.round(convert(usd) * 100) / 100,
            period_start: date,
            period_end: date,
            external_id: `openrouter:${key.hash.slice(0, 16)}:${date}`,
            notes: `OpenRouter ${key.label ?? key.name ?? "key"}: ${requests} requests, $${usd.toFixed(4)}`,
          });
        }
      }
      return costs;
    },
  };
}
