import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { BaselineForm } from "./baseline-form";

export default async function BaselinePage({ params }: PageProps<"/deployments/[id]/baseline">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const [{ data: deployment }, { data: baselines }] = await Promise.all([
    supabase.from("deployments").select("id, name, task_replaced").eq("id", id).eq("org_id", org.id).maybeSingle(),
    supabase.from("baselines").select("*").eq("deployment_id", id).order("captured_at", { ascending: false }).limit(1),
  ]);
  if (!deployment) notFound();
  const current = baselines?.[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div>
          <Link href={`/deployments/${id}`} className="text-sm text-muted-foreground hover:underline">
            ← {deployment.name}
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Pre-AI baseline</h1>
          <p className="text-sm text-muted-foreground">
            How {deployment.task_replaced ? `"${deployment.task_replaced}"` : "the task"} was done before this deployment.
            Value is measured against these numbers.
          </p>
        </div>
        <BaselineForm
          deploymentId={id}
          currency={org.currency}
          defaultRate={org.default_loaded_hourly_rate}
          values={
            current
              ? {
                  ...current,
                  volume_per_month: Number(current.volume_per_month),
                  minutes_per_task: Number(current.minutes_per_task),
                  loaded_hourly_rate: Number(current.loaded_hourly_rate),
                  error_rate: current.error_rate === null ? null : Number(current.error_rate),
                  ai_error_rate: current.ai_error_rate === null ? null : Number(current.ai_error_rate),
                }
              : {}
          }
        />
      </div>

      <aside className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <h2 className="font-medium">Reconstructing a baseline after go-live</h2>
        <p className="text-muted-foreground">
          Most teams didn&apos;t time the old process. You can still build a defensible baseline:
        </p>
        <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
          <li>
            <strong className="text-foreground">Volume:</strong> count the requests in the old channel (email folder,
            ticket queue, spreadsheet) for 2–3 months before go-live.
          </li>
          <li>
            <strong className="text-foreground">Minutes per task:</strong> ask 3–5 people who did it to walk through
            one recent example. Use the median, not the best case.
          </li>
          <li>
            <strong className="text-foreground">Shadow run:</strong> time a handful of tasks done the old way today
            (e.g. when the AI is down or for edge cases).
          </li>
          <li>
            <strong className="text-foreground">Rate:</strong> use HR&apos;s loaded cost (salary × ~1.3 for overheads),
            not salary alone.
          </li>
          <li>
            <strong className="text-foreground">Errors:</strong> only fill error rates if you can point to a source
            (rework logs, audit findings).
          </li>
        </ol>
        <p className="text-muted-foreground">
          Mark it <em>reconstructed</em>. Confidence stays <em>low</em> until a measured baseline replaces it.
        </p>
      </aside>
    </div>
  );
}
