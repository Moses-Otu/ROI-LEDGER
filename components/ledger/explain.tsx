"use client";

import { Info } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import type { Explanation, KpiKey } from "@/lib/roi/types";

// Inputs whose names look like money are shown in the org currency.
const MONEY_KEY = /cost|value|net|amount|rate_per|per_day|build|setup|training|licence|hosting|tooling|maintenance|other|tokens/;
const NON_MONEY_KEY = /rate$|ratio|runs|tasks|minutes|logs|days|coverage|source|projected|success|needs_human|roi|_pct/;

const Ctx = createContext<{ open: (k: KpiKey) => void } | null>(null);

export function ExplainProvider({
  explain,
  currency,
  children,
}: {
  explain: Record<KpiKey, Explanation>;
  currency: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState<KpiKey | null>(null);
  const ex = active ? explain[active] : null;

  return (
    <Ctx value={{ open: setActive }}>
      {children}
      <Sheet open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="overflow-y-auto">
          {ex && (
            <>
              <SheetHeader>
                <SheetTitle>{ex.label}</SheetTitle>
                <SheetDescription>How this number is calculated.</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <div className="text-2xl font-semibold tabular-nums">{display(active!, ex.value, currency)}</div>
                <div>
                  <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Formula</h3>
                  <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{ex.formula}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Inputs</h3>
                  {Object.keys(ex.inputs).length === 0 ? (
                    <p className="text-muted-foreground">None recorded.</p>
                  ) : (
                    <dl className="divide-y rounded-md border">
                      {Object.entries(ex.inputs).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4 px-3 py-1.5">
                          <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                          <dd className="text-right tabular-nums">{inputValue(k, v, currency)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
                {ex.notes.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</h3>
                    <ul className="list-disc space-y-1 pl-4">
                      {ex.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Ctx>
  );
}

export function ExplainButton({ k, children, className = "" }: { k: KpiKey; children: ReactNode; className?: string }) {
  const ctx = use(Ctx);
  return (
    <button
      type="button"
      onClick={() => ctx?.open(k)}
      className={`group text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${className}`}
    >
      {children}
      <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
        <Info className="size-3" aria-hidden /> Explain
      </span>
    </button>
  );
}

function display(k: KpiKey, v: Explanation["value"], currency: string): string {
  if (v === null) return "—";
  if (typeof v === "string") return v;
  if (k === "roi" || k === "success_rate" || k === "human_touch_rate") return `${(v * 100).toFixed(1)}%`;
  return formatMoney(v, currency);
}

function inputValue(k: string, v: unknown, currency: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") {
    if (MONEY_KEY.test(k) && !NON_MONEY_KEY.test(k)) return formatMoney(v, currency);
    if (k === "loaded_hourly_rate") return formatMoney(v, currency);
    return v.toLocaleString("en-GB", { maximumFractionDigits: 4 });
  }
  return String(v);
}
