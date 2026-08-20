"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeDestination } from "@/features/auth/routing";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  next: z.string().optional(),
});

function authRedirect(code: string, next?: string) {
  const query = new URLSearchParams({ message: code });
  if (next) query.set("next", safeDestination(next));
  return `/auth?${query.toString()}`;
}

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(authRedirect("invalid_form"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) redirect(authRedirect("invalid_credentials", parsed.data.next));
  redirect(safeDestination(parsed.data.next));
}

export async function signUp(formData: FormData) {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(authRedirect("invalid_form"));

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) redirect(authRedirect("unexpected", parsed.data.next));

  const supabase = await createClient();
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeDestination(parsed.data.next));
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) redirect(authRedirect("account_exists", parsed.data.next));
  if (!data.session) redirect(authRedirect("check_email", parsed.data.next));
  redirect(safeDestination(parsed.data.next));
}
