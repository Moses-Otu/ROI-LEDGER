"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { CSV_COLUMNS, parseCsv } from "@/lib/ingest/csv";
import { ingestSchemas, validateRecords, type IngestKind, type RecordError } from "@/lib/ingest/schemas";
import { importRecords } from "./actions";

const PREVIEW_ROWS = 20;

export function CsvImport({ deployments }: { deployments: { id: string; name: string }[] }) {
  const [kind, setKind] = useState<IngestKind>("runs");
  const [fileName, setFileName] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [errors, setErrors] = useState<RecordError[]>([]);
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    const parsed = parseCsv(kind, await file.text());
    setFileName(file.name);
    setRecords(parsed.records);
    setProblems(parsed.problems);
    // Same schema as the server: show row errors before anything is written.
    setErrors(validateRecords(ingestSchemas[kind], parsed.records).errors);
  }

  function reset(next: IngestKind) {
    setKind(next);
    setRecords([]);
    setErrors([]);
    setProblems([]);
    setFileName(null);
  }

  const columns = CSV_COLUMNS[kind];
  const errorByRow = new Map(errors.map((e) => [e.index, e.error]));
  const validCount = records.length - errorByRow.size;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label htmlFor="kind" className="mb-1.5 block text-sm font-medium">
            What are you importing?
          </label>
          <NativeSelect
            id="kind"
            value={kind}
            onChange={(e) => reset(e.target.value as IngestKind)}
            options={[
              { value: "runs", label: "Runs" },
              { value: "costs", label: "Costs" },
              { value: "human-time", label: "Human time" },
            ]}
          />
        </div>
        <a href={`/api/templates/${kind}`} className="text-sm text-primary underline-offset-4 hover:underline">
          Download {kind} template
        </a>
      </div>

      <div className="rounded-lg border border-dashed p-6">
        <label className="block text-sm">
          <span className="font-medium">Choose a CSV file</span>
          <input
            key={kind}
            type="file"
            accept=".csv,text/csv"
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-white file:px-3 file:py-1.5"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          <code>deployment_ref</code> can be a deployment id or any of its mapped refs (n8n workflow id, Langfuse tag,
          OpenRouter key label).{" "}
          {deployments.length > 0 && <>Your deployment ids: {deployments.map((d) => `${d.name} = ${d.id}`).join("; ")}</>}
        </p>
      </div>

      {fileName && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <strong>{fileName}</strong>: {records.length} rows, {validCount} valid
              {errorByRow.size > 0 && <span className="text-destructive">, {errorByRow.size} with errors (skipped)</span>}
            </p>
            <Button
              disabled={pending || validCount === 0}
              onClick={() =>
                start(async () => {
                  const res = await importRecords(kind, records);
                  setErrors(res.errors);
                  if (res.message) toast.error(res.message);
                  else toast.success(`Imported ${res.written} record(s)`);
                })
              }
            >
              {pending ? "Importing…" : `Import ${validCount} row(s)`}
            </Button>
          </div>
          {problems.map((p) => (
            <p key={p} className="text-xs text-amber-800">{p}</p>
          ))}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="px-2 py-1.5 font-medium">#</th>
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-1.5 font-medium whitespace-nowrap">{c}</th>
                  ))}
                  <th className="px-2 py-1.5 font-medium">Check</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i} className={`border-b last:border-0 ${errorByRow.has(i) ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1 text-muted-foreground">{i + 2}</td>
                    {columns.map((c) => (
                      <td key={c} className="max-w-40 truncate px-2 py-1">{r[c] === undefined ? "" : String(r[c])}</td>
                    ))}
                    <td className="px-2 py-1">
                      {errorByRow.has(i) ? <span className="text-destructive">{errorByRow.get(i)}</span> : "OK"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {records.length > PREVIEW_ROWS && (
            <p className="text-xs text-muted-foreground">Showing the first {PREVIEW_ROWS} rows.</p>
          )}
          {errors.filter((e) => e.index >= PREVIEW_ROWS).slice(0, 10).map((e) => (
            <p key={e.index} className="text-xs text-destructive">Row {e.index + 2}: {e.error}</p>
          ))}
        </div>
      )}
    </div>
  );
}
