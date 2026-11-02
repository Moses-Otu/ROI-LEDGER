import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { costRows, RecentList, timeRows } from "../entries";
import { CostEntryForm, HumanTimeForm } from "./log-forms";

/** Day-to-day logging: both forms side by side (setup uses the separate Costs and Human time steps). */
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
          <RecentList title="Recent time logs" rows={timeRows(human ?? [])} deploymentId={id} table="human_time_logs" />
        </section>

        <section className="space-y-4">
          <h2 className="font-medium">Cost entry</h2>
          <CostEntryForm deploymentId={id} currency={org.currency} />
          <RecentList title="Recent costs" rows={costRows(costs ?? [], org.currency)} deploymentId={id} table="cost_entries" />
        </section>
      </div>
    </div>
  );
}
