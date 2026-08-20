import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatTripDates, type TripSummary } from "@/features/trips/types";
import { signOut } from "./actions";

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/auth");

  const { data, error } = await supabase.from("trips")
    .select("id,name,origin,start_date,end_date,primary_currency")
    .order("start_date", { ascending: true, nullsFirst: false });
  const trips = (data ?? []) as TripSummary[];
  const counts = new Map<string, number>();
  if (trips.length) {
    const { data: memberships } = await supabase.from("trip_members")
      .select("trip_id,user_id").in("trip_id", trips.map((trip) => trip.id)).eq("status", "active");
    memberships?.forEach((membership) => counts.set(membership.trip_id, (counts.get(membership.trip_id) ?? 0) + 1));
  }
  const message = await searchParams;

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="wordmark" href="/app">SUN</Link>
        <form action={signOut}><button className="text-button" type="submit">Sign out</button></form>
      </header>
      <section className="page-heading">
        <div><p className="eyebrow">Shared workspace</p><h1>Your trips</h1></div>
        <Link className="button primary" href="/app/trips/new">Create trip</Link>
      </section>
      {message.error ? <p className="auth-message error" role="alert">{message.error}</p> : null}
      {message.notice ? <p className="auth-message notice">{message.notice}</p> : null}
      {error ? <p className="auth-message error" role="alert">Trips could not be loaded.</p> : null}
      {trips.length ? (
        <div className="trip-grid">
          {trips.map((trip) => (
            <article className="trip-card" key={trip.id}>
              <p className="trip-origin">From {trip.origin ?? "Needs checking"}</p>
              <h2>{trip.name}</h2>
              <p>{formatTripDates(trip.start_date, trip.end_date)}</p>
              <div className="trip-card-footer">
                <span>{counts.get(trip.id) ?? 1} {(counts.get(trip.id) ?? 1) === 1 ? "member" : "members"}</span>
                <Link className="button secondary" href={`/app/trips/${trip.id}`}>Open</Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <p className="eyebrow">Nothing here yet</p>
          <h2>Start with one small decision.</h2>
          <p>Create the shared trip first. Destinations and day-by-day planning come later.</p>
          <Link className="button primary" href="/app/trips/new">Create your first trip</Link>
        </section>
      )}
    </main>
  );
}
