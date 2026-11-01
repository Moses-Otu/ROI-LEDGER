"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recalculateNow } from "../actions";

export function RecalculateButton({ deploymentId }: { deploymentId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await recalculateNow(deploymentId);
          if (res.ok) toast.success("Snapshot saved");
          else toast.error(res.message);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : ""} />
      Recalculate
    </Button>
  );
}
