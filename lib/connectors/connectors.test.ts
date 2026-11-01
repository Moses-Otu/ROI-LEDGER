import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, encryptSecret } from "@/lib/crypto/aes-gcm";
import { fetchJson, type FetchLike } from "./http";
import { langfuseConnector } from "./langfuse";
import { mapN8nStatus, n8nConnector } from "./n8n";
import { openRouterConnector } from "./openrouter";
import type { ConnectorContext } from "./types";

const noSleep = async () => {};

/** Route requests by pathname to canned JSON; records every URL. */
function mockFetch(routes: Record<string, (url: URL) => unknown>) {
  const calls: URL[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    calls.push(url);
    (fetchImpl as unknown as { lastHeaders: unknown }).lastHeaders = init?.headers;
    const handler = Object.entries(routes).find(([p]) => url.pathname.endsWith(p))?.[1];
    if (!handler) return new Response("not found", { status: 404 });
    return Response.json(handler(url));
  };
  return { fetchImpl, calls };
}

function ctx(overrides: Partial<ConnectorContext>): ConnectorContext {
  return {
    config: {},
    credentials: {},
    deployments: [
      {
        id: "dep-1",
        external_refs: { langfuse_tags: ["procuremate"], n8n_workflow_ids: ["wf1"], openrouter_key_label: "procure" },
      },
    ],
    currency: "NGN",
    fetch: async () => new Response("unused", { status: 500 }),
    sleep: noSleep,
    ...overrides,
  };
}

describe("fetchJson", () => {
  it("retries on 429 then succeeds", async () => {
    let n = 0;
    const f: FetchLike = async () =>
      ++n < 3 ? new Response("slow down", { status: 429, headers: { "retry-after": "1" } }) : Response.json({ ok: 1 });
    const slept: number[] = [];
    await expect(fetchJson(f, "https://x.test/a", {}, { sleep: async (ms) => void slept.push(ms) })).resolves.toEqual({ ok: 1 });
    expect(slept).toEqual([1000, 1000]);
  });

  it("does not retry 4xx and hides query strings in errors", async () => {
    let n = 0;
    const f: FetchLike = async () => (n++, new Response("bad", { status: 401 }));
    await expect(fetchJson(f, "https://x.test/a?token=secret", {}, { sleep: noSleep })).rejects.toThrow(
      /401 from https:\/\/x\.test\/a: bad/,
    );
    expect(n).toBe(1);
  });
});

describe("langfuse", () => {
  it("groups generations per trace, converts USD and maps by tag", async () => {
    const { fetchImpl, calls } = mockFetch({
      "/api/public/v2/observations": (url) =>
        url.searchParams.get("cursor")
          ? {
              data: [
                { id: "o3", traceId: "t2", type: "GENERATION", startTime: "2026-10-01T10:00:00Z", endTime: "2026-10-01T10:00:05Z", tags: ["other"], totalCost: 1 },
              ],
              meta: {},
            }
          : {
              data: [
                { id: "o1", traceId: "t1", type: "GENERATION", startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T09:00:10Z", tags: ["procuremate"], totalCost: 0.01, usageDetails: { input: 100, output: 20 }, model: "gpt-4o-mini", metadata: { n8n_execution_id: "555" } },
                { id: "o2", traceId: "t1", type: "GENERATION", startTime: "2026-10-01T09:01:00Z", endTime: "2026-10-01T09:02:00Z", tags: ["procuremate"], totalCost: 0.02, usageDetails: { input: 50, output: 10 }, model: "gpt-4o-mini", level: "ERROR" },
              ],
              meta: { cursor: "next" },
            },
    });
    const c = langfuseConnector(ctx({ fetch: fetchImpl, config: { usd_rate: 1500 }, credentials: { public_key: "pk", secret_key: "sk" } }));
    const runs = await c.fetchRuns(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-02T00:00:00Z"));

    expect(runs).toHaveLength(1); // t2 has no matching tag
    expect(runs[0]).toMatchObject({
      deployment_id: "dep-1",
      external_id: "n8n:555", // merges with the n8n execution row
      source: "langfuse",
      started_at: "2026-10-01T09:00:00Z",
      finished_at: "2026-10-01T09:02:00Z",
      status: "failed",
      tokens_in: 150,
      tokens_out: 30,
    });
    expect(runs[0].token_cost).toBeCloseTo(45, 6);
    const fields = calls[0].searchParams.get("fields")!;
    expect(fields).not.toContain("io"); // never fetch content
    expect(JSON.parse(calls[0].searchParams.get("filter")!)).toContainEqual({
      type: "string",
      column: "type",
      operator: "=",
      value: "GENERATION",
    });
  });

  it("requires a USD rate for non-USD orgs", async () => {
    const { fetchImpl } = mockFetch({ "/api/public/v2/observations": () => ({ data: [], meta: {} }) });
    const c = langfuseConnector(ctx({ fetch: fetchImpl }));
    await expect(c.fetchRuns(new Date(), new Date())).rejects.toThrow(/USD/);
  });
});

describe("n8n", () => {
  it("maps statuses", () => {
    expect(mapN8nStatus("success")).toBe("success");
    expect(mapN8nStatus("crashed")).toBe("failed");
    expect(mapN8nStatus("waiting")).toBe("needs_human");
    expect(mapN8nStatus("running")).toBeNull();
  });

  it("pages until executions are older than since, without execution data", async () => {
    const { fetchImpl, calls } = mockFetch({
      "/api/v1/executions": (url) =>
        url.searchParams.get("cursor")
          ? {
              data: [
                { id: 2, status: "error", startedAt: "2026-10-01T09:00:00Z", stoppedAt: "2026-10-01T09:01:00Z", workflowId: "wf1" },
                { id: 1, status: "success", startedAt: "2026-09-29T09:00:00Z", stoppedAt: "2026-09-29T09:01:00Z", workflowId: "wf1" },
              ],
              nextCursor: "more",
            }
          : {
              data: [
                { id: 4, status: "running", startedAt: "2026-10-01T11:00:00Z", stoppedAt: null, workflowId: "wf1" },
                { id: 3, status: "success", startedAt: "2026-10-01T10:00:00Z", stoppedAt: "2026-10-01T10:03:00Z", workflowId: "wf1" },
              ],
              nextCursor: "c1",
            },
    });
    const c = n8nConnector(ctx({ fetch: fetchImpl, config: { base_url: "https://n8n.test/api/v1/" }, credentials: { api_key: "k" } }));
    const runs = await c.fetchRuns(new Date("2026-09-30T00:00:00Z"), new Date("2026-10-02T00:00:00Z"));

    expect(runs.map((r) => [r.external_id, r.status])).toEqual([
      ["n8n:3", "success"],
      ["n8n:2", "failed"],
    ]);
    expect(calls).toHaveLength(2); // stopped after reaching older executions
    expect(calls[0].pathname).toBe("/api/v1/executions");
    expect(calls[0].searchParams.get("includeData")).toBe("false");
    expect(calls[0].searchParams.get("workflowId")).toBe("wf1");
  });
});

describe("openrouter", () => {
  it("creates one daily token cost entry per mapped key", async () => {
    const today = new Date();
    const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
    const day = yesterday.toISOString().slice(0, 10);
    const { fetchImpl, calls } = mockFetch({
      "/keys": (url) =>
        url.searchParams.get("offset") === "0"
          ? { data: [{ hash: "a".repeat(64), label: "procure" }, { hash: "b".repeat(64), label: "unmapped" }] }
          : { data: [] },
      "/activity": (url) =>
        url.searchParams.get("date") === day
          ? { data: [{ date: day, model: "m", usage: 0.5, requests: 10, prompt_tokens: 1, completion_tokens: 1 }, { date: day, model: "n", usage: 0.25, requests: 5, prompt_tokens: 1, completion_tokens: 1 }] }
          : { data: [] },
    });
    const c = openRouterConnector(ctx({ fetch: fetchImpl, config: { usd_rate: 1600 }, credentials: { management_key: "mk" } }));
    const since = new Date(yesterday.getTime() - 86_400_000);
    const costs = await c.fetchCosts(since, today);

    expect(costs).toEqual([
      expect.objectContaining({
        deployment_id: "dep-1",
        category: "tokens",
        amount: 1200,
        period_start: day,
        period_end: day,
        external_id: `openrouter:${"a".repeat(16)}:${day}`,
      }),
    ]);
    const activityCalls = calls.filter((u) => u.pathname.endsWith("/activity"));
    expect(activityCalls.every((u) => u.searchParams.get("api_key_hash") === "a".repeat(64))).toBe(true);
  });
});

describe("credential encryption", () => {
  const key = Buffer.alloc(32, 7).toString("base64");

  it("round-trips and uses a fresh IV each time", () => {
    const creds = { api_key: "secret-value" };
    const a = encryptJson(creds, key);
    expect(a).not.toContain("secret-value");
    expect(encryptJson(creds, key)).not.toBe(a);
    expect(decryptJson(a, key)).toEqual(creds);
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const token = encryptSecret("x", key);
    const parts = token.split(".");
    parts[3] = Buffer.from("y").toString("base64url");
    expect(() => decryptJson(parts.join("."), key)).toThrow();
    expect(() => decryptJson(token, Buffer.alloc(32, 8).toString("base64"))).toThrow();
  });
});
