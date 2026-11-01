"use client";

import { useActionState } from "react";
import { Field, NativeSelect, type FormState } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveBaseline } from "../../actions";

export interface BaselineValues {
  volume_per_month?: number;
  minutes_per_task?: number;
  loaded_hourly_rate?: number;
  error_rate?: number | null;
  ai_error_rate?: number | null;
  cost_per_error?: number | null;
  turnaround_hours?: number | null;
  source?: string;
  notes?: string | null;
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(Math.round(x * 10000) / 100));

export function BaselineForm({
  deploymentId,
  currency,
  defaultRate,
  values = {},
}: {
  deploymentId: string;
  currency: string;
  defaultRate: number;
  values?: BaselineValues;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBaseline.bind(null, deploymentId), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <Field label="Tasks per month (before AI)" htmlFor="volume_per_month" hint="How many times the task was done in a typical month." error={e.volume_per_month}>
        <Input id="volume_per_month" name="volume_per_month" type="number" min="0" step="any" defaultValue={values.volume_per_month ?? ""} required />
      </Field>
      <Field label="Minutes per task" htmlFor="minutes_per_task" hint="Hands-on time per task, not elapsed time." error={e.minutes_per_task}>
        <Input id="minutes_per_task" name="minutes_per_task" type="number" min="0" step="any" defaultValue={values.minutes_per_task ?? ""} required />
      </Field>
      <Field label={`Loaded hourly rate (${currency})`} htmlFor="loaded_hourly_rate" hint="Salary plus overheads for the people who did it." error={e.loaded_hourly_rate}>
        <Input id="loaded_hourly_rate" name="loaded_hourly_rate" type="number" min="0" step="0.01" defaultValue={values.loaded_hourly_rate ?? defaultRate} required />
      </Field>
      <Field label="Turnaround (hours)" htmlFor="turnaround_hours" hint="Elapsed time from request to done. Shown for context." error={e.turnaround_hours}>
        <Input id="turnaround_hours" name="turnaround_hours" type="number" min="0" step="any" defaultValue={values.turnaround_hours ?? ""} />
      </Field>
      <Field label="Error rate before AI (%)" htmlFor="error_rate_pct" error={e.error_rate_pct}>
        <Input id="error_rate_pct" name="error_rate_pct" type="number" min="0" max="100" step="any" defaultValue={pct(values.error_rate)} />
      </Field>
      <Field label="Error rate with AI (%)" htmlFor="ai_error_rate_pct" hint="Leave blank if unknown; error impact is then skipped." error={e.ai_error_rate_pct}>
        <Input id="ai_error_rate_pct" name="ai_error_rate_pct" type="number" min="0" max="100" step="any" defaultValue={pct(values.ai_error_rate)} />
      </Field>
      <Field label={`Cost per error (${currency})`} htmlFor="cost_per_error" hint="Rework, write-offs or penalties per mistake." error={e.cost_per_error}>
        <Input id="cost_per_error" name="cost_per_error" type="number" min="0" step="0.01" defaultValue={values.cost_per_error ?? ""} />
      </Field>
      <Field label="How was this captured?" htmlFor="source" error={e.source}>
        <NativeSelect
          id="source"
          name="source"
          defaultValue={values.source ?? "reconstructed"}
          options={[
            { value: "measured", label: "Measured (timed before go-live)" },
            { value: "reconstructed", label: "Reconstructed after go-live" },
            { value: "estimate", label: "Estimate" },
          ]}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes and sources" htmlFor="notes" hint="Where each number came from, so the next person can check it." error={e.notes}>
          <Textarea id="notes" name="notes" rows={4} defaultValue={values.notes ?? ""} />
        </Field>
      </div>
      {state.message && <p className="text-sm text-destructive sm:col-span-2">{state.message}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save baseline"}</Button>
        <p className="mt-2 text-xs text-muted-foreground">Saving adds a new version; earlier baselines are kept.</p>
      </div>
    </form>
  );
}
