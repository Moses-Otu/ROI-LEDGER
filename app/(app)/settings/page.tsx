import type { ReactNode } from "react";
import { CONNECTOR_TYPES } from "@/lib/connectors";
import { requireOrg } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { resolveThresholds } from "@/lib/roi";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import {
  ConnectorActions,
  CreateConnectorForm,
  DeleteDemoButton,
  IngestKeyForm,
  OrgForm,
  RevokeKeyButton,
  ThresholdsForm,
  WebhookActions,
  WebhookForm,
} from "./settings-forms";

const N8N_TEMPLATES = [
  { file: "report-to-ledger.json", label: "Report to ledger (sub-workflow)" },
  { file: "weekly-human-time.json", label: "Weekly human-time check-in" },
  { file: "alerts-and-monthly-report.json", label: "Alerts and monthly report" },
];

export default async function SettingsPage() {
  const { supabase, org, isAdmin } = await requireOrg();

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Only organisation admins can change settings.</p>
      </div>
    );
  }

  const [{ data: connectors }, { data: syncs }, { data: keys }, { data: hooks }, { data: deliveries }, { data: deployments }] =
    await Promise.all([
      supabase
        .from("connectors")
        .select("id, type, name, config, status, last_synced_at, last_error, created_at")
        .eq("org_id", org.id)
        .order("created_at"),
      supabase.from("sync_runs").select("*").eq("org_id", org.id).order("started_at", { ascending: false }).limit(30),
      supabase
        .from("ingest_keys")
        .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase.from("webhooks").select("id, url, events, active, created_at").eq("org_id", org.id).order("created_at"),
      supabase
        .from("webhook_deliveries")
        .select("id, webhook_id, event, status_code, attempt, error, attempted_at")
        .eq("org_id", org.id)
        .order("attempted_at", { ascending: false })
        .limit(25),
      supabase.from("deployments").select("id, name, external_refs").eq("org_id", org.id).order("name"),
    ]);

  const thresholds = resolveThresholds(org.flag_thresholds);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <Section title="Organisation">
        <OrgForm org={org} />
      </Section>

      <Section title="Flag thresholds" description="Used for scale / fix / kill and the cost-per-run spike alert.">
        <ThresholdsForm thresholds={thresholds} />
      </Section>

      <Section
        title="Connectors"
        description="Pulled daily by the cron job. Map data to deployments with the n8n workflow IDs, Langfuse tags and OpenRouter key label on each deployment."
      >
        <div className="space-y-3">
          {(connectors ?? []).map((c) => {
            const history = (syncs ?? []).filter((s) => s.connector_id === c.id).slice(0, 5);
            return (
              <div key={c.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {c.name}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {CONNECTOR_TYPES[c.type as keyof typeof CONNECTOR_TYPES]?.label} · {c.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last synced {c.last_synced_at ? new Date(c.last_synced_at).toLocaleString("en-GB") : "never"}
                    </div>
                    {c.last_error && <div className="mt-1 text-xs text-destructive">{c.last_error}</div>}
                  </div>
                  <ConnectorActions id={c.id} paused={c.status === "paused"} />
                </div>
                <MappedDeployments type={c.type} deployments={deployments ?? []} />
                {history.length > 0 && (
                  <table className="mt-3 w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1 font-normal">Started</th>
                        <th className="py-1 font-normal">Status</th>
                        <th className="py-1 text-right font-normal">Records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((s) => (
                        <tr key={s.id} className="border-t">
                          <td className="py-1">{new Date(s.started_at).toLocaleString("en-GB")}</td>
                          <td className="py-1" title={s.error ?? undefined}>
                            {s.status}
                            {s.error ? ": " + s.error.slice(0, 80) : ""}
                          </td>
                          <td className="py-1 text-right tabular-nums">{s.records_in}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          <CreateConnectorForm />
        </div>
      </Section>

      <Section
        title="Ingest keys"
        description={
          <>
            For the push API: send <code>x-ingest-key</code> to <code>{site}/api/ingest/runs</code>,{" "}
            <code>/costs</code> or <code>/human-time</code>. Only a hash is stored.
          </>
        }
      >
        <ul className="mb-4 divide-y rounded-lg border text-sm">
          {(keys ?? []).length === 0 && <li className="px-3 py-2 text-muted-foreground">No keys yet.</li>}
          {(keys ?? []).map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-muted-foreground">
                  <code>{k.key_prefix}…</code> · created {formatDate(k.created_at)} · last used{" "}
                  {k.last_used_at ? formatDate(k.last_used_at) : "never"}
                </div>
              </div>
              {k.revoked_at ? (
                <span className="text-xs text-muted-foreground">Revoked {formatDate(k.revoked_at)}</span>
              ) : (
                <RevokeKeyButton id={k.id} />
              )}
            </li>
          ))}
        </ul>
        <IngestKeyForm />
      </Section>

      <Section title="Webhooks" description="Signed with HMAC-SHA256 in the x-signature header (sha256=<hex>). Retried up to 3 times.">
        <ul className="mb-4 divide-y rounded-lg border text-sm">
          {(hooks ?? []).length === 0 && <li className="px-3 py-2 text-muted-foreground">No webhooks yet.</li>}
          {(hooks ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{h.url}</div>
                <div className="text-xs text-muted-foreground">
                  {h.events.join(", ")} · {h.active ? "active" : "paused"}
                </div>
              </div>
              <WebhookActions id={h.id} active={h.active} />
            </li>
          ))}
        </ul>
        <WebhookForm events={WEBHOOK_EVENTS} />
        {(deliveries ?? []).length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium">Delivery log</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="border-b bg-muted/40 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">When</th>
                    <th className="px-2 py-1.5 font-medium">Event</th>
                    <th className="px-2 py-1.5 font-medium">Attempt</th>
                    <th className="px-2 py-1.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(deliveries ?? []).map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="px-2 py-1">{new Date(d.attempted_at).toLocaleString("en-GB")}</td>
                      <td className="px-2 py-1">{d.event}</td>
                      <td className="px-2 py-1">{d.attempt}</td>
                      <td className="px-2 py-1">{d.status_code ?? d.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="Templates">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">CSV templates</h3>
            <ul className="space-y-1 text-sm">
              {(["runs", "costs", "human-time"] as const).map((k) => (
                <li key={k}>
                  <a className="text-primary hover:underline" href={`/api/templates/${k}`}>
                    {k}-template.csv
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">n8n companion templates</h3>
            <ul className="space-y-1 text-sm">
              {N8N_TEMPLATES.map((t) => (
                <li key={t.file}>
                  <a className="text-primary hover:underline" href={`/n8n-templates/${t.file}`} download>
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Import in n8n via Workflows → Import from file. Setup is in the README.</p>
          </div>
        </div>
      </Section>

      {org.is_demo && (
        <Section title="Demo data" description="This organisation holds fake demo data. Deleting it removes every row in it.">
          <DeleteDemoButton />
        </Section>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="border-b pb-2">
        <h2 className="font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function MappedDeployments({
  type,
  deployments,
}: {
  type: string;
  deployments: { id: string; name: string; external_refs: Record<string, unknown> | null }[];
}) {
  const field = { langfuse: "langfuse_tags", openrouter: "openrouter_key_label", n8n: "n8n_workflow_ids" }[type];
  const mapped = deployments.flatMap((d) => {
    const v = field ? d.external_refs?.[field] : undefined;
    const vals = Array.isArray(v) ? v : v ? [v] : [];
    return vals.length ? [`${d.name} ← ${vals.join(", ")}`] : [];
  });
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {mapped.length ? `Mapped: ${mapped.join(" · ")}` : "No deployments mapped yet. Add refs on a deployment's Edit page."}
    </p>
  );
}
