"use client";

import { useActionState, useState } from "react";
import { createInvite, type InviteState } from "@/app/app/trips/actions";

const initialState: InviteState = {};

export function InviteForm({ tripId }: { tripId: string }) {
  const action = createInvite.bind(null, tripId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [copied, setCopied] = useState(false);
  const inviteUrl = state.invitePath && typeof window !== "undefined"
    ? new URL(state.invitePath, window.location.origin).toString()
    : null;

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  return (
    <section className="panel" aria-labelledby="invite-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Private invitation</p>
          <h2 id="invite-title">Invite a traveller</h2>
        </div>
      </div>
      <form action={formAction} className="compact-form">
        <label htmlFor="invite-email">Email</label>
        <input id="invite-email" name="email" type="email" autoComplete="email" required placeholder="traveller@example.com" />
        <label htmlFor="invite-role">Role</label>
        <select id="invite-role" name="role" defaultValue="traveller">
          <option value="planner">Planner — can edit and invite</option>
          <option value="traveller">Traveller — read only for now</option>
          <option value="viewer">Viewer — read only</option>
        </select>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Creating…" : "Create invitation"}</button>
      </form>
      {state.error ? <p className="auth-message error" role="alert">{state.error}</p> : null}
      {inviteUrl ? (
        <div className="invite-result" aria-live="polite">
          <p><strong>Invitation ready.</strong> It expires in seven days and only works for {state.email}.</p>
          <div className="inline-actions">
            <button className="secondary" type="button" onClick={copyInvite}>{copied ? "Copied" : "Copy link"}</button>
            <a className="button secondary" href={`mailto:${encodeURIComponent(state.email ?? "")}?subject=${encodeURIComponent("Your SUN trip invitation")}&body=${encodeURIComponent(`Join my trip: ${inviteUrl}`)}`}>Open email</a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
