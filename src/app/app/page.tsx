import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function ProtectedAppPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");

  return (
    <main className="protected-shell">
      <section className="protected-card" aria-labelledby="protected-title">
        <p className="eyebrow">Protected workspace</p>
        <h1 id="protected-title">You’re signed in.</h1>
        <p className="lede">Authentication is active. Trip functionality begins in Gate 3.</p>
        <form action={signOut}><button className="primary" type="submit">Sign out</button></form>
      </section>
    </main>
  );
}
