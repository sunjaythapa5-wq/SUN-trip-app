import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "../../trips/actions";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/auth?next=${encodeURIComponent(`/app/invites/${token}`)}`);
  const { data } = await supabase.rpc("preview_trip_invite", { invite_token: token });
  const preview = (data as Array<{ trip_name: string; invite_role: string; invite_expires_at: string }> | null)?.[0];
  const { error } = await searchParams;
  const action = acceptInvite.bind(null, token);

  return (
    <main className="protected-shell">
      <section className="protected-card invite-card">
        <p className="eyebrow">Private invitation</p>
        {preview ? <><h1>You’re invited.</h1><p className="lede">Join <strong>{preview.trip_name}</strong> as {preview.invite_role}.</p></> : <><h1>Link unavailable.</h1><p className="lede">This invitation is expired, used, revoked, or belongs to another email address.</p></>}
        {error ? <p className="auth-message error" role="alert">{error}</p> : null}
        <div className="inline-actions">
          {preview ? <form action={action}><button className="primary" type="submit">Accept invitation</button></form> : null}
          <Link className="button secondary" href="/app">Back to trips</Link>
        </div>
      </section>
    </main>
  );
}
