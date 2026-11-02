import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { HELP, type HelpKey } from "@/lib/help";
import { InfoTip } from "./info-tip";

/** Label (with optional ⓘ help) + control + optional hint/error, stacked. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  info,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  /** Key into lib/help.ts; shows an ⓘ popover next to the label. */
  info?: HelpKey;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {info && <InfoTip help={HELP[info]} label={label} />}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Native select: accessible and mobile-friendly. */
export function NativeSelect({
  options,
  ...props
}: React.ComponentProps<"select"> & { options: { value: string; label: string }[] }) {
  return (
    <select className={selectClass} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
}

/** Flattens zod issues to { field: message }. */
export function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}
