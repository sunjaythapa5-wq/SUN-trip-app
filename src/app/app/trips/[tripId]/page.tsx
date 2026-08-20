import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "@/features/trips/invite-form";
import { formatTripDates, initials, tripRoles, type TripInvite, type TripMember, type TripSummary } from "@/features/trips/types";
import { changeMemberRole, deleteTrip, leaveTrip, removeMember, revokeInvite, updateTrip } from "../actions";

export default async function TripPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { tripId } = await params;
  if (!z.string().uuid().safeParse(tripId).success) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/auth");

  const [{ data: tripData }, { data: memberData }] = await Promise.all([
    supabase.from("trips").select("id,name,origin,start_date,end_date,primary_currency").eq("id", tripId).maybeSingle(),
    supabase.from("trip_members").select("user_id,role,status,profiles(display_name,avatar_url)").eq("trip_id", tripId).eq("status", "active"),
  ]);
  if (!tripData) notFound();
  const trip = tripData as TripSummary;
  const members = (memberData ?? []) as unknown as TripMember[];
  const currentMember = members.find((member) => member.user_id === userId);
  if (!currentMember) notFound();
  const canEdit = currentMember.role === "owner" || currentMember.role === "planner";
  const isOwner = currentMember.role === "owner";
  const { data: inviteData } = canEdit
    ? await supabase.from("trip_invites").select("id,email,role,expires_at,accepted_at,revoked_at").eq("trip_id", tripId).order("created_at", { ascending: false })
    : { data: [] };
  const invites = (inviteData ?? []) as TripInvite[];
  const message = await searchParams;

  return (
    <main className="app-shell trip-detail-shell">
      <header className="app-header"><Link className="wordmark" href="/app">SUN</Link><Link className="text-link" href="/app">All trips</Link></header>
      <section className="trip-hero">
        <div><p className="eyebrow">From {trip.origin ?? "Needs checking"}</p><h1>{trip.name}</h1><p className="lede">{formatTripDates(trip.start_date, trip.end_date)} · {trip.primary_currency}</p></div>
        <div className="avatar-stack" aria-label={`${members.length} trip members`}>
          {members.slice(0, 5).map((member) => <span className="avatar" key={member.user_id} title={member.profiles?.display_name ?? member.role}>{initials(member.profiles?.display_name ?? null)}</span>)}
          {members.length > 5 ? <span className="avatar">+{members.length - 5}</span> : null}
        </div>
      </section>
      <nav className="trip-tabs" aria-label="Trip sections">
        <span aria-current="page">Trip</span><span aria-disabled="true">Explore</span><span aria-disabled="true">Ideas</span><span aria-disabled="true">Money</span><span aria-disabled="true">Check</span>
      </nav>
      {message.error ? <p className="auth-message error" role="alert">{message.error}</p> : null}
      {message.notice ? <p className="auth-message notice">{message.notice}</p> : null}

      <div className="detail-grid">
        <section className="panel" aria-labelledby="details-title">
          <div className="section-heading"><div><p className="eyebrow">Canonical trip</p><h2 id="details-title">Trip details</h2></div><span className="role-badge">{currentMember.role}</span></div>
          {canEdit ? (
            <form action={updateTrip.bind(null, tripId)} className="trip-form compact-form">
              <label htmlFor="name">Trip name</label><input id="name" name="name" defaultValue={trip.name} required maxLength={120} />
              <label htmlFor="origin">Starting from</label><input id="origin" name="origin" defaultValue={trip.origin ?? ""} required maxLength={120} />
              <div className="field-row"><div><label htmlFor="startDate">Start date</label><input id="startDate" name="startDate" type="date" defaultValue={trip.start_date ?? ""} required /></div><div><label htmlFor="endDate">End date</label><input id="endDate" name="endDate" type="date" defaultValue={trip.end_date ?? ""} required /></div></div>
              <label htmlFor="currency">Primary currency</label><select id="currency" name="currency" defaultValue={trip.primary_currency}>{['AUD','USD','EUR','GBP','NZD','JPY','THB','CHF'].map((currency) => <option key={currency}>{currency}</option>)}</select>
              <button className="primary" type="submit">Save trip details</button>
            </form>
          ) : <dl className="facts"><div><dt>Starting from</dt><dd>{trip.origin}</dd></div><div><dt>Dates</dt><dd>{formatTripDates(trip.start_date, trip.end_date)}</dd></div><div><dt>Currency</dt><dd>{trip.primary_currency}</dd></div></dl>}
        </section>

        <section className="panel" aria-labelledby="members-title">
          <div className="section-heading"><div><p className="eyebrow">Shared access</p><h2 id="members-title">Members · {members.length}</h2></div></div>
          <div className="member-list">
            {members.map((member) => (
              <article className="member-row" key={member.user_id}>
                <span className="avatar">{initials(member.profiles?.display_name ?? null)}</span>
                <div className="member-copy"><strong>{member.user_id === userId ? "You" : member.profiles?.display_name ?? "Trip member"}</strong><span>{member.role}</span></div>
                {isOwner && member.role !== "owner" ? <div className="member-actions"><form action={changeMemberRole.bind(null, tripId, member.user_id)}><select name="role" defaultValue={member.role} aria-label="Member role">{tripRoles.map((role) => <option key={role}>{role}</option>)}</select><button className="text-button" type="submit">Update</button></form><form action={removeMember.bind(null, tripId, member.user_id)}><button className="text-button danger-text" type="submit">Remove</button></form></div> : null}
              </article>
            ))}
          </div>
        </section>
      </div>

      {canEdit ? <InviteForm tripId={tripId} /> : null}
      {canEdit && invites.length ? <section className="panel"><div className="section-heading"><div><p className="eyebrow">Invitation history</p><h2>Invitations</h2></div></div><div className="invite-list">{invites.map((invite) => { const active = !invite.accepted_at && !invite.revoked_at && new Date(invite.expires_at) > new Date(); return <article className="invite-row" key={invite.id}><div><strong>{invite.email}</strong><span>{invite.role} · {invite.accepted_at ? "accepted" : invite.revoked_at ? "revoked" : active ? "pending" : "expired"}</span></div>{active ? <form action={revokeInvite.bind(null, tripId, invite.id)}><button className="text-button danger-text" type="submit">Revoke</button></form> : null}</article>; })}</div></section> : null}

      <section className="panel danger-zone" aria-labelledby="access-title">
        <div><p className="eyebrow">Access</p><h2 id="access-title">{isOwner ? "Delete this trip" : "Leave this trip"}</h2><p>{isOwner ? "Deletes the trip and all current Gate 3 membership records." : "You will immediately lose access unless invited again."}</p></div>
        <form action={isOwner ? deleteTrip.bind(null, tripId) : leaveTrip.bind(null, tripId)}><button className="danger-button" type="submit">{isOwner ? "Delete trip" : "Leave trip"}</button></form>
      </section>
    </main>
  );
}
