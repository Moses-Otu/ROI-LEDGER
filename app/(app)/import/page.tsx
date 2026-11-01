import { requireOrg } from "@/lib/dal";
import { CsvImport } from "./csv-import";

export default async function ImportPage() {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("deployments").select("id, name").eq("org_id", org.id).order("name");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Import CSV</h1>
        <p className="text-sm text-muted-foreground">
          Upload runs, costs or human time. You&apos;ll see a preview before anything is written. Re-importing the same
          file updates rows instead of duplicating them.
        </p>
      </div>
      <CsvImport deployments={data ?? []} />
    </div>
  );
}
