"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tripRoles } from "@/features/trips/types";

const uuid = z.string().uuid();
const tripSchema = z.object({
  name: z.string().trim().min(1).max(120),
  origin: z.string().trim().min(1).max(120),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).refine((value) => value.endDate >= value.startDate, { message: "End date must be on or after the start date." });
const inviteSchema = z.object({ email: z.email(), role: z.enum(tripRoles) });

export type InviteState = { error?: string; invitePath?: string; email?: string };

function messagePath(path: string, kind: "error" | "notice", message: string) {
  const params = new URLSearchParams({ [kind]: message });
  return `${path}?${params.toString()}`;
}

function safeDatabaseMessage(message?: string) {
  if (message?.includes("Permission denied")) return "You do not have permission to do that.";
  if (message?.includes("invalid or expired") || message?.includes("not active")) return "That invitation is no longer active.";
  if (message?.includes("another email")) return "This invitation was sent to a different email address.";
  if (message?.includes("owner must delete")) return "Trip owners cannot leave their trip. Delete it instead.";
  return "We couldn’t save that change. Please try again.";
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

export async function createTrip(formData: FormData) {
  const parsed = tripSchema.safeParse({
    name: formData.get("name"), origin: formData.get("origin"),
    startDate: formData.get("startDate"), endDate: formData.get("endDate"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) redirect(messagePath("/app/trips/new", "error", parsed.error.issues[0]?.message ?? "Check the trip details."));

  const supabase = await authenticatedClient();
  const { data, error } = await supabase.rpc("create_trip_with_dates", {
    trip_name: parsed.data.name, trip_origin: parsed.data.origin,
    trip_start_date: parsed.data.startDate, trip_end_date: parsed.data.endDate,
    trip_currency: parsed.data.currency,
  });
  const trip = data as { id?: string } | null;
  if (error || !trip?.id) redirect(messagePath("/app/trips/new", "error", safeDatabaseMessage(error?.message)));
  revalidatePath("/app");
  redirect(`/app/trips/${trip.id}`);
}

export async function updateTrip(tripId: string, formData: FormData) {
  if (!uuid.safeParse(tripId).success) redirect("/app");
  const parsed = tripSchema.safeParse({
    name: formData.get("name"), origin: formData.get("origin"),
    startDate: formData.get("startDate"), endDate: formData.get("endDate"),
    currency: formData.get("currency"),
  });
  const path = `/app/trips/${tripId}`;
  if (!parsed.success) redirect(messagePath(path, "error", parsed.error.issues[0]?.message ?? "Check the trip details."));
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("trips").update({
    name: parsed.data.name, origin: parsed.data.origin, start_date: parsed.data.startDate,
    end_date: parsed.data.endDate, primary_currency: parsed.data.currency, date_precision: "exact",
  }).eq("id", tripId).select("id").maybeSingle();
  if (error || !data) redirect(messagePath(path, "error", safeDatabaseMessage(error?.message)));
  revalidatePath(path);
  revalidatePath("/app");
  redirect(messagePath(path, "notice", "Trip details updated."));
}

export async function createInvite(tripId: string, _state: InviteState, formData: FormData): Promise<InviteState> {
  if (!uuid.safeParse(tripId).success) return { error: "Trip not found." };
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: "Enter a valid email and role." };
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.rpc("create_trip_invite", {
    target_trip_id: tripId, invite_email: parsed.data.email, invite_role: parsed.data.role,
  });
  const invite = (data as Array<{ invite_token?: string }> | null)?.[0];
  if (error || !invite?.invite_token) return { error: safeDatabaseMessage(error?.message) };
  revalidatePath(`/app/trips/${tripId}`);
  return { invitePath: `/app/invites/${invite.invite_token}`, email: parsed.data.email };
}

export async function acceptInvite(token: string) {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.rpc("accept_trip_invite", { invite_token: token });
  if (error || typeof data !== "string") redirect(messagePath(`/app/invites/${encodeURIComponent(token)}`, "error", safeDatabaseMessage(error?.message)));
  revalidatePath("/app");
  redirect(`/app/trips/${data}`);
}

export async function changeMemberRole(tripId: string, userId: string, formData: FormData) {
  const role = z.enum(tripRoles).safeParse(formData.get("role"));
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(userId).success || !role.success) redirect(messagePath(path, "error", "Invalid member change."));
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("trip_members").update({ role: role.data }).eq("trip_id", tripId).eq("user_id", userId).eq("status", "active").select("user_id").maybeSingle();
  if (error || !data) redirect(messagePath(path, "error", safeDatabaseMessage(error?.message)));
  revalidatePath(path);
  redirect(messagePath(path, "notice", "Member role updated."));
}

export async function removeMember(tripId: string, userId: string) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(userId).success) redirect(messagePath(path, "error", "Invalid member."));
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("trip_members").update({ status: "removed", removed_at: new Date().toISOString() }).eq("trip_id", tripId).eq("user_id", userId).neq("role", "owner").select("user_id").maybeSingle();
  if (error || !data) redirect(messagePath(path, "error", safeDatabaseMessage(error?.message)));
  revalidatePath(path);
  redirect(messagePath(path, "notice", "Member removed."));
}

export async function revokeInvite(tripId: string, inviteId: string) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(inviteId).success) redirect(messagePath(path, "error", "Invalid invitation."));
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("revoke_trip_invite", { target_invite_id: inviteId });
  if (error) redirect(messagePath(path, "error", safeDatabaseMessage(error.message)));
  revalidatePath(path);
  redirect(messagePath(path, "notice", "Invitation revoked."));
}

export async function leaveTrip(tripId: string) {
  if (!uuid.safeParse(tripId).success) redirect("/app");
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("leave_trip", { target_trip_id: tripId });
  if (error) redirect(messagePath(`/app/trips/${tripId}`, "error", safeDatabaseMessage(error.message)));
  revalidatePath("/app");
  redirect(messagePath("/app", "notice", "You left the trip."));
}

export async function deleteTrip(tripId: string) {
  if (!uuid.safeParse(tripId).success) redirect("/app");
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("trips").delete().eq("id", tripId).select("id").maybeSingle();
  if (error || !data) redirect(messagePath(`/app/trips/${tripId}`, "error", safeDatabaseMessage(error?.message)));
  revalidatePath("/app");
  redirect(messagePath("/app", "notice", "Trip deleted."));
}
