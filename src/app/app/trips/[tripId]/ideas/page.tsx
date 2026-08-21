import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { IdeaForm, IdeaScheduleForm } from "@/features/trips/planning-forms";
import { type Destination, type Idea } from "@/features/trips/planning";
import { formatTripDates, type TripMember, type TripSummary } from "@/features/trips/types";

export default async function IdeasPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!z.string().uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/auth");

  const [{ data: tripData }, { data: memberData }, { data: destinationData }, { data: ideaData }] = await Promise.all([
    supabase.from("trips").select("id,name,origin,start_date,end_date,primary_currency").eq("id", tripId).maybeSingle(),
    supabase.from("trip_members").select("user_id,role,status").eq("trip_id", tripId).eq("user_id", userId).eq("status", "active").maybeSingle(),
    supabase.from("destinations").select("id,trip_id,name,start_date,end_date,sort_order,notes").eq("trip_id", tripId).order("sort_order"),
    supabase.from("ideas").select("id,trip_id,destination_id,title,link,category,notes,status,scheduled_plan_item_id").eq("trip_id", tripId).eq("status", "unscheduled").order("created_at", { ascending: false }),
  ]);

  if (!tripData || !memberData) notFound();
  const trip = tripData as TripSummary;
  const member = memberData as Pick<TripMember, "role">;
  const destinations = (destinationData ?? []) as Destination[];
  const ideas = (ideaData ?? []) as Idea[];
  const destinationNames = new Map(destinations.map((destination) => [destination.id, destination.name]));
  const tripDates = { start: trip.start_date, end: trip.end_date };
  const canPlan = member.role !== "viewer";

  return <main className="app-shell visual-trip-shell ideas-page">
    <header className="app-header"><Link className="wordmark" href="/app">SUN</Link><Link className="text-link" href={`/app/trips/${tripId}`}>Back to trip</Link></header>
    <section className="visual-trip-header ideas-header"><div><p className="eyebrow">{formatTripDates(trip.start_date, trip.end_date)}</p><h1>Ideas</h1><p className="lede">Possibilities for {trip.name}, without committing them to the itinerary.</p></div>{canPlan ? <details className="add-sheet"><summary className="button primary">+ Add idea</summary><div className="sheet-card"><h3>Save an idea</h3><IdeaForm tripId={tripId} destinations={destinations} /></div></details> : null}</section>
    <nav className="trip-tabs" aria-label="Trip sections"><Link href={`/app/trips/${tripId}`}>Trip</Link><span aria-disabled="true">Explore</span><a aria-current="page" href="#ideas">Ideas</a><span aria-disabled="true">Money</span><span aria-disabled="true">Check</span></nav>
    <section id="ideas" className="ideas-workspace ideas-workspace-page"><div className="section-heading"><p className="eyebrow">Saved possibilities</p><h2>All Ideas · {ideas.length}</h2></div>{ideas.length ? <div className="idea-grid">{ideas.map((idea) => <article className="idea-card" key={idea.id}><span>{idea.category || "Idea"}</span><h3>{idea.title}</h3><p>{destinationNames.get(idea.destination_id ?? "") ?? "Any destination"}</p>{idea.link ? <a href={idea.link} rel="noreferrer" target="_blank">Open link</a> : null}{canPlan && destinations.length ? <details><summary className="text-button">Schedule</summary><IdeaScheduleForm tripId={tripId} idea={idea} destinations={destinations} tripDates={tripDates} /></details> : null}</article>)}</div> : <div className="empty-state"><h2>No Ideas yet</h2><p>Save a possibility now and decide when—or whether—to schedule it later.</p></div>}</section>
  </main>;
}
