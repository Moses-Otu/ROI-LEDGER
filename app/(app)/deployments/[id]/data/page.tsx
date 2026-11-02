import Link from "next/link";
import { notFound } from "next/navigation";
import { StepNav } from "@/components/ledger/setup-steps";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/dal";
import { flattenRefs } from "@/lib/ingest/resolve";
import { getSetupProgress } from "@/lib/setup";
import { StepHeader } from "../step-header";

export default async function DataStepPage({ params }: PageProps<"/deployments/[id]/data">) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const [{ data: deployment }, { count: runCount }, { data: lastRun }, { count: connectorCount }, progress] = await Promise.all([
    supabase.from("deployments").select("id, name, external_refs").eq("id", id).eq("org_id", org.id).maybeSingle(),
    supabase.from("runs").select("id", { count: "exact", head: true }).eq("deployment_id", id),
    supabase.from("runs").select("started_at").eq("deployment_id", id).order("started_at", { ascending: false }).limit(1),
    supabase.from("connectors").select("id", { count: "exact", head: true }).eq("org_id", org.id),
    getSetupProgress(supabase, id),
  ]);
  if (!deployment) notFound();
  const refs = flattenRefs(deployment.external_refs as Record<string, unknown>);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className="max-w-3xl space-y-6">
      <StepHeader deploymentId={id} deploymentName={deployment.name} progress={progress} current="data" title="How will runs get in?">
        A <b>run</b> is one time the AI did the task (one question answered, one request processed). Runs turn the baseline into
        measured value. Choose any one option below. You can skip this: value is then estimated from the baseline volume and
        confidence stays Low.
      </StepHeader>

      <div className="rounded-lg border p-4 text-sm">
        <div className="font-medium">Status</div>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          <li>
            Runs recorded: <span className="font-medium text-foreground">{runCount ?? 0}</span>
            {lastRun?.[0] && <> · latest {new Date(lastRun[0].started_at).toLocaleString("en-GB")}</>}
          </li>
          <li>
            Matching IDs on this deployment:{" "}
            <span className="font-medium text-foreground">{refs.length ? refs.join(", ") : "none yet"}</span>{" "}
            <Link prefetch={false} href={`/deployments/${id}/edit`} className="underline">
              edit
            </Link>
          </li>
          <li>Connectors in your organisation: {connectorCount ?? 0}</li>
        </ul>
      </div>

      <ol className="space-y-3">
        <Option
          n={1}
          title="Connect a tool you already use (no code)"
          body={
            <>
              Add your <b>n8n</b>, <b>Langfuse</b> or <b>OpenRouter</b> key, then put this deployment&apos;s ID from that tool (for
              n8n, the workflow ID in its URL) in <i>Data source mapping</i> on the Details step. Runs then sync every night,
              or straight away with <b>Sync now</b>.
            </>
          }
          action={
            <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Settings → Connectors
            </Link>
          }
        />
        <Option
          n={2}
          title="Send each run as it happens (API, Make, Zapier, n8n step)"
          body={
            <>
              Create an ingest key, then have your automation POST to <code>{site}/api/ingest/runs</code> with header{" "}
              <code>x-ingest-key</code> and <code>deployment_ref</code> set to <code className="break-all">{id}</code>. In n8n,
              import the <b>Report to ledger</b> template and call it at the end of your workflow.
            </>
          }
          action={
            <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Settings → Ingest keys
            </Link>
          }
        />
        <Option
          n={3}
          title="Upload a spreadsheet"
          body={
            <>
              Download the runs template, fill one row per run (use <code className="break-all">{id}</code> as{" "}
              <code>deployment_ref</code>), and upload it. You&apos;ll see a checked preview before anything is saved.
            </>
          }
          action={
            <Link href="/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Import CSV
            </Link>
          }
        />
      </ol>

      <StepNav progress={progress} current="data" deploymentId={id} />
    </div>
  );
}

function Option({ n, title, body, action }: { n: number; title: string; body: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border p-4">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="font-medium">{title}</div>
        <p className="text-sm text-muted-foreground">{body}</p>
        {action}
      </div>
    </li>
  );
}
