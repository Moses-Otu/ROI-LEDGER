import { Check } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { SetupProgress, SetupStepKey } from "@/lib/setup";

/** Step bar for deployment setup: Details → Baseline → Costs → Human time → Data. */
export function SetupSteps({ progress, current }: { progress: SetupProgress; current?: SetupStepKey }) {
  return (
    <nav aria-label="Setup steps" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 text-sm">
        {progress.steps.map((s, i) => {
          const isCurrent = s.key === current;
          return (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1 h-px w-5 bg-border" aria-hidden />}
              <Link
                prefetch={false}
                href={s.path}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : s.done
                      ? "border-primary/30 text-foreground hover:bg-muted"
                      : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`flex size-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                    isCurrent ? "bg-primary-foreground/20" : s.done ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {s.done && !isCurrent ? <Check className="size-3" aria-hidden /> : i + 1}
                </span>
                {s.label}
                {s.done && <span className="sr-only">(done)</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back / Next row at the bottom of a setup step. */
export function StepNav({
  progress,
  current,
  deploymentId,
}: {
  progress: SetupProgress;
  current: SetupStepKey;
  deploymentId: string;
}) {
  const i = progress.steps.findIndex((s) => s.key === current);
  const prev = progress.steps[i - 1];
  const next = progress.steps[i + 1];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
      {prev ? (
        <Link prefetch={false} href={prev.path} className={buttonVariants({ variant: "ghost" })}>
          ← {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link prefetch={false} href={next.path} className={buttonVariants({ variant: "outline" })}>
          Next: {next.label} →
        </Link>
      ) : (
        <Link prefetch={false} href={`/deployments/${deploymentId}`} className={buttonVariants()}>
          Finish: view dashboard →
        </Link>
      )}
    </div>
  );
}
