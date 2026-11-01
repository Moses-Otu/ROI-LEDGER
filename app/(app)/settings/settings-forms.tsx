"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, NativeSelect, type FormState } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONNECTOR_TYPES } from "@/lib/connectors/catalog";
import type { ConnectorType } from "@/lib/connectors/types";
import type { CurrentOrg } from "@/lib/dal";
import type { FlagThresholds } from "@/lib/roi/types";
import {
  createConnectorAction,
  createIngestKey,
  createWebhook,
  deleteConnector,
  deleteWebhook,
  revokeIngestKey,
  setConnectorPaused,
  setWebhookActive,
  syncConnectorNow,
  testConnectorAction,
  testWebhook,
  updateOrg,
  updateThresholds,
  type KeyState,
  type WebhookState,
} from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p className={`text-sm ${state.ok ? "text-[#006300]" : "text-destructive"}`}>{state.message}</p>;
}

export function OrgForm({ org }: { org: CurrentOrg }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateOrg, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor="org_name" error={e.name}>
        <Input id="org_name" name="name" defaultValue={org.name} required />
      </Field>
      <Field label="Industry" htmlFor="org_industry" error={e.industry}>
        <Input id="org_industry" name="industry" defaultValue={org.industry ?? ""} />
      </Field>
      <Field label="Currency" htmlFor="org_currency" hint="Changing it does not convert existing amounts." error={e.currency}>
        <Input id="org_currency" name="currency" defaultValue={org.currency} maxLength={3} required />
      </Field>
      <Field label="Default loaded hourly rate" htmlFor="org_rate" error={e.default_loaded_hourly_rate}>
        <Input id="org_rate" name="default_loaded_hourly_rate" type="number" min="0" step="0.01" defaultValue={org.default_loaded_hourly_rate} />
      </Field>
      <Field label="Productive hours per year" htmlFor="org_hours" error={e.productive_hours_per_year}>
        <Input id="org_hours" name="productive_hours_per_year" type="number" min="1" defaultValue={org.productive_hours_per_year} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>Save</Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ThresholdsForm({ thresholds: t }: { thresholds: FlagThresholds }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateThresholds, {});
  const pct = (x: number) => Math.round(x * 1000) / 10;
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid max-w-2xl gap-4 sm:grid-cols-3">
      <Field label="Scale: ROI above" htmlFor="t1" hint="1 = 100% return" error={e.scale_min_roi}>
        <Input id="t1" name="scale_min_roi" type="number" step="0.05" defaultValue={t.scale_min_roi} />
      </Field>
      <Field label="Fix: human-touch above (%)" htmlFor="t2" error={e.fix_max_human_touch_rate}>
        <Input id="t2" name="fix_max_human_touch_rate" type="number" step="1" defaultValue={pct(t.fix_max_human_touch_rate)} />
      </Field>
      <Field label="Fix: healthy volume from (%)" htmlFor="t3" hint="Of baseline volume" error={e.fix_healthy_volume_ratio}>
        <Input id="t3" name="fix_healthy_volume_ratio" type="number" step="1" defaultValue={pct(t.fix_healthy_volume_ratio)} />
      </Field>
      <Field label="Kill: live more than (days)" htmlFor="t4" error={e.kill_min_days_live}>
        <Input id="t4" name="kill_min_days_live" type="number" step="1" defaultValue={t.kill_min_days_live} />
      </Field>
      <Field label="Kill: volume below (%)" htmlFor="t5" error={e.kill_max_volume_ratio}>
        <Input id="t5" name="kill_max_volume_ratio" type="number" step="1" defaultValue={pct(t.kill_max_volume_ratio)} />
      </Field>
      <Field label="Alert: cost/run rise over (%)" htmlFor="t6" hint="Week on week" error={e.cost_per_run_spike_pct}>
        <Input id="t6" name="cost_per_run_spike_pct" type="number" step="1" defaultValue={pct(t.cost_per_run_spike_pct)} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>Save thresholds</Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function CreateConnectorForm() {
  const [type, setType] = useState<ConnectorType>("langfuse");
  const [state, action, pending] = useActionState<FormState, FormData>(createConnectorAction, {});
  const spec = CONNECTOR_TYPES[type];
  const e = state.errors ?? {};
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">Add a connector</summary>
      <form action={action} className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="cn_type">
          <NativeSelect
            id="cn_type"
            name="type"
            value={type}
            onChange={(ev) => setType(ev.target.value as ConnectorType)}
            options={Object.entries(CONNECTOR_TYPES).map(([value, s]) => ({ value, label: s.label }))}
          />
        </Field>
        <Field label="Name" htmlFor="cn_name">
          <Input id="cn_name" name="name" placeholder={spec.label} />
        </Field>
        {spec.credentials.map((c) => (
          <Field key={c.key} label={c.label} htmlFor={`cred_${c.key}`} hint="Encrypted at rest; never sent back to the browser." error={e[`cred_${c.key}`]}>
            <Input id={`cred_${c.key}`} name={`cred_${c.key}`} type="password" autoComplete="off" required />
          </Field>
        ))}
        {spec.config.map((c) => (
          <Field key={c.key} label={c.label} htmlFor={`cfg_${c.key}`} error={e[`cfg_${c.key}`]}>
            <Input id={`cfg_${c.key}`} name={`cfg_${c.key}`} placeholder={c.placeholder} />
          </Field>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>Add connector</Button>
          <Feedback state={state} />
        </div>
      </form>
    </details>
  );
}

export function ConnectorActions({ id, paused }: { id: string; paused: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string } | void>) =>
    start(async () => {
      const res = await fn();
      if (res) (res.ok ? toast.success : toast.error)(res.message);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => testConnectorAction(id))}>
        Test connection
      </Button>
      <Button size="sm" disabled={pending} onClick={() => run(() => syncConnectorNow(id))}>
        {pending ? "Working…" : "Sync now"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setConnectorPaused(id, !paused))}>
        {paused ? "Resume" : "Pause"}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => confirm("Delete this connector? Synced data stays.") && run(() => deleteConnector(id))}
      >
        Delete
      </Button>
    </div>
  );
}

function OneTimeSecret({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="font-medium text-amber-900">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs">{value}</code>
        <Button size="sm" variant="outline" type="button" onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}>
          Copy
        </Button>
      </div>
    </div>
  );
}

export function IngestKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createIngestKey, {});
  return (
    <div className="space-y-3">
      <form action={action} className="flex max-w-lg items-end gap-2">
        <div className="flex-1">
          <Field label="New key name" htmlFor="key_name" error={state.errors?.name}>
            <Input id="key_name" name="name" placeholder="e.g. n8n production" />
          </Field>
        </div>
        <Button type="submit" disabled={pending}>Create key</Button>
      </form>
      {state.key && <OneTimeSecret label={state.message ?? "New key"} value={state.key} />}
    </div>
  );
}

export function RevokeKeyButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="destructive"
      disabled={pending}
      onClick={() => confirm("Revoke this key? Anything using it will stop working.") && start(() => revokeIngestKey(id))}
    >
      Revoke
    </Button>
  );
}

export function WebhookForm({ events }: { events: string[] }) {
  const [state, action, pending] = useActionState<WebhookState, FormData>(createWebhook, {});
  return (
    <div className="space-y-3">
      <form action={action} className="max-w-lg space-y-3">
        <Field label="Endpoint URL" htmlFor="wh_url" error={state.errors?.url}>
          <Input id="wh_url" name="url" type="url" placeholder="https://your-n8n/webhook/roi-ledger" />
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Events</legend>
          {events.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="events" value={ev} defaultChecked /> <code className="text-xs">{ev}</code>
            </label>
          ))}
          {state.errors?.events && <p className="text-xs text-destructive">{state.errors.events}</p>}
        </fieldset>
        <Button type="submit" disabled={pending}>Add webhook</Button>
      </form>
      {state.secret && <OneTimeSecret label={state.message ?? "Signing secret"} value={state.secret} />}
      {state.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
    </div>
  );
}

export function WebhookActions({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await testWebhook(id);
            (res.ok ? toast.success : toast.error)(res.message);
          })
        }
      >
        Send test
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => setWebhookActive(id, !active))}>
        {active ? "Pause" : "Resume"}
      </Button>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => confirm("Delete this webhook?") && start(() => deleteWebhook(id))}>
        Delete
      </Button>
    </div>
  );
}

