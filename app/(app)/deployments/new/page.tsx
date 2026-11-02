import { requireOrg } from "@/lib/dal";
import { DeploymentForm } from "../deployment-form";

const STEPS = ["Details", "Baseline", "Costs", "Human time", "Data"];

export default async function NewDeploymentPage() {
  const { org } = await requireOrg();
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1 h-px w-5 bg-border" aria-hidden />}
              <span
                aria-current={i === 0 ? "step" : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${i === 0 ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <span className={`flex size-4 items-center justify-center rounded-full text-[10px] font-semibold ${i === 0 ? "bg-primary-foreground/20" : "bg-muted"}`}>
                  {i + 1}
                </span>
                {s}
              </span>
            </li>
          ))}
        </ol>
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Step 1 of 5</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Register a deployment</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Five short steps: details, how the work was done before AI, costs, people&apos;s time, and where run data comes from.
            Click ⓘ next to any field for help. You can leave a step and come back.
          </p>
        </div>
      </div>
      <DeploymentForm currency={org.currency} />
    </div>
  );
}
