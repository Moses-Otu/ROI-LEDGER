import { NextResponse, type NextRequest } from "next/server";
import { ensureOpenLoginUser, isOpenLoginEnabled, OPEN_LOGIN_EMAIL } from "@/lib/open-login";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * One-click sign-in to the shared account (only when OPEN_LOGIN=true).
 * The server mints a one-time login token and redeems it at once: no email is sent.
 * POST only, so link previews and crawlers never sign anyone in.
 */
export async function POST(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { status: 303 });
  if (!isOpenLoginEnabled()) return to("/login");

  try {
    const admin = createAdminClient();
    await ensureOpenLoginUser(admin);
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: OPEN_LOGIN_EMAIL });
    if (error || !data.properties?.hashed_token) throw new Error(error?.message ?? "no token");

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: "email",
    });
    if (verifyError) throw new Error(verifyError.message);
    // First visit lands on onboarding (create the org); after that, straight to the dashboard.
    return to("/deployments");
  } catch (e) {
    console.error("open sign-in failed:", (e as Error).message);
    return to("/login?error=signin");
  }
}
