"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/dal";
import { recalculateAndNotify } from "@/lib/ledger/pipeline";
import type { IngestKind, RecordError } from "@/lib/ingest/schemas";
import { IngestError, ingestBatch } from "@/lib/ingest/write";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ImportResult {
  ok: boolean;
  written: number;
  errors: RecordError[];
  message?: string;
}

const KINDS: IngestKind[] = ["runs", "costs", "human-time"];

/**
 * Imports parsed CSV records for the caller's org. Uses the same validation and
 * idempotent upsert as the push API, in batches of 500.
 */
export async function importRecords(kind: IngestKind, records: Record<string, unknown>[]): Promise<ImportResult> {
  if (!KINDS.includes(kind)) return { ok: false, written: 0, errors: [], message: "Unknown import type" };
  const { org } = await requireOrg();
  const db = createAdminClient();
  let written = 0;
  const errors: RecordError[] = [];
  const touched = new Set<string>();
  try {
    for (let i = 0; i < records.length; i += 500) {
      const res = await ingestBatch(db, org.id, kind, records.slice(i, i + 500), "csv");
      written += res.written;
      errors.push(...res.errors.map((e) => ({ ...e, index: e.index + i })));
      res.deploymentIds.forEach((id) => touched.add(id));
    }
  } catch (e) {
    return { ok: false, written, errors, message: e instanceof IngestError ? e.message : "Import failed" };
  }
  await recalculateAndNotify(db, [...touched]).catch((e) => console.error(e));
  revalidatePath("/deployments");
  return { ok: errors.length === 0, written, errors };
}
