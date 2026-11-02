"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteDeployment } from "../../actions";

/** Danger zone: type the name to confirm, then delete permanently. */
export function DeleteDeployment({ deploymentId, name }: { deploymentId: string; name: string }) {
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const matches = typed.trim() === name.trim();

  return (
    <section className="max-w-2xl space-y-3 rounded-lg border border-destructive/30 p-4">
      <div>
        <h2 className="font-medium text-destructive">Delete this deployment</h2>
        <p className="text-sm text-muted-foreground">
          Permanently removes <b>{name}</b> and everything recorded for it: runs, costs, time logs, baseline and history.
          This can&apos;t be undone. To stop counting it but keep the record, set <b>Status</b> to <b>Retired</b> instead.
        </p>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span>
          Type <b>{name}</b> to confirm
        </span>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      <Button
        variant="destructive"
        disabled={!matches || pending}
        onClick={() =>
          start(async () => {
            const res = await deleteDeployment(deploymentId);
            if (res && !res.ok) toast.error(res.message);
          })
        }
      >
        {pending ? "Deleting…" : "Delete deployment"}
      </Button>
    </section>
  );
}
