"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  sent?: boolean;
  error?: string;
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter a valid email address" };
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${site}/auth/confirm`, shouldCreateUser: true },
  });
  if (error) return { error: error.message };
  return { sent: true };
}
