import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/dal";
import { DeploymentsTable, type DeploymentRow } from "./deployments-table";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export default async function DeploymentsPage() {
  const { supabase, org } = await requireOrg();
  const [{ data: deployments }, { data: snapshots }] = await Promise.all([
    supabase.from("deployments").select("id, name, status, type").eq("org_id", org.id).order("created_at"),
    supabase.from("latest_snapshots").select("*").eq("org_id", org.id),
  ]);
  const byDeployment = new Map((snapshots ?? []).map((s) => [s.deployment_id, s]));
  const rows: DeploymentRow[] = (deployments ?? []).map((d) => {
    const s = byDeployment.get(d.id);
    return {
      id: d.id,
      name: d.name,
      status: d.status,
      cost: n(s?.cost_total),
      value: n(s?.value_total),
      net: n(s?.net),
      paybackDate: s?.payback_date ?? null,
      paybackProjected: Boolean(s?.payback_projected),
      flag: s?.flag ?? null,
      confidence: s?.confidence ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Deployments</h1>
          <p className="text-sm text-muted-foreground">
            Figures to date, in {org.currency}, from the latest daily snapshot.
          </p>
        </div>
        <Link href="/deployments/new" className={buttonVariants()}>
          Register deployment
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No deployments yet. Register your first one to start measuring it.
        </div>
      ) : (
        <DeploymentsTable rows={rows} currency={org.currency} />
      )}
    </div>
  );
}
