import { notFound } from "next/navigation";
import { StepNav } from "@/components/ledger/setup-steps";
import { requireOrg } from "@/lib/dal";
import { getSetupProgress } from "@/lib/setup";
import { costRows, RecentList } from "../entries";
import { CostEntryForm } from "../log/log-forms";
import { StepHeader } from "../step-header";

export default async function CostsStepPage({ params }: PageProps<"/deployments/[id]/costs">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const [{ data: deployment }, { data: costs }, progress] = await Promise.all([
    supabase.from("deployments").select("id, name").eq("id", id).eq("org_id", org.id).maybeSingle(),
    supabase.from("cost_entries").select("*").eq("deployment_id", id).order("period_start", { ascending: false }).limit(30),
    getSetupProgress(supabase, id),
  ]);
  if (!deployment) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <StepHeader deploymentId={id} deploymentName={deployment.name} progress={progress} current="costs" title="What does it cost?">
        Add each cost separately: <b>one-off</b> costs to get it live (build, setup, training) and <b>recurring</b> costs to
        run it (hosting, licences, AI usage). Save one, then add the next. Rough figures are fine; you can edit or delete
        them later.
      </StepHeader>
      <div className="grid gap-8 md:grid-cols-[1fr_280px]">
        <CostEntryForm deploymentId={id} currency={org.currency} />
        <aside className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <h2 className="font-medium">Typical costs to add</h2>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Build: hours spent × hourly rate</li>
            <li>Setup or training: first documents, staff briefing</li>
            <li>Hosting: n8n or server plan, per month</li>
            <li>Tooling: e.g. vector database, per month</li>
            <li>Tokens: last month&apos;s AI provider bill</li>
          </ul>
        </aside>
      </div>
      <RecentList title="Costs added" rows={costRows(costs ?? [], org.currency)} deploymentId={id} table="cost_entries" />
      <StepNav progress={progress} current="costs" deploymentId={id} />
    </div>
  );
}
