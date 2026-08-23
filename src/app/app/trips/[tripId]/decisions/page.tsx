import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AutoDismissNotice } from "@/features/trips/planning-forms";
import { decisionSummary, type Decision, type DecisionOption, type DecisionResponse } from "@/features/trips/collaboration";
import { formatTripDates, type TripMember, type TripSummary } from "@/features/trips/types";
import { createDecision, resolveDecision, respondDecision } from "../../actions";

function DecisionCard({ decision, options, responses, members, userId, canCollaborate, canManage }: { decision: Decision; options: DecisionOption[]; responses: DecisionResponse[]; members: TripMember[]; userId: string; canCollaborate: boolean; canManage: boolean }) {
  const decisionOptions = options.filter((option) => option.decision_id === decision.id).sort((a, b) => a.sort_order - b.sort_order);
  const decisionResponses = responses.filter((response) => response.decision_id === decision.id && members.some((member) => member.user_id === response.member_id));
  const labels = decisionResponses.map((response) => decisionOptions.find((option) => option.id === response.option_id)?.label).filter((label): label is string => Boolean(label));
  const current = decisionResponses.find((response) => response.member_id === userId);
  const resolved = decisionOptions.find((option) => option.id === decision.resolved_option_id);
  return <article className="decision-card"><p className="decision-kicker">Decision</p><h2>{decision.question}</h2><p className="decision-summary">{decision.status === "resolved" ? `Resolved · ${resolved?.label ?? "Chosen option"}` : decisionSummary(labels, members.length)}</p><div className="decision-results">{decisionOptions.map((option) => { const count = decisionResponses.filter((response) => response.option_id === option.id).length; return <div key={option.id}><span>{option.label}</span><strong>{count}</strong></div>; })}</div>{decision.status === "open" && canCollaborate ? <details className="add-sheet compact-sheet"><summary className="button secondary">{current ? "Change response" : "Respond"}</summary><div className="sheet-card"><p className="eyebrow">Your response</p><h3>{decision.question}</h3><form action={respondDecision.bind(null, decision.trip_id, decision.id)} className="decision-option-form">{decisionOptions.map((option) => <button className={current?.option_id === option.id ? "decision-option selected" : "decision-option"} name="optionId" value={option.id} key={option.id}>{option.label}</button>)}</form></div></details> : null}{decision.status === "open" && canManage ? <details className="add-sheet compact-sheet"><summary className="text-button">Resolve decision</summary><div className="sheet-card"><p className="eyebrow">Human decision</p><h3>Which option are we going with?</h3><form action={resolveDecision.bind(null, decision.trip_id, decision.id)} className="sheet-form"><label>Agreed option<select name="optionId" required defaultValue=""><option value="" disabled>Choose option</option>{decisionOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label><p className="context-hint">This records the decision. It will not change the itinerary or apply anything automatically.</p><button className="primary">Confirm resolution</button></form></div></details> : null}</article>;
}

export default async function DecisionsPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { tripId } = await params;
  if (!z.string().uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims?.sub;
  if (!userId) redirect("/auth");
  const [{ data: tripData }, { data: memberData }, { data: decisionData }, { data: optionData }, { data: responseData }] = await Promise.all([
    supabase.from("trips").select("id,name,origin,start_date,end_date,primary_currency").eq("id", tripId).maybeSingle(),
    supabase.from("trip_members").select("user_id,role,status,profiles(display_name,avatar_url)").eq("trip_id", tripId).eq("status", "active"),
    supabase.from("decisions").select("id,trip_id,question,status,resolved_option_id,created_by,resolved_by,resolved_at").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("decision_options").select("id,decision_id,trip_id,label,option_kind,sort_order").eq("trip_id", tripId).order("sort_order"),
    supabase.from("decision_responses").select("id,decision_id,option_id,trip_id,member_id").eq("trip_id", tripId),
  ]);
  const members = (memberData ?? []) as unknown as TripMember[];
  const member = members.find((item) => item.user_id === userId);
  if (!tripData || !member) notFound();
  const trip = tripData as TripSummary; const decisions = (decisionData ?? []) as Decision[]; const options = (optionData ?? []) as DecisionOption[]; const responses = (responseData ?? []) as DecisionResponse[];
  const canManage = member.role === "owner" || member.role === "planner"; const canCollaborate = member.role !== "viewer"; const message = await searchParams;
  return <main className="app-shell visual-trip-shell decisions-page"><header className="app-header"><Link className="wordmark" href="/app">SUN</Link><Link className="text-link" href={`/app/trips/${tripId}`}>Back to trip</Link></header><section className="visual-trip-header decisions-header"><div><p className="eyebrow">{formatTripDates(trip.start_date, trip.end_date)}</p><h1>Decisions</h1><p className="lede">Choices for {trip.name} that need a deliberate human answer.</p></div>{canManage ? <details className="add-sheet"><summary className="button primary">+ Create decision</summary><div className="sheet-card"><p className="eyebrow">New decision</p><h3>What are we deciding?</h3><form action={createDecision.bind(null, tripId)} className="sheet-form"><label>Question<input name="question" required maxLength={240} /></label><fieldset className="decision-options-field"><legend>Options</legend><label>Option 1<input name="options" required maxLength={180} /></label><label>Option 2<input name="options" required maxLength={180} /></label><label>Option 3<input name="options" maxLength={180} /></label><label>Option 4<input name="options" maxLength={180} /></label></fieldset><button className="primary">Create decision</button></form></div></details> : null}</section><nav className="trip-tabs" aria-label="Trip sections"><Link href={`/app/trips/${tripId}`}>Trip</Link><span aria-disabled="true">Explore</span><Link href={`/app/trips/${tripId}/ideas`}>Ideas</Link><span aria-disabled="true">Money</span><span aria-disabled="true">Check</span></nav>{message.error ? <p className="auth-message error" role="alert">{message.error}</p> : null}{message.notice ? <AutoDismissNotice message={message.notice} /> : null}<section className="decision-list">{decisions.length ? decisions.map((decision) => <DecisionCard decision={decision} options={options} responses={responses} members={members} userId={userId} canCollaborate={canCollaborate} canManage={canManage} key={decision.id} />) : <div className="empty-state"><h2>Nothing to decide yet</h2><p>Use Decisions only when a real choice needs resolving. Everyday preferences belong on Ideas and activities.</p></div>}</section></main>;
}
