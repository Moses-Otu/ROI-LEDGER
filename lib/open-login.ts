import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Temporary open access: with OPEN_LOGIN=true, the login page shows one
 * "Sign in" button that logs everyone into the same shared account, no email.
 * Anyone with the URL gets full access, so switch it off (unset or "false")
 * before connecting real data sources. Email sign-in returns automatically.
 */
export function isOpenLoginEnabled(): boolean {
  return process.env.OPEN_LOGIN === "true";
}

/** `.invalid` is a reserved TLD: no mail is ever sent to this address. */
export const OPEN_LOGIN_EMAIL = "team@roi-ledger.invalid";

/** Creates the shared account on first use. Safe to call every time. */
export async function ensureOpenLoginUser(db: AdminClient): Promise<void> {
  const { error } = await db.auth.admin.createUser({ email: OPEN_LOGIN_EMAIL, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw new Error(error.message);
}
