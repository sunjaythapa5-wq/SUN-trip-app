import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AutoDismissNotice, IdeaForm, IdeaScheduleForm } from "@/features/trips/planning-forms";
import { type Destination, type Idea } from "@/features/trips/planning";
import { AddedBy, PreferenceControl } from "@/features/trips/collaboration-ui";
import { type Reaction } from "@/features/trips/collaboration";
import { formatTripDates, type TripMember, type TripSummary } from "@/features/trips/types";

export default async function IdeasPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { tripId } = await params;
  if (!z.string().uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/auth");

  const [{ data: tripData }, { data: memberData }, { data: destinationData }, { data: ideaData }, { data: reactionData }] = await Promise.all([
    supabase.from("trips").select("id,name,origin,start_date,end_date,primary_currency").eq("id", tripId).maybeSingle(),
    supabase.from("trip_members").select("user_id,role,status,profiles(display_name,avatar_url)").eq("trip_id", tripId).eq("status", "active"),
    supabase.from("destinations").select("id,trip_id,name,start_date,end_date,sort_order,notes").eq("trip_id", tripId).order("sort_order"),
    supabase.from("ideas").select("id,trip_id,destination_id,title,link,category,notes,status,scheduled_plan_item_id,created_by").eq("trip_id", tripId).eq("status", "unscheduled").order("created_at", { ascending: false }),
    supabase.from("reactions").select("id,trip_id,member_id,target_type,idea_id,plan_item_id,preference").eq("trip_id", tripId).eq("target_type", "idea"),
  ]);

  const members = (memberData ?? []) as unknown as TripMember[];
  const member = members.find((item) => item.user_id === userId);
  if (!tripData || !member) notFound();
  const trip = tripData as TripSummary;
  const destinations = (destinationData ?? []) as Destination[];
  const ideas = (ideaData ?? []) as Idea[];
  const reactions = (reactionData ?? []) as Reaction[];
  const destinationNames = new Map(destinations.map((destination) => [destination.id, destination.name]));
  const tripDates = { start: trip.start_date, end: trip.end_date };
  const canPlan = member.role === "owner" || member.role === "planner";
  const canCollaborate = member.role !== "viewer";
  const message = await searchParams;

  return <main className="app-shell visual-trip-shell ideas-page">
    <header className="app-header"><Link className="wordmark" href="/app">SUN</Link><Link className="text-link" href={`/app/trips/${tripId}`}>Back to trip</Link></header>
    <section className="visual-trip-header ideas-header"><div><p className="eyebrow">{formatTripDates(trip.start_date, trip.end_date)}</p><h1>Ideas</h1><p className="lede">Possibilities for {trip.name}, without committing them to the itinerary.</p></div>{canPlan ? <details className="add-sheet"><summary className="button primary">+ Add idea</summary><div className="sheet-card"><h3>Save an idea</h3><IdeaForm tripId={tripId} destinations={destinations} /></div></details> : null}</section>
    <nav className="trip-tabs" aria-label="Trip sections"><Link href={`/app/trips/${tripId}`}>Trip</Link><span aria-disabled="true">Explore</span><a aria-current="page" href="#ideas">Ideas</a><span aria-disabled="true">Money</span><span aria-disabled="true">Check</span></nav>{message.error ? <p className="auth-message error" role="alert">{message.error}</p> : null}{message.notice ? <AutoDismissNotice message={message.notice} /> : null}
    <section id="ideas" className="ideas-workspace ideas-workspace-page"><div className="section-heading"><div><p className="eyebrow">Saved possibilities</p><h2>All Ideas · {ideas.length}</h2></div><Link className="decision-signal subtle" href={`/app/trips/${tripId}/decisions`}>Decisions</Link></div>{ideas.length ? <div className="idea-grid">{ideas.map((idea) => <article className="idea-card" key={idea.id}><span>{idea.category || "Idea"}</span><h3>{idea.title}</h3><p>{destinationNames.get(idea.destination_id ?? "") ?? "Any destination"}</p><AddedBy userId={idea.created_by} members={members} /><PreferenceControl tripId={tripId} targetType="idea" targetId={idea.id} reactions={reactions} members={members} currentUserId={userId} canCollaborate={canCollaborate} />{idea.link ? <a href={idea.link} rel="noreferrer" target="_blank">Open link</a> : null}<div className="inline-actions">{canPlan && destinations.length ? <details><summary className="text-button">Schedule</summary><IdeaScheduleForm tripId={tripId} idea={idea} destinations={destinations} tripDates={tripDates} /></details> : null}{canPlan ? <Link className="text-link" href={`/app/trips/${tripId}/decisions?idea=${idea.id}`}>Decide →</Link> : null}</div></article>)}</div> : <div className="empty-state"><h2>No Ideas yet</h2><p>Save a possibility now and decide when—or whether—to schedule it later.</p></div>}</section>
  </main>;
}
