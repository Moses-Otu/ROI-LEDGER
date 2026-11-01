import { requireOrg } from "@/lib/dal";
import { DeploymentForm } from "../deployment-form";

export default async function NewDeploymentPage() {
  const { org } = await requireOrg();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Register a deployment</h1>
      <DeploymentForm currency={org.currency} />
    </div>
  );
}
