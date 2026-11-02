import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { getSetupProgress } from "@/lib/setup";
import { DeploymentForm } from "../../deployment-form";
import { StepHeader } from "../step-header";
import { DeleteDeployment } from "./delete-deployment";

export default async function EditDeploymentPage({ params }: PageProps<"/deployments/[id]/edit">) {
  const { id } = await params;
  const { supabase, org, isAdmin } = await requireOrg();
  const [{ data }, progress] = await Promise.all([
    supabase.from("deployments").select("*").eq("id", id).eq("org_id", org.id).maybeSingle(),
    getSetupProgress(supabase, id),
  ]);
  if (!data) notFound();
  return (
    <div className="space-y-6">
      <StepHeader deploymentId={id} deploymentName={data.name} progress={progress} current="details" title="Deployment details">
        What it is, who owns it, when it went live, and the IDs your tools use for it. Click ⓘ next to any field for help.
      </StepHeader>
      <DeploymentForm currency={org.currency} values={data} />
      {isAdmin && <DeleteDeployment deploymentId={id} name={data.name} />}
    </div>
  );
}
