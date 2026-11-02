"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { HelpEntry } from "@/lib/help";

/** The ⓘ next to a label: click (or tap) for meaning, example and how it's used. */
export function InfoTip({ help, label }: { help: HelpEntry; label: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${label}`}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 gap-2 text-xs leading-relaxed">
        <p className="font-medium text-foreground">{label}</p>
        <p>{help.what}</p>
        {help.example && (
          <p>
            <span className="font-medium">Example: </span>
            {help.example}
          </p>
        )}
        {help.calc && (
          <p className="rounded-md bg-muted px-2 py-1.5">
            <span className="font-medium">How it&apos;s used: </span>
            {help.calc}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
