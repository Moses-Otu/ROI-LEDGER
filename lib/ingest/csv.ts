import Papa from "papaparse";
import type { IngestKind } from "./schemas";

/** Column order for each CSV template. `deployment_ref` may hold an id or any external ref. */
export const CSV_COLUMNS: Record<IngestKind, string[]> = {
  runs: [
    "deployment_ref",
    "external_id",
    "started_at",
    "finished_at",
    "status",
    "token_cost",
    "tokens_in",
    "tokens_out",
    "model",
  ],
  costs: ["deployment_ref", "category", "is_one_off", "amount", "period_start", "period_end", "external_id", "notes"],
  "human-time": [
    "deployment_ref",
    "period_start",
    "period_end",
    "activity",
    "minutes",
    "hourly_rate",
    "logged_by",
    "external_id",
  ],
};

export const CSV_EXAMPLES: Record<IngestKind, string[][]> = {
  runs: [
    ["procuremate", "exec-1001", "2026-10-01T09:00:00Z", "2026-10-01T09:03:10Z", "success", "12.50", "1800", "400", "openai/gpt-4o-mini"],
    ["procuremate", "exec-1002", "2026-10-01T09:20:00Z", "2026-10-01T09:24:00Z", "needs_human", "15.10", "2100", "520", "openai/gpt-4o-mini"],
  ],
  costs: [
    ["procuremate", "build", "true", "1500000", "2026-04-01", "2026-04-30", "build-v1", "Initial build"],
    ["procuremate", "hosting", "false", "45000", "2026-10-01", "2026-10-31", "", "n8n hosting"],
  ],
  "human-time": [
    ["procuremate", "2026-10-06", "2026-10-12", "review", "240", "", "Ada", ""],
    ["procuremate", "2026-10-06", "2026-10-12", "fix", "45", "", "Ada", ""],
  ],
};

const NUMERIC = new Set(["token_cost", "tokens_in", "tokens_out", "amount", "minutes", "hourly_rate"]);
const BOOLEAN = new Set(["is_one_off"]);

export function csvTemplate(kind: IngestKind): string {
  return Papa.unparse({ fields: CSV_COLUMNS[kind], data: CSV_EXAMPLES[kind] });
}

export interface ParsedCsv {
  records: Record<string, unknown>[];
  /** Parse-level problems (bad quoting, unknown columns). Validation happens server-side. */
  problems: string[];
}

/** Turns CSV text into plain records with typed numbers/booleans; blanks are omitted. */
export function parseCsv(kind: IngestKind, text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const problems = result.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  const allowed = new Set([...CSV_COLUMNS[kind], "deployment_id"]);
  const unknown = (result.meta.fields ?? []).filter((f) => !allowed.has(f));
  if (unknown.length) problems.push(`Ignored unknown column(s): ${unknown.join(", ")}`);

  const records = result.data.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(row)) {
      if (!allowed.has(key)) continue;
      const v = (raw ?? "").trim();
      if (v === "") continue;
      if (NUMERIC.has(key)) out[key] = Number(v.replace(/,/g, ""));
      else if (BOOLEAN.has(key)) out[key] = /^(true|yes|1|y)$/i.test(v);
      else out[key] = v;
    }
    return out;
  });
  return { records, problems };
}
