"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Field, NativeSelect, type FormState } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCostEntry, logHumanTime } from "../../actions";

function useToastOnSuccess(state: FormState, form: React.RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      form.current?.reset();
    }
  }, [state, form]);
}

/** Monday..Sunday of last week, as YYYY-MM-DD. */
function lastWeek(): [string, string] {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day - 7));
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

export function HumanTimeForm({ deploymentId }: { deploymentId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logHumanTime.bind(null, deploymentId), {});
  const ref = useRef<HTMLFormElement>(null);
  useToastOnSuccess(state, ref);
  const [start, end] = lastWeek();
  const e = state.errors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="ht_start" error={e.period_start}>
          <Input id="ht_start" name="period_start" type="date" defaultValue={start} required />
        </Field>
        <Field label="To" htmlFor="ht_end" error={e.period_end}>
          <Input id="ht_end" name="period_end" type="date" defaultValue={end} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["review", "Reviewing output"],
            ["fix", "Fixing mistakes"],
            ["escalation", "Escalations"],
            ["maintenance", "Maintenance"],
          ] as const
        ).map(([name, label]) => (
          <Field key={name} label={label} htmlFor={`ht_${name}`} error={e[name]}>
            <Input id={`ht_${name}`} name={name} type="number" min="0" step="any" inputMode="numeric" placeholder="min" />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hourly rate (optional)" htmlFor="ht_rate" hint="Blank uses the baseline rate.">
          <Input id="ht_rate" name="hourly_rate" type="number" min="0" step="0.01" />
        </Field>
        <Field label="Logged by" htmlFor="ht_by">
          <Input id="ht_by" name="logged_by" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        All of this time counts as cost. Value is never reduced by it, so nothing is counted twice.
      </p>
      {state.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Log time"}</Button>
    </form>
  );
}

export function CostEntryForm({ deploymentId, currency }: { deploymentId: string; currency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addCostEntry.bind(null, deploymentId), {});
  const ref = useRef<HTMLFormElement>(null);
  useToastOnSuccess(state, ref);
  const [oneOff, setOneOff] = useState("true");
  const e = state.errors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="c_category" error={e.category}>
          <NativeSelect
            id="c_category"
            name="category"
            options={["build", "setup", "training", "licence", "tokens", "hosting", "tooling", "maintenance", "other"].map(
              (v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }),
            )}
          />
        </Field>
        <Field label="Kind" htmlFor="c_kind" error={e.is_one_off}>
          <NativeSelect
            id="c_kind"
            name="is_one_off"
            value={oneOff}
            onChange={(ev) => setOneOff(ev.target.value)}
            options={[
              { value: "true", label: "One-off" },
              { value: "false", label: "Recurring (for a period)" },
            ]}
          />
        </Field>
      </div>
      <Field label={`Amount (${currency})`} htmlFor="c_amount" error={e.amount}>
        <Input id="c_amount" name="amount" type="number" min="0" step="0.01" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={oneOff === "true" ? "Date" : "Period start"} htmlFor="c_start" error={e.period_start}>
          <Input id="c_start" name="period_start" type="date" required />
        </Field>
        {oneOff === "false" && (
          <Field label="Period end" htmlFor="c_end" hint="Spread evenly across these days." error={e.period_end}>
            <Input id="c_end" name="period_end" type="date" required />
          </Field>
        )}
      </div>
      <Field label="Notes" htmlFor="c_notes">
        <Input id="c_notes" name="notes" />
      </Field>
      {state.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add cost"}</Button>
    </form>
  );
}
