"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tripRoles } from "@/features/trips/types";
import { planItemStatuses, planItemTypes } from "@/features/trips/planning";

const uuid = z.string().uuid();
const tripSchema = z.object({
  name: z.string().trim().min(1).max(120),
  origin: z.string().trim().min(1).max(120),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).refine((value) => value.endDate >= value.startDate, { message: "End date must be on or after the start date." });
const inviteSchema = z.object({ email: z.email(), role: z.enum(tripRoles) });
const nullableText = (maximum = 4000) => z.string().trim().max(maximum).transform((value) => value || null);
const destinationSchema = z.object({
  name: z.string().trim().min(1).max(120), startDate: z.iso.date(), endDate: z.iso.date(), notes: nullableText(),
}).refine((value) => value.endDate >= value.startDate, { message: "Destination end date must be on or after its start date." });
const planItemSchema = z.object({
  type: z.enum(planItemTypes), title: z.string().trim().min(1).max(160), destinationId: z.string().uuid().nullable(),
  endDestinationId: z.string().uuid().nullable(), itemDate: z.iso.date().nullable(), endDate: z.iso.date().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(), endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  location: nullableText(240), provider: nullableText(160), status: z.enum(planItemStatuses), notes: nullableText(),
}).superRefine((value, context) => {
  if (value.type === "transport" && (!value.destinationId || !value.endDestinationId)) context.addIssue({ code: "custom", message: "Transport needs a start and end destination." });
  if (value.type === "stay" && (!value.destinationId || !value.itemDate || !value.endDate)) context.addIssue({ code: "custom", message: "A stay needs a destination, check-in and check-out." });
  if (value.endDate && value.itemDate && value.endDate < value.itemDate) context.addIssue({ code: "custom", message: "End date must be on or after the start date." });
});
const ideaSchema = z.object({ title: z.string().trim().min(1).max(160), destinationId: z.string().uuid().nullable(), link: z.union([z.url(), z.literal("")]).transform((value) => value || null), category: z.string().trim().min(1).max(60), notes: nullableText() });

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
  if (message?.includes("Idea is not available")) return "That idea has already been scheduled or removed.";
  if (message?.includes("Invalid destination date")) return "Choose a day within that destination.";
  if (message?.includes("duplicate key")) return "That order is already in use. Refresh and try again.";
  return "We couldn’t save that change. Please try again.";
}

function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : null;
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

export async function createDestination(tripId: string, formData: FormData) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success) redirect("/app");
  const parsed = destinationSchema.safeParse({ name: formData.get("name"), startDate: formData.get("startDate"), endDate: formData.get("endDate"), notes: formData.get("notes") });
  if (!parsed.success) redirect(messagePath(path, "error", parsed.error.issues[0]?.message ?? "Check the destination."));
  const supabase = await authenticatedClient();
  const { data: last } = await supabase.from("destinations").select("sort_order").eq("trip_id", tripId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("destinations").insert({ trip_id: tripId, name: parsed.data.name, start_date: parsed.data.startDate, end_date: parsed.data.endDate, notes: parsed.data.notes, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) redirect(messagePath(path, "error", safeDatabaseMessage(error.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", `${parsed.data.name} added.`));
}

export async function updateDestination(tripId: string, destinationId: string, formData: FormData) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(destinationId).success) redirect(path);
  const parsed = destinationSchema.safeParse({ name: formData.get("name"), startDate: formData.get("startDate"), endDate: formData.get("endDate"), notes: formData.get("notes") });
  if (!parsed.success) redirect(messagePath(path, "error", parsed.error.issues[0]?.message ?? "Check the destination."));
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("destinations").update({ name: parsed.data.name, start_date: parsed.data.startDate, end_date: parsed.data.endDate, notes: parsed.data.notes }).eq("id", destinationId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error || !data) redirect(messagePath(path, "error", safeDatabaseMessage(error?.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", "Destination updated."));
}

export async function moveDestination(tripId: string, destinationId: string, direction: "earlier" | "later") {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(destinationId).success) redirect(path);
  const supabase = await authenticatedClient();
  const { data: rows, error } = await supabase.from("destinations").select("id,sort_order").eq("trip_id", tripId).order("sort_order");
  if (error) redirect(messagePath(path, "error", safeDatabaseMessage(error.message)));
  const index = rows?.findIndex((row) => row.id === destinationId) ?? -1;
  const swapIndex = direction === "earlier" ? index - 1 : index + 1;
  if (!rows || index < 0 || swapIndex < 0 || swapIndex >= rows.length) redirect(path);
  const temporaryOrder = Math.max(...rows.map((row) => row.sort_order)) + 1;
  const current = rows[index]; const swap = rows[swapIndex];
  const first = await supabase.from("destinations").update({ sort_order: temporaryOrder }).eq("id", current.id).eq("trip_id", tripId);
  const second = first.error ? first : await supabase.from("destinations").update({ sort_order: current.sort_order }).eq("id", swap.id).eq("trip_id", tripId);
  const third = second.error ? second : await supabase.from("destinations").update({ sort_order: swap.sort_order }).eq("id", current.id).eq("trip_id", tripId);
  if (third.error) redirect(messagePath(path, "error", safeDatabaseMessage(third.error.message)));
  revalidatePath(path); redirect(path);
}

export async function deleteDestination(tripId: string, destinationId: string) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(destinationId).success) redirect(path);
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("destinations").delete().eq("id", destinationId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error || !data) redirect(messagePath(path, "error", safeDatabaseMessage(error?.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", "Destination and its linked planning items removed."));
}

export async function createPlanItem(tripId: string, formData: FormData) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success) redirect("/app");
  const parsed = planItemSchema.safeParse({ type: formData.get("type"), title: formData.get("title"), destinationId: optional(formData, "destinationId"), endDestinationId: optional(formData, "endDestinationId"), itemDate: optional(formData, "itemDate"), endDate: optional(formData, "endDate"), startTime: optional(formData, "startTime"), endTime: optional(formData, "endTime"), location: formData.get("location"), provider: formData.get("provider"), status: formData.get("status"), notes: formData.get("notes") });
  if (!parsed.success) redirect(messagePath(path, "error", parsed.error.issues[0]?.message ?? "Check the item."));
  const supabase = await authenticatedClient();
  const { data: last } = await supabase.from("plan_items").select("sort_order").eq("trip_id", tripId).eq("item_date", parsed.data.itemDate).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("plan_items").insert({ trip_id: tripId, item_type: parsed.data.type, title: parsed.data.title, destination_id: parsed.data.destinationId, end_destination_id: parsed.data.endDestinationId, item_date: parsed.data.itemDate, end_date: parsed.data.endDate, start_time: parsed.data.startTime, end_time: parsed.data.endTime, sort_order: (last?.sort_order ?? -1) + 1, location: parsed.data.location, provider: parsed.data.provider, status: parsed.data.status, notes: parsed.data.notes });
  if (error) redirect(messagePath(path, "error", safeDatabaseMessage(error.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", "Plan updated."));
}

export async function updatePlanItem(tripId: string, itemId: string, formData: FormData) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(tripId).success || !uuid.safeParse(itemId).success) redirect(path);
  const parsed = planItemSchema.safeParse({ type: formData.get("type"), title: formData.get("title"), destinationId: optional(formData, "destinationId"), endDestinationId: optional(formData, "endDestinationId"), itemDate: optional(formData, "itemDate"), endDate: optional(formData, "endDate"), startTime: optional(formData, "startTime"), endTime: optional(formData, "endTime"), location: formData.get("location"), provider: formData.get("provider"), status: formData.get("status"), notes: formData.get("notes") });
  if (!parsed.success) redirect(messagePath(path, "error", parsed.error.issues[0]?.message ?? "Check the item."));
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("plan_items").update({ item_type: parsed.data.type, title: parsed.data.title, destination_id: parsed.data.destinationId, end_destination_id: parsed.data.endDestinationId, item_date: parsed.data.itemDate, end_date: parsed.data.endDate, start_time: parsed.data.startTime, end_time: parsed.data.endTime, location: parsed.data.location, provider: parsed.data.provider, status: parsed.data.status, notes: parsed.data.notes }).eq("id", itemId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error || !data) redirect(messagePath(path, "error", safeDatabaseMessage(error?.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", "Item updated."));
}

export async function movePlanItem(tripId: string, itemId: string, direction: "earlier" | "later") {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(itemId).success) redirect(path);
  const supabase = await authenticatedClient();
  const { data: current } = await supabase.from("plan_items").select("item_date,sort_order").eq("id", itemId).eq("trip_id", tripId).maybeSingle();
  if (!current) redirect(path);
  let query = supabase.from("plan_items").select("id,sort_order").eq("trip_id", tripId).eq("item_date", current.item_date);
  query = direction === "earlier" ? query.lt("sort_order", current.sort_order).order("sort_order", { ascending: false }) : query.gt("sort_order", current.sort_order).order("sort_order");
  const { data: adjacent } = await query.limit(1).maybeSingle();
  if (!adjacent) redirect(path);
  const temporary = Math.max(current.sort_order, adjacent.sort_order) + 100000;
  const first = await supabase.from("plan_items").update({ sort_order: temporary }).eq("id", itemId).eq("trip_id", tripId);
  const second = first.error ? first : await supabase.from("plan_items").update({ sort_order: current.sort_order }).eq("id", adjacent.id).eq("trip_id", tripId);
  const third = second.error ? second : await supabase.from("plan_items").update({ sort_order: adjacent.sort_order }).eq("id", itemId).eq("trip_id", tripId);
  if (third.error) redirect(messagePath(path, "error", safeDatabaseMessage(third.error.message)));
  revalidatePath(path); redirect(path);
}

export async function deletePlanItem(tripId: string, itemId: string) {
  const path = `/app/trips/${tripId}`;
  if (!uuid.safeParse(itemId).success) redirect(path);
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.from("plan_items").delete().eq("id", itemId).eq("trip_id", tripId).select("id").maybeSingle();
  if (error || !data) redirect(messagePath(path, "error", safeDatabaseMessage(error?.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", "Item removed."));
}

export async function createIdea(tripId: string, formData: FormData) {
  const path = `/app/trips/${tripId}`;
  const parsed = ideaSchema.safeParse({ title: formData.get("title"), destinationId: optional(formData, "destinationId"), link: formData.get("link"), category: formData.get("category"), notes: formData.get("notes") });
  if (!uuid.safeParse(tripId).success || !parsed.success) redirect(messagePath(path, "error", parsed.success ? "Trip not found." : parsed.error.issues[0]?.message ?? "Check the idea."));
  const supabase = await authenticatedClient();
  const { error } = await supabase.from("ideas").insert({ trip_id: tripId, title: parsed.data.title, destination_id: parsed.data.destinationId, link: parsed.data.link, category: parsed.data.category, notes: parsed.data.notes });
  if (error) redirect(messagePath(path, "error", safeDatabaseMessage(error.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", "Idea saved for later."));
}

export async function scheduleIdea(tripId: string, ideaId: string, formData: FormData) {
  const path = `/app/trips/${tripId}`;
  const destinationId = z.string().uuid().safeParse(formData.get("destinationId"));
  const date = z.iso.date().safeParse(formData.get("itemDate"));
  if (!uuid.safeParse(ideaId).success || !destinationId.success || !date.success) redirect(messagePath(path, "error", "Choose a destination and date."));
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("schedule_trip_idea", { target_idea_id: ideaId, target_destination_id: destinationId.data, target_date: date.data });
  if (error) redirect(messagePath(path, "error", safeDatabaseMessage(error.message)));
  revalidatePath(path); redirect(messagePath(path, "notice", "Idea scheduled."));
}
