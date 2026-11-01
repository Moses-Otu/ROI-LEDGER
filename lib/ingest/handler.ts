import "server-only";
import { after, NextResponse, type NextRequest } from "next/server";
import { recalculateAndNotify } from "@/lib/ledger/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateIngestKey } from "./auth";
import { extractRecords, type IngestKind } from "./schemas";
import { IngestError, ingestBatch } from "./write";

/** Shared POST handler for /api/ingest/{runs,costs,human-time}. */
export function ingestHandler(kind: IngestKind) {
  return async function POST(request: NextRequest) {
    const db = createAdminClient();
    const orgId = await authenticateIngestKey(db, request.headers.get("x-ingest-key"));
    if (!orgId) return NextResponse.json({ error: "Invalid or missing x-ingest-key" }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }

    try {
      const result = await ingestBatch(db, orgId, kind, extractRecords(body), "push");
      // Refresh today's snapshot for touched deployments once the response is sent.
      after(() => recalculateAndNotify(db, result.deploymentIds).then(() => undefined));
      const status = result.written === 0 && result.errors.length ? 422 : 200;
      return NextResponse.json(
        { received: result.received, written: result.written, errors: result.errors },
        { status },
      );
    } catch (e) {
      const status = e instanceof IngestError ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Ingest failed" }, { status });
    }
  };
}
