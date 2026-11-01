import { csvTemplate } from "@/lib/ingest/csv";
import type { IngestKind } from "@/lib/ingest/schemas";

const KINDS: IngestKind[] = ["runs", "costs", "human-time"];

export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[kind]">) {
  const kind = (await ctx.params).kind.replace(/\.csv$/, "") as IngestKind;
  if (!KINDS.includes(kind)) return new Response("Unknown template", { status: 404 });
  return new Response(csvTemplate(kind), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${kind}-template.csv"`,
    },
  });
}
