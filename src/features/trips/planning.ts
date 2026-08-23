export const planItemTypes = ["stay", "transport", "activity", "food_place", "event", "free_time", "custom"] as const;
export const planItemStatuses = ["planned", "needs_checking", "confirmed", "booked"] as const;
export const informationConfidences = ["unknown", "needs_checking", "estimated", "confirmed"] as const;

export type Destination = {
  id: string;
  trip_id: string;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
  notes: string | null;
};

export type PlanItem = {
  id: string;
  trip_id: string;
  item_type: (typeof planItemTypes)[number];
  title: string;
  destination_id: string | null;
  end_destination_id: string | null;
  item_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  sort_order: number;
  location: string | null;
  provider: string | null;
  status: (typeof planItemStatuses)[number];
  confidence: (typeof informationConfidences)[number];
  notes: string | null;
  created_by: string;
};

export type Idea = {
  id: string;
  trip_id: string;
  destination_id: string | null;
  title: string;
  link: string | null;
  category: string;
  notes: string | null;
  status: "unscheduled" | "scheduled";
  scheduled_plan_item_id: string | null;
  created_by: string;
};

export type DateContext = {
  selectedDate?: string | null;
  destinationStart?: string | null;
  itemDate?: string | null;
  transitionDate?: string | null;
  tripStart?: string | null;
};

const dayFormatter = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
const shortFormatter = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

export function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function dateRange(start: string, end: string) {
  const days: string[] = [];
  const cursor = utcDate(start);
  const last = utcDate(end);
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function nightsBetween(start: string, end: string) {
  return Math.max(0, Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000));
}

export function contextualDate(context: DateContext, fallback = new Date().toISOString().slice(0, 10)) {
  return context.selectedDate ?? context.destinationStart ?? context.itemDate ?? context.transitionDate ?? context.tripStart ?? fallback;
}

export function isDateWithin(date: string, start?: string | null, end?: string | null) {
  return (!start || date >= start) && (!end || date <= end);
}

export function journeyWidth(nights: number) {
  return Math.min(240, Math.max(140, 128 + nights * 12));
}

export function formatDay(date: string) {
  return dayFormatter.format(utcDate(date)).toUpperCase();
}

export function formatShortRange(start: string, end: string) {
  return `${shortFormatter.format(utcDate(start))} – ${shortFormatter.format(utcDate(end))}`;
}

export function itemLabel(type: PlanItem["item_type"]) {
  return ({ stay: "Stay", transport: "Transport", activity: "Activity", food_place: "Food / place", event: "Event", free_time: "Free time", custom: "Custom" })[type];
}

export function statusLabel(status: PlanItem["status"]) {
  return ({ planned: "Planned", needs_checking: "Needs checking", confirmed: "Confirmed", booked: "Booked" })[status];
}

export function confidenceLabel(confidence: PlanItem["confidence"]) {
  return ({ unknown: "Unknown", needs_checking: "Needs checking", estimated: "Estimated", confirmed: "Confirmed" })[confidence];
}
