import { setParticipation, setPreference } from "@/app/app/trips/actions";
import { participationSummary, preferenceLabel, preferenceSummary, preferenceValues, type CollaborationTarget, type ItemParticipant, type Reaction } from "./collaboration";

type Member = { user_id: string; profiles: { display_name: string | null; avatar_url: string | null } | null };

function memberName(member: Member | undefined, currentUserId: string) {
  if (!member) return "A traveller";
  if (member.user_id === currentUserId) return "You";
  return member.profiles?.display_name ?? "Traveller";
}

export function PreferenceControl({ tripId, targetType, targetId, reactions, members, currentUserId, canCollaborate }: { tripId: string; targetType: CollaborationTarget; targetId: string; reactions: Reaction[]; members: Member[]; currentUserId: string; canCollaborate: boolean }) {
  const targetReactions = reactions.filter((reaction) => reaction.target_type === targetType && (targetType === "idea" ? reaction.idea_id === targetId : reaction.plan_item_id === targetId) && members.some((member) => member.user_id === reaction.member_id));
  const current = targetReactions.find((reaction) => reaction.member_id === currentUserId);
  const missing = members.length === 2 ? members.find((member) => !targetReactions.some((reaction) => reaction.member_id === member.user_id)) : undefined;
  const summary = preferenceSummary(targetReactions.map((reaction) => reaction.preference), members.length, missing ? memberName(missing, currentUserId) : undefined);
  return <div className="collaboration-control"><strong>{summary}</strong>{canCollaborate ? <details className="add-sheet compact-sheet"><summary className="text-button">{current ? `My preference · ${preferenceLabel(current.preference)}` : "Add preference"}</summary><div className="sheet-card"><p className="eyebrow">Preference</p><h3>How do you feel about this?</h3><form action={setPreference.bind(null, tripId, targetType, targetId)} className="preference-grid">{preferenceValues.map((value) => <button className={current?.preference === value ? "preference-choice selected" : "preference-choice"} name="preference" value={value} key={value}>{preferenceLabel(value)}</button>)}</form>{targetReactions.length > 1 ? <div className="preference-detail"><h4>Trip preferences</h4>{targetReactions.map((reaction) => <p key={reaction.id}><span>{memberName(members.find((member) => member.user_id === reaction.member_id), currentUserId)}</span><strong>{preferenceLabel(reaction.preference)}</strong></p>)}</div> : null}</div></details> : targetReactions.length ? <span className="muted-note">View only</span> : null}</div>;
}

export function ParticipationControl({ tripId, itemId, participants, members, currentUserId, canCollaborate }: { tripId: string; itemId: string; participants: ItemParticipant[]; members: Member[]; currentUserId: string; canCollaborate: boolean }) {
  const itemParticipants = participants.filter((participant) => participant.plan_item_id === itemId && members.some((member) => member.user_id === participant.member_id));
  const current = itemParticipants.find((participant) => participant.member_id === currentUserId);
  const going = itemParticipants.filter((participant) => participant.participation === "going");
  return <div className="participation-control"><div className="mini-avatar-stack" aria-label={participationSummary(going.length, members.length)}>{going.slice(0, 5).map((participant) => <span key={participant.member_id}>{memberName(members.find((member) => member.user_id === participant.member_id), currentUserId).slice(0, 1)}</span>)}{going.length > 5 ? <span>+{going.length - 5}</span> : null}</div><strong>{participationSummary(going.length, members.length)}</strong>{canCollaborate ? <details className="add-sheet compact-sheet"><summary className="text-button">{current ? (current.participation === "going" ? "Going" : "Not going") : "Who's doing this?"}</summary><div className="sheet-card"><p className="eyebrow">Participation</p><h3>Are you doing this?</h3><form action={setParticipation.bind(null, tripId, itemId)} className="preference-grid"><button className={current?.participation === "going" ? "preference-choice selected" : "preference-choice"} name="participation" value="going">Going</button><button className={current?.participation === "not_going" ? "preference-choice selected" : "preference-choice"} name="participation" value="not_going">Not going</button></form></div></details> : null}</div>;
}

export function AddedBy({ userId, members }: { userId: string; members: Member[] }) {
  const member = members.find((item) => item.user_id === userId);
  return <span className="attribution">Added by {member?.profiles?.display_name ?? "a traveller"}</span>;
}
