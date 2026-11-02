import Link from "next/link";
import type { ReactNode } from "react";
import { SetupSteps } from "@/components/ledger/setup-steps";
import type { SetupProgress, SetupStepKey } from "@/lib/setup";

/** Shared header for each setup step: back link, step bar, title and a one-line explanation. */
export function StepHeader({
  deploymentId,
  deploymentName,
  progress,
  current,
  title,
  children,
}: {
  deploymentId: string;
  deploymentName: string;
  progress: SetupProgress;
  current: SetupStepKey;
  title: string;
  children?: ReactNode;
}) {
  const index = progress.steps.findIndex((s) => s.key === current) + 1;
  return (
    <div className="space-y-4">
      <div>
        <Link prefetch={false} href={`/deployments/${deploymentId}`} className="text-sm text-muted-foreground hover:underline">
          ← {deploymentName}
        </Link>
      </div>
      <SetupSteps progress={progress} current={current} />
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Step {index} of {progress.steps.length}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h1>
        {children && <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
