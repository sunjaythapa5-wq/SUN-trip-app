export const preferenceValues = ["must_do", "keen", "maybe", "skip"] as const;
export const participationValues = ["going", "not_going"] as const;

export type PreferenceValue = (typeof preferenceValues)[number];
export type ParticipationValue = (typeof participationValues)[number];
export type CollaborationTarget = "idea" | "plan_item";

export type Reaction = {
  id: string;
  trip_id: string;
  member_id: string;
  target_type: CollaborationTarget;
  idea_id: string | null;
  plan_item_id: string | null;
  preference: PreferenceValue;
};

export type ItemParticipant = {
  id: string;
  trip_id: string;
  plan_item_id: string;
  member_id: string;
  participation: ParticipationValue;
};

export type Decision = {
  id: string;
  trip_id: string;
  question: string;
  status: "open" | "resolved";
  resolved_option_id: string | null;
  created_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

export type DecisionOption = {
  id: string;
  decision_id: string;
  trip_id: string;
  label: string;
  option_kind: "text" | "idea" | "plan_item" | "scenario";
  sort_order: number;
};

export type DecisionResponse = {
  id: string;
  decision_id: string;
  option_id: string;
  trip_id: string;
  member_id: string;
};

const labels: Record<PreferenceValue, string> = { must_do: "Must do", keen: "Keen", maybe: "Maybe", skip: "Skip" };

export function preferenceLabel(value: PreferenceValue) {
  return labels[value];
}

export function preferenceSummary(values: PreferenceValue[], memberCount: number, missingName?: string) {
  if (!values.length) return memberCount === 1 ? "Add my preference" : missingName ? `${missingName} hasn't weighed in yet` : "No preferences yet";
  if (memberCount === 1) return `My preference · ${preferenceLabel(values[0])}`;
  if (memberCount === 2) {
    if (values.length === 1) return missingName ? `${missingName} hasn't weighed in yet` : `One traveller · ${preferenceLabel(values[0])}`;
    if (values[0] === values[1]) return values[0] === "keen" ? "Both keen" : values[0] === "must_do" ? "Both must do" : `Both · ${preferenceLabel(values[0])}`;
    const positive = values.every((value) => value === "must_do" || value === "keen");
    return positive ? "Both positive" : "Different preferences";
  }
  const counts = preferenceValues.map((value) => ({ value, count: values.filter((item) => item === value).length })).filter((item) => item.count);
  const summary = counts.map((item) => `${item.count} ${preferenceLabel(item.value)}`).join(" · ");
  const missing = Math.max(0, memberCount - values.length);
  return missing ? `${summary} · ${missing} ${missing === 1 ? "hasn't" : "haven't"} weighed in` : summary;
}

export function participationSummary(going: number, memberCount: number) {
  if (memberCount === 1) return going ? "I'm going" : "Set my participation";
  if (memberCount === 2 && going === 2) return "Both going";
  return `${going} going`;
}

export function decisionSummary(responseLabels: string[], memberCount: number) {
  if (!responseLabels.length) return memberCount === 1 ? "Make my choice" : "No responses yet";
  if (memberCount === 1) return `My choice · ${responseLabels[0]}`;
  if (memberCount === 2 && responseLabels.length === 2) return responseLabels[0] === responseLabels[1] ? `Both prefer ${responseLabels[0]}` : "Different preferences";
  const counts = new Map<string, number>();
  responseLabels.forEach((label) => counts.set(label, (counts.get(label) ?? 0) + 1));
  const result = [...counts].map(([label, count]) => `${label} · ${count}`).join(" · ");
  const missing = Math.max(0, memberCount - responseLabels.length);
  return missing ? `${result} · ${missing} ${missing === 1 ? "hasn't" : "haven't"} responded` : result;
}

export function isReactionEligible(itemType: string, status: string) {
  return ["activity", "food_place", "event", "custom"].includes(itemType) && status !== "booked";
}
