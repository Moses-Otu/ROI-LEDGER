import { notFound } from "next/navigation";
import { StepNav } from "@/components/ledger/setup-steps";
import { requireOrg } from "@/lib/dal";
import { getSetupProgress } from "@/lib/setup";
import { RecentList, timeRows } from "../entries";
import { HumanTimeForm } from "../log/log-forms";
import { StepHeader } from "../step-header";

export default async function TimeStepPage({ params }: PageProps<"/deployments/[id]/time">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const [{ data: deployment }, { data: logs }, progress] = await Promise.all([
    supabase.from("deployments").select("id, name").eq("id", id).eq("org_id", org.id).maybeSingle(),
    supabase.from("human_time_logs").select("*").eq("deployment_id", id).order("period_start", { ascending: false }).limit(30),
    getSetupProgress(supabase, id),
  ]);
  if (!deployment) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <StepHeader deploymentId={id} deploymentName={deployment.name} progress={progress} current="time" title="How much time do people still spend on it?">
        Even good AI needs people around it. Enter last week&apos;s minutes for each activity (0 is fine). Come back each week,
        or use the n8n weekly check-in template to collect it automatically. This time is counted as a cost only, so the
        value is never reduced twice.
      </StepHeader>
      <HumanTimeForm deploymentId={id} />
      <RecentList title="Time logged" rows={timeRows(logs ?? [])} deploymentId={id} table="human_time_logs" />
      <StepNav progress={progress} current="time" deploymentId={id} />
    </div>
  );
}
