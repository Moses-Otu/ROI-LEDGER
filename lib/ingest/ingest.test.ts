import { describe, expect, it } from "vitest";
import { csvTemplate, parseCsv } from "./csv";
import { contentId } from "./ids";
import { generateIngestKey, hashIngestKey } from "./keys";
import { buildRefIndex, resolveDeployment } from "./resolve";
import { extractRecords, ingestSchemas, validateRecords } from "./schemas";

const run = {
  deployment_ref: "wf-1",
  external_id: "exec-1",
  started_at: "2026-10-01T09:00:00Z",
  finished_at: "2026-10-01T09:03:00Z",
  status: "success",
  token_cost: 1.2,
};

describe("schemas", () => {
  it("accepts a valid run and defaults source to push", () => {
    const { valid, errors } = validateRecords(ingestSchemas.runs, [run]);
    expect(errors).toEqual([]);
    expect(valid[0].record.source).toBe("push");
  });

  it("rejects content-like metadata keys (metadata only)", () => {
    const { errors } = validateRecords(ingestSchemas.runs, [{ ...run, metadata: { prompt: "hi" } }]);
    expect(errors[0].error).toMatch(/metadata only/);
  });

  it("requires a deployment target and ordered timestamps", () => {
    const { errors } = validateRecords(ingestSchemas.runs, [
      { ...run, deployment_ref: undefined },
      { ...run, finished_at: "2026-10-01T08:00:00Z" },
    ]);
    expect(errors.map((e) => e.index)).toEqual([0, 1]);
  });

  it("compares timestamps with different offsets correctly", () => {
    const { errors } = validateRecords(ingestSchemas.runs, [
      { ...run, started_at: "2026-10-01T10:00:00+01:00", finished_at: "2026-10-01T09:30:00Z" },
    ]);
    expect(errors).toEqual([]);
  });

  it("validates cost periods", () => {
    const { errors } = validateRecords(ingestSchemas.costs, [
      { deployment_ref: "x", category: "hosting", is_one_off: false, amount: 10, period_start: "2026-10-31", period_end: "2026-10-01" },
    ]);
    expect(errors).toHaveLength(1);
  });

  it("extracts records from {records}, arrays or a single object", () => {
    expect(extractRecords({ records: [1, 2] })).toHaveLength(2);
    expect(extractRecords([1])).toHaveLength(1);
    expect(extractRecords(run)).toHaveLength(1);
  });
});

describe("deployment resolution", () => {
  const deployments = [
    { id: "d1", external_refs: { n8n_workflow_ids: ["wf-1"], openrouter_key_label: "procure" } },
    { id: "d2", external_refs: { n8n_workflow_ids: ["wf-2", "shared"], langfuse_tags: ["shared"] } },
    { id: "d3", external_refs: { langfuse_tags: ["shared"] } },
  ];
  const index = buildRefIndex(deployments);
  const ids = new Set(["d1", "d2", "d3"]);

  it("matches by id or any external ref", () => {
    expect(resolveDeployment({ deployment_id: "d2" }, ids, index)).toBe("d2");
    expect(resolveDeployment({ deployment_ref: "procure" }, ids, index)).toBe("d1");
    expect(resolveDeployment({ deployment_ref: "d3" }, ids, index)).toBe("d3");
  });

  it("refuses unknown ids and ambiguous refs", () => {
    expect(resolveDeployment({ deployment_id: "other-org" }, ids, index)).toBeNull();
    expect(resolveDeployment({ deployment_ref: "shared" }, ids, index)).toBeNull();
  });
});

describe("keys and ids", () => {
  it("stores only a hash and shows a recognisable prefix", () => {
    const { key, prefix, hash } = generateIngestKey();
    expect(key.startsWith(prefix)).toBe(true);
    expect(hash).toBe(hashIngestKey(key));
    expect(hash).not.toContain(key);
  });

  it("derives stable content ids", () => {
    expect(contentId("csv", ["a", 1])).toBe(contentId("csv", ["a", 1]));
    expect(contentId("csv", ["a", 1])).not.toBe(contentId("csv", ["a", 2]));
  });
});

describe("csv", () => {
  it("round-trips its own template into valid records", () => {
    for (const kind of ["runs", "costs", "human-time"] as const) {
      const { records, problems } = parseCsv(kind, csvTemplate(kind));
      expect(problems).toEqual([]);
      const { errors } = validateRecords(ingestSchemas[kind], records);
      expect(errors).toEqual([]);
    }
  });

  it("types numbers and booleans and drops blanks", () => {
    const { records } = parseCsv(
      "costs",
      "Deployment_Ref,category,is_one_off,amount,period_start,period_end,notes\nx,build,yes,\"1,500\",2026-01-01,2026-01-01,\n",
    );
    expect(records[0]).toEqual({
      deployment_ref: "x",
      category: "build",
      is_one_off: true,
      amount: 1500,
      period_start: "2026-01-01",
      period_end: "2026-01-01",
    });
  });
});
