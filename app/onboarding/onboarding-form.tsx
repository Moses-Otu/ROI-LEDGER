"use client";

import { useActionState } from "react";
import { Field, NativeSelect, type FormState } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currencyOptions, DEFAULT_CURRENCY } from "@/lib/currencies";
import { createOrganisation } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrganisation, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field label="Organisation name" htmlFor="name" error={e.name}>
        <Input id="name" name="name" required />
      </Field>
      <Field label="Industry" htmlFor="industry" error={e.industry}>
        <Input id="industry" name="industry" placeholder="e.g. Manufacturing" />
      </Field>
      <Field label="Currency" htmlFor="currency" hint="All amounts are stored in this currency." error={e.currency}>
        <NativeSelect id="currency" name="currency" defaultValue={DEFAULT_CURRENCY} options={currencyOptions()} required />
      </Field>
      <Field
        label="Default loaded hourly rate"
        htmlFor="default_loaded_hourly_rate"
        hint="Salary plus overheads, per hour. Used when a baseline or time log has no rate."
        error={e.default_loaded_hourly_rate}
      >
        <Input id="default_loaded_hourly_rate" name="default_loaded_hourly_rate" type="number" min="0" step="0.01" inputMode="decimal" required />
      </Field>
      {state.message && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create organisation"}</Button>
    </form>
  );
}
