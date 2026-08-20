import { NextResponse } from "next/server";
import { safeDestination } from "@/features/auth/routing";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeDestination(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const errorUrl = new URL("/auth", url.origin);
  errorUrl.searchParams.set("message", "confirmation_failed");
  return NextResponse.redirect(errorUrl);
}
