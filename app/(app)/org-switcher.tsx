"use client";

import { useRef } from "react";
import { switchOrg } from "./org-actions";

export function OrgSwitcher({ current, orgs }: { current: string; orgs: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={switchOrg}>
      <label className="sr-only" htmlFor="org_switch">
        Organisation
      </label>
      <select
        id="org_switch"
        name="org_id"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="max-w-44 truncate rounded-md border bg-transparent px-1.5 py-1 text-sm"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </form>
  );
}
