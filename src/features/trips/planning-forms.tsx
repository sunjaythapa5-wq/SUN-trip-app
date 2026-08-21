"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confidenceLabel,
  contextualDate,
  dateRange,
  formatDay,
  informationConfidences,
  itemLabel,
  nightsBetween,
  planItemStatuses,
  statusLabel,
  type Destination,
  type Idea,
  type PlanItem,
} from "./planning";
import { createDestination, createIdea, createPlanItem, scheduleIdea, updateDestination, updatePlanItem } from "@/app/app/trips/actions";

type TripDates = { start: string | null; end: string | null };

function Duration({ start, end, label = "nights" }: { start: string; end: string; label?: string }) {
  if (!start || !end || end < start) return null;
  const nights = nightsBetween(start, end);
  return <p className="duration-preview" aria-live="polite">{start} → {end} · {nights} {nights === 1 ? label.replace(/s$/, "") : label}</p>;
}

export function DestinationForm({ tripId, tripDates, destination }: { tripId: string; tripDates: TripDates; destination?: Destination }) {
  const suggestedStart = contextualDate({ selectedDate: destination?.start_date, tripStart: tripDates.start });
  const [start, setStart] = useState(suggestedStart);
  const [end, setEnd] = useState(destination?.end_date ?? start);
  const action = destination ? updateDestination.bind(null, tripId, destination.id) : createDestination.bind(null, tripId);
  return <form action={action} className="sheet-form">
    <label>Place<input name="name" defaultValue={destination?.name ?? ""} required maxLength={120} /></label>
    <div className="field-row"><label>Arrive<input type="date" name="startDate" value={start} min={tripDates.start ?? undefined} max={tripDates.end ?? undefined} onChange={(event) => { setStart(event.target.value); if (end < event.target.value) setEnd(event.target.value); }} required /></label><label>Leave<input type="date" name="endDate" value={end} min={start || tripDates.start || undefined} max={tripDates.end ?? undefined} onChange={(event) => setEnd(event.target.value)} required /></label></div>
    {!destination && tripDates.start ? <p className="context-hint">Suggested from this trip’s dates. Nothing is confirmed until you save.</p> : null}
    <Duration start={start} end={end} />
    <details className="more-fields"><summary>Notes</summary><label>Notes<textarea name="notes" defaultValue={destination?.notes ?? ""} rows={3} maxLength={4000} /></label></details>
    <button className="primary" type="submit">{destination ? "Save destination" : "Add destination"}</button>
  </form>;
}

function destinationFor(destinations: Destination[], id: string) {
  return destinations.find((destination) => destination.id === id);
}

export function PlanningForm({ tripId, destinations, tripDates, initialType = "activity", initialDestinationId }: { tripId: string; destinations: Destination[]; tripDates: TripDates; initialType?: PlanItem["item_type"]; initialDestinationId?: string }) {
  const [type, setType] = useState<PlanItem["item_type"]>(initialType);
  const [destinationId, setDestinationId] = useState(initialDestinationId ?? destinations[0]?.id ?? "");
  const selected = destinationFor(destinations, destinationId);
  const nextDestination = destinations[destinations.findIndex((destination) => destination.id === destinationId) + 1];
  const contextualStart = contextualDate({ destinationStart: selected?.start_date, transitionDate: selected?.end_date, tripStart: tripDates.start });
  const [itemDate, setItemDate] = useState(contextualStart);
  const [endDate, setEndDate] = useState(selected?.end_date ?? contextualStart);
  const isStay = type === "stay";
  const isTransport = type === "transport";
  const isTimed = !isStay && type !== "free_time";
  return <form action={createPlanItem.bind(null, tripId)} className="sheet-form">
    <label>What are you adding?<select name="type" value={type} onChange={(event) => { const nextType = event.target.value as PlanItem["item_type"]; setType(nextType); const date = contextualDate({ destinationStart: selected?.start_date, transitionDate: selected?.end_date, tripStart: tripDates.start }); setItemDate(nextType === "transport" ? selected?.end_date ?? date : date); setEndDate(selected?.end_date ?? date); }}>{["stay", "transport", "activity", "event", "food_place", "free_time", "custom"].map((value) => <option key={value} value={value}>{itemLabel(value as PlanItem["item_type"])}</option>)}</select></label>
    <label>{isStay ? "Accommodation" : "Title"}<input name="title" required maxLength={160} placeholder={isStay ? "Where are you staying?" : "What do you know?"} /></label>
    <label>{isTransport ? "Origin" : "Destination"}<select name="destinationId" value={destinationId} onChange={(event) => { const nextId = event.target.value; const next = destinationFor(destinations, nextId); setDestinationId(nextId); const date = contextualDate({ destinationStart: next?.start_date, transitionDate: next?.end_date, tripStart: tripDates.start }); setItemDate(type === "transport" ? next?.end_date ?? date : date); setEndDate(next?.end_date ?? date); }} required><option value="">Choose destination</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label>
    {isTransport ? <label>Destination<select name="endDestinationId" defaultValue={nextDestination?.id ?? ""} required><option value="">Choose destination</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label> : <input type="hidden" name="endDestinationId" value="" />}
    <div className="field-row"><label>{isStay ? "Check-in" : "Date"}<input type="date" name="itemDate" value={itemDate} min={selected?.start_date ?? tripDates.start ?? undefined} max={selected?.end_date ?? tripDates.end ?? undefined} onChange={(event) => setItemDate(event.target.value)} /></label>{isStay ? <label>Check-out<input type="date" name="endDate" value={endDate} min={itemDate} max={selected?.end_date ?? tripDates.end ?? undefined} onChange={(event) => setEndDate(event.target.value)} /></label> : <input type="hidden" name="endDate" value="" />}</div>
    {isStay ? <Duration start={itemDate} end={endDate} /> : null}
    {isTimed ? <div className="field-row"><label>{isTransport ? "Departure time" : "Start time"}<input type="time" name="startTime" /></label><label>{isTransport ? "Arrival time" : "End time"}<input type="time" name="endTime" /></label></div> : <><input type="hidden" name="startTime" value="" /><input type="hidden" name="endTime" value="" /></>}
    {!isTransport ? <label>Place or address<input name="location" maxLength={240} /></label> : <input type="hidden" name="location" value="" />}
    {isTransport ? <label>Provider<input name="provider" maxLength={160} /></label> : <input type="hidden" name="provider" value="" />}
    <label>Planning status<select name="status" defaultValue="planned">{planItemStatuses.filter((status) => status !== "needs_checking").map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label>
    <label>Information confidence<select name="confidence" defaultValue={isTransport ? "needs_checking" : "unknown"}>{informationConfidences.map((confidence) => <option value={confidence} key={confidence}>{confidenceLabel(confidence)}</option>)}</select></label>
    <details className="more-fields"><summary>More details</summary><label>Notes<textarea name="notes" rows={3} maxLength={4000} /></label></details>
    <p className="context-hint">Dates are suggested from the selected destination and remain editable until saved.</p>
    <button className="primary" type="submit">Add to trip</button>
  </form>;
}

export function ItemEditorForm({ tripId, item, destinations, tripDates }: { tripId: string; item: PlanItem; destinations: Destination[]; tripDates: TripDates }) {
  const selected = destinationFor(destinations, item.destination_id ?? "");
  const isStay = item.item_type === "stay";
  const isTransport = item.item_type === "transport";
  const isTimed = !isStay && item.item_type !== "free_time";
  const [start, setStart] = useState(contextualDate({ selectedDate: item.item_date, destinationStart: selected?.start_date, tripStart: tripDates.start }));
  const [end, setEnd] = useState(item.end_date ?? selected?.end_date ?? start);
  return <form action={updatePlanItem.bind(null, tripId, item.id)} className="sheet-form"><input type="hidden" name="type" value={item.item_type} />
    <label>Title<input name="title" defaultValue={item.title} required /></label>
    <label>{isTransport ? "Origin" : "Destination"}<select name="destinationId" defaultValue={item.destination_id ?? ""}><option value="">Not chosen</option>{destinations.map((destination) => <option value={destination.id} key={destination.id}>{destination.name}</option>)}</select></label>
    {isTransport ? <label>Destination<select name="endDestinationId" defaultValue={item.end_destination_id ?? ""}><option value="">Not chosen</option>{destinations.map((destination) => <option value={destination.id} key={destination.id}>{destination.name}</option>)}</select></label> : <input type="hidden" name="endDestinationId" value="" />}
    <div className="field-row"><label>{isStay ? "Check-in" : "Date"}<input type="date" name="itemDate" value={start} min={selected?.start_date ?? tripDates.start ?? undefined} max={selected?.end_date ?? tripDates.end ?? undefined} onChange={(event) => setStart(event.target.value)} /></label>{isStay ? <label>Check-out<input type="date" name="endDate" value={end} min={start} max={selected?.end_date ?? tripDates.end ?? undefined} onChange={(event) => setEnd(event.target.value)} /></label> : <input type="hidden" name="endDate" value="" />}</div>
    {isStay ? <Duration start={start} end={end} /> : null}
    {isTimed ? <div className="field-row"><label>{isTransport ? "Departure time" : "Start time"}<input type="time" name="startTime" defaultValue={item.start_time?.slice(0, 5) ?? ""} /></label><label>{isTransport ? "Arrival time" : "End time"}<input type="time" name="endTime" defaultValue={item.end_time?.slice(0, 5) ?? ""} /></label></div> : <><input type="hidden" name="startTime" value="" /><input type="hidden" name="endTime" value="" /></>}
    {!isTransport ? <label>Place<input name="location" defaultValue={item.location ?? ""} /></label> : <input type="hidden" name="location" value="" />}
    {isTransport ? <label>Provider<input name="provider" defaultValue={item.provider ?? ""} /></label> : <input type="hidden" name="provider" value="" />}
    <label>Planning status<select name="status" defaultValue={item.status === "needs_checking" ? "planned" : item.status}>{planItemStatuses.filter((status) => status !== "needs_checking").map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label>
    <label>Information confidence<select name="confidence" defaultValue={item.confidence ?? (item.status === "needs_checking" ? "needs_checking" : "unknown")}>{informationConfidences.map((confidence) => <option value={confidence} key={confidence}>{confidenceLabel(confidence)}</option>)}</select></label>
    <details className="more-fields"><summary>More details</summary><label>Notes<textarea name="notes" defaultValue={item.notes ?? ""} rows={3} /></label></details>
    <button className="primary">Save changes</button>
  </form>;
}

export function IdeaForm({ tripId, destinations }: { tripId: string; destinations: Destination[] }) {
  return <form action={createIdea.bind(null, tripId)} className="sheet-form"><label>Idea<input name="title" required /></label><details className="more-fields"><summary>Add details</summary><label>Destination<select name="destinationId" defaultValue=""><option value="">Anywhere</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label><label>Category<input name="category" placeholder="Optional" /></label><label>Link<input type="url" name="link" /></label><label>Notes<textarea name="notes" rows={3} /></label></details><button className="primary">Save idea</button></form>;
}

export function IdeaScheduleForm({ tripId, idea, destinations, tripDates }: { tripId: string; idea: Idea; destinations: Destination[]; tripDates: TripDates }) {
  const initialDestination = idea.destination_id ?? destinations[0]?.id ?? "";
  const [destinationId, setDestinationId] = useState(initialDestination);
  const destination = destinationFor(destinations, destinationId);
  const days = useMemo(() => destination ? dateRange(destination.start_date, destination.end_date) : [], [destination]);
  const [custom, setCustom] = useState(false);
  const suggested = contextualDate({ destinationStart: destination?.start_date, tripStart: tripDates.start });
  return <form action={scheduleIdea.bind(null, tripId, idea.id)} className="mini-form"><label>Where<select name="destinationId" value={destinationId} onChange={(event) => { setDestinationId(event.target.value); setCustom(false); }} required>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>When{custom ? <input type="date" name="itemDate" defaultValue={suggested} min={destination?.start_date ?? tripDates.start ?? undefined} max={destination?.end_date ?? tripDates.end ?? undefined} required /> : <select name="itemDate" defaultValue={suggested} required>{days.map((day) => <option key={day} value={day}>{formatDay(day)}</option>)}</select>}</label><button className="text-button" type="button" onClick={() => setCustom((value) => !value)}>{custom ? "Choose a relevant day" : "Choose another date…"}</button><button className="primary">Add to itinerary</button></form>;
}

export function AutoDismissNotice({ message }: { message: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => router.replace(window.location.pathname, { scroll: false }), 3600);
    return () => window.clearTimeout(timer);
  }, [router]);
  return <p className="toast-notice" role="status">{message}</p>;
}
