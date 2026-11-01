"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfidenceBadge, FlagBadge, StatusText } from "@/components/ledger/badges";
import { formatDate, formatMoney } from "@/lib/format";

export interface DeploymentRow {
  id: string;
  name: string;
  status: string;
  cost: number | null;
  value: number | null;
  net: number | null;
  paybackDate: string | null;
  paybackProjected: boolean;
  flag: string | null;
  confidence: string | null;
}

type SortKey = "name" | "status" | "cost" | "value" | "net" | "paybackDate" | "flag" | "confidence";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Deployment" },
  { key: "status", label: "Status" },
  { key: "cost", label: "Cost to date", numeric: true },
  { key: "value", label: "Value to date", numeric: true },
  { key: "net", label: "Net", numeric: true },
  { key: "paybackDate", label: "Payback" },
  { key: "flag", label: "Flag" },
  { key: "confidence", label: "Confidence" },
];

export function DeploymentsTable({ rows, currency }: { rows: DeploymentRow[]; currency: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "net", dir: -1 });

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (x === y) return 0;
        if (x === null) return 1; // blanks last either way
        if (y === null) return -1;
        return (x < y ? -1 : 1) * sort.dir;
      }),
    [rows, sort],
  );

  function toggle(key: SortKey, numeric?: boolean) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: numeric ? -1 : 1 }));
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/40 text-left">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 font-medium ${c.numeric ? "text-right" : ""}`}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => toggle(c.key, c.numeric)}
                >
                  {c.label}
                  {sort.key === c.key &&
                    (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2.5">
                <Link href={`/deployments/${r.id}`} prefetch={false} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <StatusText status={r.status} />
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.cost, currency)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.value, currency)}</td>
              <td
                className={`px-3 py-2.5 text-right font-medium tabular-nums ${r.net !== null && r.net < 0 ? "text-[#a32020]" : ""}`}
              >
                {formatMoney(r.net, currency)}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {formatDate(r.paybackDate)}
                {r.paybackDate && r.paybackProjected && (
                  <span className="ml-1 text-xs text-muted-foreground">(projected)</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <FlagBadge flag={r.flag} />
              </td>
              <td className="px-3 py-2.5">
                <ConfidenceBadge confidence={r.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
