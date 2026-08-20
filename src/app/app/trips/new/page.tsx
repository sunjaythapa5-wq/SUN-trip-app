import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTrip } from "../actions";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  const { error } = await searchParams;

  return (
    <main className="app-shell narrow-shell">
      <header className="app-header"><Link className="wordmark" href="/app">SUN</Link><Link className="text-link" href="/app">Cancel</Link></header>
      <section className="page-heading stacked-heading">
        <div><p className="eyebrow">New shared trip</p><h1>Create trip</h1><p className="lede">Only the essentials. You can invite people after this.</p></div>
      </section>
      {error ? <p className="auth-message error" role="alert">{error}</p> : null}
      <form action={createTrip} className="panel trip-form">
        <label htmlFor="name">Trip name</label>
        <input id="name" name="name" required maxLength={120} placeholder="Italy & Switzerland 2027" />
        <label htmlFor="origin">Starting from</label>
        <input id="origin" name="origin" required maxLength={120} placeholder="Sydney" />
        <div className="field-row">
          <div><label htmlFor="startDate">Start date</label><input id="startDate" name="startDate" type="date" required /></div>
          <div><label htmlFor="endDate">End date</label><input id="endDate" name="endDate" type="date" required /></div>
        </div>
        <label htmlFor="currency">Primary currency</label>
        <select id="currency" name="currency" defaultValue="AUD">
          {['AUD','USD','EUR','GBP','NZD','JPY','THB','CHF'].map((currency) => <option key={currency}>{currency}</option>)}
        </select>
        <button className="primary" type="submit">Create trip</button>
      </form>
    </main>
  );
}
