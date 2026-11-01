import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { DeleteEntryButton } from "./delete-entry-button";
import { CostEntryForm, HumanTimeForm } from "./log-forms";

export default async function LogPage({ params }: PageProps<"/deployments/[id]/log">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const [{ data: deployment }, { data: human }, { data: costs }] = await Promise.all([
    supabase.from("deployments").select("id, name").eq("id", id).eq("org_id", org.id).maybeSingle(),
    supabase.from("human_time_logs").select("*").eq("deployment_id", id).order("period_start", { ascending: false }).limit(20),
    supabase.from("cost_entries").select("*").eq("deployment_id", id).order("period_start", { ascending: false }).limit(20),
  ]);
  if (!deployment) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/deployments/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {deployment.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Log time and costs</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-medium">Human time this week</h2>
          <HumanTimeForm deploymentId={id} />
          <RecentList
            title="Recent time logs"
            rows={(human ?? []).map((h) => ({
              id: h.id,
              left: `${formatDate(h.period_start)} – ${formatDate(h.period_end)} · ${h.activity}`,
              right: `${formatNumber(Number(h.minutes))} min`,
              sub: h.logged_by ? `by ${h.logged_by} · ${h.source}` : h.source,
            }))}
            deploymentId={id}
            table="human_time_logs"
          />
        </section>

        <section className="space-y-4">
          <h2 className="font-medium">Cost entry</h2>
          <CostEntryForm deploymentId={id} currency={org.currency} />
          <RecentList
            title="Recent costs"
            rows={(costs ?? []).map((c) => ({
              id: c.id,
              left: `${c.category} · ${c.is_one_off ? "one-off" : "recurring"}`,
              right: formatMoney(Number(c.amount), org.currency),
              sub:
                c.period_start === c.period_end
                  ? formatDate(c.period_start)
                  : `${formatDate(c.period_start)} – ${formatDate(c.period_end)}`,
            }))}
            deploymentId={id}
            table="cost_entries"
          />
        </section>
      </div>
    </div>
  );
}

function RecentList({
  title,
  rows,
  deploymentId,
  table,
}: {
  title: string;
  rows: { id: string; left: string; right: string; sub?: string }[];
  deploymentId: string;
  table: "cost_entries" | "human_time_logs";
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="divide-y rounded-lg border text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate capitalize">{r.left}</div>
              {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
            </div>
            <div className="tabular-nums">{r.right}</div>
            <DeleteEntryButton deploymentId={deploymentId} table={table} entryId={r.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
