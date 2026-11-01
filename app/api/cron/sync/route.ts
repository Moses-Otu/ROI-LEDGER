import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/ingest/keys";
import { runDailyPipeline } from "@/lib/ledger/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Called daily by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runDailyPipeline(createAdminClient());
    return NextResponse.json(summary);
  } catch (e) {
    console.error("cron sync failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
