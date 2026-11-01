import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ConfidenceBadge, FlagBadge, StatusText } from "@/components/ledger/badges";
import { CostValueChart } from "@/components/ledger/cost-value-chart";
import { ExplainButton, ExplainProvider } from "@/components/ledger/explain";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/dal";
import { formatDate, formatMoney, formatNumber, formatPct, formatRoi } from "@/lib/format";
import { loadDeploymentContext, todayUtc } from "@/lib/ledger/recalculate";
import { calculateRoi } from "@/lib/roi";
import { DAYS_PER_MONTH } from "@/lib/roi/dates";
import type { KpiKey } from "@/lib/roi/types";
import { RecalculateButton } from "./recalculate-button";

export default async function DeploymentPage({ params }: PageProps<"/deployments/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const { data: owned } = await supabase.from("deployments").select("id").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!owned) notFound();

  // Computed live from the same module the daily snapshot uses (RLS-scoped reads).
  const ctx = await loadDeploymentContext(supabase, id, todayUtc());
  const r = calculateRoi(ctx.input);
  const d = ctx.deployment as typeof ctx.deployment & { status: string; go_live_date: string | null };
  const b = ctx.input.baseline;
  const cur = org.currency;
  const months = r.daysLive / DAYS_PER_MONTH;
  const realisedMonthlyCost = months > 0 ? (r.costRunning + r.costHuman) / months : null;

  return (
    <ExplainProvider explain={r.explain} currency={cur}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/deployments" className="text-sm text-muted-foreground hover:underline">
              ← Deployments
            </Link>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{d.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
              <StatusText status={d.status} />
              <ExplainButton k="flag" className="inline-flex items-center gap-2 [&>span:last-child]:mt-0">
                <FlagBadge flag={r.flag} />
              </ExplainButton>
              <ExplainButton k="confidence" className="inline-flex items-center gap-2 [&>span:last-child]:mt-0">
                <ConfidenceBadge confidence={r.confidence} />
                <span className="text-xs text-muted-foreground">confidence</span>
              </ExplainButton>
              <span className="text-xs text-muted-foreground">
                As of {formatDate(r.asOf)}
                {d.go_live_date ? ` · live since ${formatDate(String(d.go_live_date))}` : ""}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/deployments/${id}/log`} className={buttonVariants({ variant: "default" })}>
              Log time / cost
            </Link>
            <Link href={`/deployments/${id}/baseline`} className={buttonVariants({ variant: "outline" })}>
              Baseline
            </Link>
            <Link href={`/deployments/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
              Edit
            </Link>
            <RecalculateButton deploymentId={id} />
          </div>
        </header>

        {!b && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No baseline yet, so value is zero.{" "}
            <Link href={`/deployments/${id}/baseline`} className="font-medium underline">
              Add the pre-AI baseline
            </Link>
            .
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi k="cost_total" label="Cost to date" value={formatMoney(r.costTotal, cur)} />
          <Kpi k="value_total" label="Value to date" value={formatMoney(r.valueTotal, cur)} />
          <Kpi k="net" label="Net return" value={formatMoney(r.net, cur)} negative={r.net < 0} />
          <Kpi k="roi" label="ROI" value={formatRoi(r.roi)} negative={(r.roi ?? 0) < 0} />
          <Kpi
            k="payback_date"
            label="Payback"
            value={formatDate(r.paybackDate)}
            sub={r.paybackDate ? (r.paybackProjected ? "projected" : "reached") : "not on track"}
          />
          <Kpi k="cost_per_successful_run" label="Cost per completed run" value={formatMoney(r.costPerSuccessfulRun, cur)} />
        </section>

        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">Cumulative cost vs value</h2>
          <CostValueChart series={r.series} currency={cur} paybackDate={r.paybackDate} paybackProjected={r.paybackProjected} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Cost by layer">
            <CostLayers
              currency={cur}
              rows={[
                { k: "cost_one_off", label: "One-off (build, setup, training)", value: r.costOneOff },
                { k: "cost_running", label: "Running (tokens, hosting, licences)", value: r.costRunning },
                { k: "cost_human", label: "Human (review, fixes, escalations)", value: r.costHuman },
              ]}
            />
          </Panel>

          <Panel title="Runs">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Stat label="Total runs" value={formatNumber(r.runCounts.total)} />
              <Stat label="Completed" value={formatNumber(r.runCounts.completed)} />
              <Stat label="Failed" value={formatNumber(r.runCounts.failed)} />
              <Stat label="Success rate" value={formatPct(r.successRate)} k="success_rate" />
              <Stat label="Human-touch rate" value={formatPct(r.humanTouchRate)} k="human_touch_rate" />
              <Stat label="Data coverage" value={formatPct(r.coverage)} />
              <Stat label="Volume vs baseline (30d)" value={formatPct(r.volumeRatio)} />
              <Stat label="Estimated tasks" value={formatNumber(r.runCounts.estimatedCompleted)} hint="Weeks with no run data" />
              <Stat label="Days live" value={formatNumber(r.daysLive)} />
            </dl>
          </Panel>

          <Panel
            title="Baseline and assumptions"
            action={
              <Link href={`/deployments/${id}/baseline`} className="text-sm text-muted-foreground hover:underline">
                Edit
              </Link>
            }
          >
            {b ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Stat label="Tasks per month" value={formatNumber(b.volumePerMonth)} />
                <Stat label="Minutes per task" value={formatNumber(b.minutesPerTask, 1)} />
                <Stat label="Loaded hourly rate" value={formatMoney(b.loadedHourlyRate, cur)} />
                <Stat label="Value per task" value={formatMoney(Number(r.explain.value_total.inputs.value_per_task), cur)} />
                <Stat label="Error rate before / with AI" value={`${formatPct(b.errorRate, 1)} / ${formatPct(b.aiErrorRate, 1)}`} />
                <Stat label="Cost per error" value={formatMoney(b.costPerError, cur)} />
                <Stat label="Source" value={b.source} />
                <Stat label="Captured" value={formatDate(String(ctx.baseline?.captured_at ?? ""))} />
                {ctx.baseline?.notes ? (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Notes</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap">{String(ctx.baseline.notes)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No baseline recorded.</p>
            )}
          </Panel>

          <Panel title="Predicted vs realised (per month)">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 font-normal" />
                  <th className="py-1 text-right font-normal">Predicted</th>
                  <th className="py-1 text-right font-normal">Realised</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="py-2">Value</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(ctx.input.deployment.predictedMonthlyValue, cur)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(r.realisedMonthlyValue, cur)}</td>
                </tr>
                <tr className="border-t">
                  <td className="py-2">Running + human cost</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(ctx.input.deployment.predictedMonthlyCost, cur)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(realisedMonthlyCost, cur)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Realised figures are averages since go-live. One-off costs are excluded.</p>
          </Panel>
        </div>
      </div>
    </ExplainProvider>
  );
}

function Kpi({ k, label, value, sub, negative }: { k: KpiKey; label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <ExplainButton k={k} className="rounded-lg border p-3 hover:bg-muted/30">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${negative ? "text-[#a32020]" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </ExplainButton>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, hint, k }: { label: string; value: string; hint?: string; k?: KpiKey }) {
  const body = (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums capitalize">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </>
  );
  return k ? (
    <ExplainButton k={k} className="[&>span:last-child]:mt-0.5">
      <div>{body}</div>
    </ExplainButton>
  ) : (
    <div>{body}</div>
  );
}

function CostLayers({ rows, currency }: { rows: { k: KpiKey; label: string; value: number }[]; currency: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.k}>
          <ExplainButton k={r.k} className="block w-full [&>span:last-child]:mt-0.5">
            <div className="flex justify-between text-sm">
              <span>{r.label}</span>
              <span className="tabular-nums">
                {formatMoney(r.value, currency)}
                <span className="ml-2 text-xs text-muted-foreground">{total ? formatPct(r.value / total) : "—"}</span>
              </span>
            </div>
            {/* Single hue: these are magnitudes of one measure, not separate series. */}
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-[#eb6834]" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </ExplainButton>
        </li>
      ))}
    </ul>
  );
}
