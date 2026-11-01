"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteEntry } from "../../actions";

export function DeleteEntryButton({
  deploymentId,
  table,
  entryId,
}: {
  deploymentId: string;
  table: "cost_entries" | "human_time_logs";
  entryId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete entry"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
      onClick={() => {
        if (confirm("Delete this entry? ROI will be recalculated.")) start(() => deleteEntry(deploymentId, table, entryId));
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
