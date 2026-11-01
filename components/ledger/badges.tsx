import { CircleAlert, CircleCheck, CircleX, Eye, Wrench } from "lucide-react";

// Status colours are reserved for flags and always shown with an icon + label.
const FLAG = {
  scale: { label: "Scale", Icon: CircleCheck, className: "border-[#0ca30c]/40 bg-[#0ca30c]/10 text-[#006300]" },
  fix: { label: "Fix", Icon: Wrench, className: "border-[#fab219]/60 bg-[#fab219]/15 text-[#7a5200]" },
  kill: { label: "Kill", Icon: CircleX, className: "border-[#d03b3b]/40 bg-[#d03b3b]/10 text-[#a32020]" },
  watch: { label: "Watch", Icon: Eye, className: "border-border bg-muted text-muted-foreground" },
} as const;

export function FlagBadge({ flag }: { flag: string | null | undefined }) {
  if (!flag) return <span className="text-muted-foreground">—</span>;
  const f = FLAG[flag as keyof typeof FLAG] ?? FLAG.watch;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${f.className}`}>
      <f.Icon className="size-3.5" aria-hidden />
      {f.label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string | null | undefined }) {
  if (!confidence) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {confidence === "low" && <CircleAlert className="size-3.5" aria-hidden />}
      {confidence[0].toUpperCase() + confidence.slice(1)}
    </span>
  );
}

export function StatusText({ status }: { status: string }) {
  return <span className="text-xs capitalize text-muted-foreground">{status}</span>;
}
