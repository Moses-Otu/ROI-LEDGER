import Link from "next/link";
import { Suspense } from "react";
import { requireOrg } from "@/lib/dal";
import { OrgSwitcher } from "./org-switcher";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/deployments" className="font-semibold tracking-tight">
            AI ROI Ledger
          </Link>
          <nav className="flex gap-1 text-sm">
            <NavLink href="/deployments">Deployments</NavLink>
            <NavLink href="/import">Import</NavLink>
            <NavLink href="/settings">Settings</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <Suspense fallback={null}>
              <OrgName />
            </Suspense>
            <form action="/auth/signout" method="post">
              <button className="hover:text-foreground">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <Suspense fallback={null}>
        <DemoBanner />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </Link>
  );
}

async function OrgName() {
  const { org, memberships } = await requireOrg();
  if (memberships.length < 2) return <span className="hidden max-w-48 truncate sm:inline">{org.name}</span>;
  return <OrgSwitcher current={org.id} orgs={memberships} />;
}

async function DemoBanner() {
  const { org } = await requireOrg();
  if (!org.is_demo) return null;
  return (
    <div className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      Demo data: every number here is fake. Delete it in Settings → Demo data.
    </div>
  );
}
