export const tripRoles = ["planner", "traveller", "viewer"] as const;

export type TripRole = "owner" | (typeof tripRoles)[number];

export type TripSummary = {
  id: string;
  name: string;
  origin: string | null;
  start_date: string | null;
  end_date: string | null;
  primary_currency: string;
};

export type TripMember = {
  user_id: string;
  role: TripRole;
  status: "active" | "removed";
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};

export type TripInvite = {
  id: string;
  email: string | null;
  role: Exclude<TripRole, "owner">;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export function formatTripDates(start: string | null, end: string | null) {
  if (!start || !end) return "Dates need checking";
  const formatter = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(new Date(`${start}T00:00:00Z`))} – ${formatter.format(new Date(`${end}T00:00:00Z`))}`;
}

export function initials(name: string | null) {
  if (!name) return "T";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
