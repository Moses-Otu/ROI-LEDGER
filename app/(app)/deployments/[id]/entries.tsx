import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { DeleteEntryButton } from "./log/delete-entry-button";

type Row = { id: string; left: string; right: string; sub?: string };

export function costRows(costs: Record<string, unknown>[], currency: string): Row[] {
  return costs.map((c) => ({
    id: String(c.id),
    left: `${c.category} · ${c.is_one_off ? "one-off" : "recurring"}`,
    right: formatMoney(Number(c.amount), currency),
    sub:
      c.period_start === c.period_end
        ? formatDate(String(c.period_start))
        : `${formatDate(String(c.period_start))} – ${formatDate(String(c.period_end))}`,
  }));
}

export function timeRows(logs: Record<string, unknown>[]): Row[] {
  return logs.map((h) => ({
    id: String(h.id),
    left: `${formatDate(String(h.period_start))} – ${formatDate(String(h.period_end))} · ${h.activity}`,
    right: `${formatNumber(Number(h.minutes))} min`,
    sub: h.logged_by ? `by ${h.logged_by} · ${h.source}` : String(h.source),
  }));
}

/** Recent cost or time entries with delete buttons. */
export function RecentList({
  title,
  rows,
  deploymentId,
  table,
}: {
  title: string;
  rows: Row[];
  deploymentId: string;
  table: "cost_entries" | "human_time_logs";
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="divide-y rounded-lg border text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate capitalize">{r.left}</div>
              {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
            </div>
            <div className="tabular-nums">{r.right}</div>
            <DeleteEntryButton deploymentId={deploymentId} table={table} entryId={r.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
