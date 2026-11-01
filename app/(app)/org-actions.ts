"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, requireOrg } from "@/lib/dal";

export async function switchOrg(form: FormData): Promise<void> {
  const target = String(form.get("org_id") ?? "");
  const { memberships } = await requireOrg();
  if (!memberships.some((m) => m.id === target)) return;
  (await cookies()).set(ORG_COOKIE, target, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/deployments");
}
