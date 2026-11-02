"use client";

import { useActionState } from "react";
import { Field, NativeSelect, type FormState } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveDeployment } from "./actions";

export interface DeploymentFormValues {
  id?: string;
  name?: string;
  type?: string;
  description?: string | null;
  task_replaced?: string | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  status?: string;
  go_live_date?: string | null;
  expected_life_months?: number;
  predicted_monthly_value?: number | null;
  predicted_monthly_cost?: number | null;
  external_refs?: {
    n8n_workflow_ids?: string[];
    langfuse_tags?: string[];
    langfuse_project?: string;
    openrouter_key_label?: string;
  } | null;
}

export function DeploymentForm({ values = {}, currency }: { values?: DeploymentFormValues; currency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveDeployment.bind(null, values.id ?? null),
    {},
  );
  const e = state.errors ?? {};
  const refs = values.external_refs ?? {};

  return (
    <form action={action} className="max-w-2xl space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" htmlFor="name" info="dep_name" error={e.name}>
            <Input id="name" name="name" defaultValue={values.name} required />
          </Field>
        </div>
        <Field label="Type" htmlFor="type" info="dep_type" error={e.type}>
          <NativeSelect
            id="type"
            name="type"
            defaultValue={values.type ?? "agent"}
            options={[
              { value: "agent", label: "Agent" },
              { value: "workflow", label: "Automation workflow" },
              { value: "seat_tool", label: "Seat-based AI tool" },
              { value: "custom_gpt", label: "Custom GPT / assistant" },
            ]}
          />
        </Field>
        <Field label="Status" htmlFor="status" info="dep_status" error={e.status}>
          <NativeSelect
            id="status"
            name="status"
            defaultValue={values.status ?? "planned"}
            options={[
              { value: "planned", label: "Planned" },
              { value: "live", label: "Live" },
              { value: "paused", label: "Paused" },
              { value: "retired", label: "Retired" },
            ]}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Task it replaces" htmlFor="task_replaced" info="dep_task" hint="What people did by hand before, e.g. 'Raising and approving purchase requests by email'." error={e.task_replaced}>
            <Input id="task_replaced" name="task_replaced" defaultValue={values.task_replaced ?? ""} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="description" info="dep_description" error={e.description}>
            <Textarea id="description" name="description" rows={3} defaultValue={values.description ?? ""} />
          </Field>
        </div>
        <Field label="Owner" htmlFor="owner_name" info="dep_owner" error={e.owner_name}>
          <Input id="owner_name" name="owner_name" defaultValue={values.owner_name ?? ""} />
        </Field>
        <Field label="Owner contact" htmlFor="owner_contact" info="dep_owner_contact" hint="Email used for the weekly human-time check-in." error={e.owner_contact}>
          <Input id="owner_contact" name="owner_contact" defaultValue={values.owner_contact ?? ""} />
        </Field>
        <Field label="Go-live date" htmlFor="go_live_date" info="dep_go_live" error={e.go_live_date}>
          <Input id="go_live_date" name="go_live_date" type="date" defaultValue={values.go_live_date ?? ""} />
        </Field>
        <Field label="Expected life (months)" htmlFor="expected_life_months" info="dep_life" error={e.expected_life_months}>
          <Input id="expected_life_months" name="expected_life_months" type="number" min="1" defaultValue={values.expected_life_months ?? 24} />
        </Field>
        <Field label={`Predicted monthly value (${currency})`} htmlFor="predicted_monthly_value" info="dep_pred_value" hint="From the business case. Used for the scale flag." error={e.predicted_monthly_value}>
          <Input id="predicted_monthly_value" name="predicted_monthly_value" type="number" min="0" step="0.01" defaultValue={values.predicted_monthly_value ?? ""} />
        </Field>
        <Field label={`Predicted monthly cost (${currency})`} htmlFor="predicted_monthly_cost" info="dep_pred_cost" error={e.predicted_monthly_cost}>
          <Input id="predicted_monthly_cost" name="predicted_monthly_cost" type="number" min="0" step="0.01" defaultValue={values.predicted_monthly_cost ?? ""} />
        </Field>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-medium">Data source mapping</h2>
          <p className="text-sm text-muted-foreground">
            How connectors and the push API find this deployment. Separate several values with commas.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="n8n workflow IDs" htmlFor="n8n_workflow_ids" info="dep_n8n">
            <Input id="n8n_workflow_ids" name="n8n_workflow_ids" defaultValue={(refs.n8n_workflow_ids ?? []).join(", ")} />
          </Field>
          <Field label="Langfuse trace tags" htmlFor="langfuse_tags" info="dep_lf_tags">
            <Input id="langfuse_tags" name="langfuse_tags" defaultValue={(refs.langfuse_tags ?? []).join(", ")} />
          </Field>
          <Field label="Langfuse project" htmlFor="langfuse_project" info="dep_lf_project">
            <Input id="langfuse_project" name="langfuse_project" defaultValue={refs.langfuse_project ?? ""} />
          </Field>
          <Field label="OpenRouter key label" htmlFor="openrouter_key_label" info="dep_or_label">
            <Input id="openrouter_key_label" name="openrouter_key_label" defaultValue={refs.openrouter_key_label ?? ""} />
          </Field>
        </div>
      </section>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : values.id ? "Save changes" : "Register deployment"}
      </Button>
    </form>
  );
}
