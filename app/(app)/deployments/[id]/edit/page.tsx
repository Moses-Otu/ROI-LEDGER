import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { DeploymentForm } from "../../deployment-form";

export default async function EditDeploymentPage({ params }: PageProps<"/deployments/[id]/edit">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("deployments").select("*").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!data) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Edit {data.name}</h1>
      <DeploymentForm currency={org.currency} values={data} />
    </div>
  );
}
