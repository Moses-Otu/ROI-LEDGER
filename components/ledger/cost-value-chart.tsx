"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import type { SeriesPoint } from "@/lib/roi/types";

// Categorical slots 1 and 2 of the validated palette (blue / orange on white).
const VALUE_COLOR = "#2a78d6";
const COST_COLOR = "#eb6834";

/** Keep the chart light: at most ~180 points, always including the last day. */
function downsample(series: SeriesPoint[], max = 180): SeriesPoint[] {
  if (series.length <= max) return series;
  const step = Math.ceil(series.length / max);
  const out = series.filter((_, i) => i % step === 0);
  if (out.at(-1) !== series.at(-1)) out.push(series.at(-1)!);
  return out;
}

export function CostValueChart({
  series,
  currency,
  paybackDate,
  paybackProjected,
}: {
  series: SeriesPoint[];
  currency: string;
  paybackDate: string | null;
  paybackProjected: boolean;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const data = downsample(series);
  const last = series.at(-1);
  // One tick per month (its first plotted day), so month labels never repeat.
  const monthTicks = data.filter((d, i) => i === 0 || d.date.slice(0, 7) !== data[i - 1].date.slice(0, 7)).map((d) => d.date);
  // Only mark payback on the chart when it falls inside the plotted range.
  const paybackInRange = paybackDate && !paybackProjected && data.some((d) => d.date >= paybackDate);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs">
          <LegendItem color={VALUE_COLOR} label="Cumulative value" />
          <LegendItem color={COST_COLOR} label="Cumulative cost" />
          {paybackInRange && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-3 border-l-2 border-dashed border-foreground/50" /> Payback
            </span>
          )}
        </div>
        <div className="flex rounded-md border text-xs" role="tablist" aria-label="Chart view">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-2 py-1 capitalize ${view === v ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {series.length < 2 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Not enough data to chart yet.</p>
      ) : view === "chart" ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="#e5e5e5" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="date"
                ticks={monthTicks}
                interval="preserveStartEnd"
                tickFormatter={(d: string) =>
                  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })
                }
                tick={{ fontSize: 12, fill: "#737373" }}
                tickLine={false}
                axisLine={{ stroke: "#d4d4d4" }}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v: number) => formatMoneyCompact(v, currency)}
                tick={{ fontSize: 12, fill: "#737373" }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                cursor={{ stroke: "#a3a3a3", strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-sm">
                      <div className="mb-1 font-medium">{formatDate(String(label))}</div>
                      {payload.map((p) => (
                        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="size-2 rounded-full" style={{ background: p.color }} />
                            {p.dataKey === "cumValue" ? "Value" : "Cost"}
                          </span>
                          <span className="tabular-nums">{formatMoney(Number(p.value), currency)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
              {paybackInRange && (
                <ReferenceLine
                  x={data.find((d) => d.date >= paybackDate)!.date}
                  stroke="#737373"
                  strokeDasharray="4 4"
                  label={{ value: "Payback", position: "insideTopLeft", fontSize: 12, fill: "#525252" }}
                />
              )}
              <Line type="monotone" dataKey="cumValue" stroke={VALUE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="cumCost" stroke={COST_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-left">
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">Cumulative cost</th>
                <th className="px-3 py-1.5 text-right font-medium">Cumulative value</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-b last:border-0">
                  <td className="px-3 py-1">{formatDate(d.date)}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{formatMoney(d.cumCost, currency)}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{formatMoney(d.cumValue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {last && paybackDate && paybackProjected && (
        <p className="text-xs text-muted-foreground">
          Payback is projected for {formatDate(paybackDate)} at the trailing 30-day rate; it is after the last day shown.
        </p>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="h-0.5 w-4 rounded" style={{ background: color }} />
      {label}
    </span>
  );
}
