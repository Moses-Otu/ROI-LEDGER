import { z } from "zod";

export const MAX_BATCH = 500;

/**
 * Metadata must stay metadata: flat primitives, short strings, and no keys that
 * suggest prompt or output content.
 */
const FORBIDDEN_METADATA_KEYS =
  /^(prompt|prompts|input|inputs|output|outputs|completion|completions|messages?|content|response|text|body)$/i;

export const metadataSchema = z
  .record(z.string().max(64), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
  .refine((m) => Object.keys(m).length <= 30, "metadata: at most 30 keys")
  .refine(
    (m) => !Object.keys(m).some((k) => FORBIDDEN_METADATA_KEYS.test(k)),
    "metadata must not contain prompt/output content (metadata only)",
  );

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

/** Identify the deployment by id, or by any value in its external_refs. */
const deploymentTarget = {
  // guid(): any 8-4-4-4-12 id; z.uuid() would reject ids without an RFC version nibble.
  deployment_id: z.guid().optional(),
  deployment_ref: z.string().min(1).max(200).optional(),
};

function hasTarget(r: { deployment_id?: string; deployment_ref?: string }) {
  return !!(r.deployment_id || r.deployment_ref);
}
const targetMessage = { message: "deployment_id or deployment_ref is required" };

export const runRecordSchema = z
  .object({
    ...deploymentTarget,
    external_id: z.string().min(1).max(200),
    source: z.enum(["n8n", "langfuse", "openrouter", "push", "csv", "manual"]).default("push"),
    started_at: isoDateTime,
    finished_at: isoDateTime.nullish(),
    status: z.enum(["success", "failed", "needs_human"]),
    token_cost: z.number().nonnegative().nullish(),
    tokens_in: z.number().int().nonnegative().nullish(),
    tokens_out: z.number().int().nonnegative().nullish(),
    model: z.string().max(200).nullish(),
    metadata: metadataSchema.optional(),
  })
  .refine(hasTarget, targetMessage)
  .refine((r) => !r.finished_at || Date.parse(r.finished_at) >= Date.parse(r.started_at), {
    message: "finished_at must be after started_at",
  });

const costCategory = z.enum([
  "build",
  "setup",
  "training",
  "licence",
  "tokens",
  "hosting",
  "tooling",
  "maintenance",
  "other",
]);

export const costRecordSchema = z
  .object({
    ...deploymentTarget,
    category: costCategory,
    is_one_off: z.boolean(),
    amount: z.number().nonnegative(),
    period_start: isoDate,
    period_end: isoDate,
    external_id: z.string().min(1).max(200).nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .refine(hasTarget, targetMessage)
  .refine((r) => r.period_end >= r.period_start, { message: "period_end must be on/after period_start" });

export const humanTimeRecordSchema = z
  .object({
    ...deploymentTarget,
    period_start: isoDate,
    period_end: isoDate,
    activity: z.enum(["review", "fix", "escalation", "maintenance"]),
    minutes: z.number().nonnegative().max(100_000),
    hourly_rate: z.number().nonnegative().nullish(),
    logged_by: z.string().max(200).nullish(),
    external_id: z.string().min(1).max(200).nullish(),
  })
  .refine(hasTarget, targetMessage)
  .refine((r) => r.period_end >= r.period_start, { message: "period_end must be on/after period_start" });

export type RunRecord = z.infer<typeof runRecordSchema>;
export type CostRecord = z.infer<typeof costRecordSchema>;
export type HumanTimeRecord = z.infer<typeof humanTimeRecordSchema>;

export const ingestSchemas = {
  runs: runRecordSchema,
  costs: costRecordSchema,
  "human-time": humanTimeRecordSchema,
} as const;
export type IngestKind = keyof typeof ingestSchemas;

/** Accepts `{ records: [...] }`, a bare array, or a single record. */
export function extractRecords(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && Array.isArray((body as { records?: unknown }).records)) {
    return (body as { records: unknown[] }).records;
  }
  return body === undefined || body === null ? [] : [body];
}

export interface RecordError {
  index: number;
  error: string;
}

export function validateRecords<S extends z.ZodType>(
  schema: S,
  records: unknown[],
): { valid: { index: number; record: z.infer<S> }[]; errors: RecordError[] } {
  const valid: { index: number; record: z.infer<S> }[] = [];
  const errors: RecordError[] = [];
  records.forEach((r, index) => {
    const parsed = schema.safeParse(r);
    if (parsed.success) valid.push({ index, record: parsed.data });
    else
      errors.push({
        index,
        error: parsed.error.issues.map((i) => `${i.path.join(".") || "record"}: ${i.message}`).join("; "),
      });
  });
  return { valid, errors };
}
