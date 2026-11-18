// lib/recap/segments.ts
//
// Cuts one shift into segments: rack, loaded leg, drop, empty leg, fuel, and the gray zone (time nothing explains).
// A leg must end at a recognized event; travel that ends nowhere is just gray zone and earns no credit.

import type { Shift } from "../shifts/shiftLogic.ts";
import type { LatLon, RecapSettings, RecapSpan, RecapTrip, Segment, SegType } from "./types.ts";
import { localParts } from "./time.ts";

const MIN = 60_000;
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export type PlaceNames = { terminal: (id: string | null) => string; location: (id: string | null) => string };

type Raw = Omit<Segment, "hour" | "dow" | "minutes" | "shiftStart" | "liveDelayMin" | "delayLabels" | "afterNote" | "evidence"> &
  Partial<Pick<Segment, "afterNote" | "evidence">>;

export function cutShift(shift: Shift, trips: RecapTrip[], spans: RecapSpan[], names: PlaceNames, settings: RecapSettings, tz: string): Segment[] {
  const sStart = ms(shift.startedAt), sEnd = ms(shift.endedAt);
  if (!Number.isFinite(sStart) || !Number.isFinite(sEnd) || sEnd <= sStart) return [];
  const raws: Raw[] = [];
  const delaysFor = new Map<Raw, { live: number; labels: string[] }>();
  const addDelay = (r: Raw, minutes: number, label: string) => {
    const d = delaysFor.get(r) ?? { live: 0, labels: [] };
    d.live += minutes; d.labels.push(label); delaysFor.set(r, d);
  };

  const mine = trips.filter((t) => t.userId === shift.userId).filter((t) => {
    const a = ms(t.startedAt) , b = ms(t.completedAt);
    return Number.isFinite(a) && a < sEnd && (!Number.isFinite(b) || b > sStart);
  }).sort((a, b) => ms(a.startedAt) - ms(b.startedAt));

  const push = (type: SegType, a: number, b: number, key: string | null, fromKey: string | null, toKey: string | null, label: string, tripId: string | undefined, extra: Partial<Raw> = {}): Raw | null => {
    const from = Math.max(a, sStart), to = Math.min(b, sEnd);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
    const r: Raw = { userId: shift.userId, type, startMs: from, endMs: to, key, fromKey, toKey, label, tripId, ...extra };
    raws.push(r);
    return r;
  };

  for (const t of mine) {
    let cursor = ms(t.startedAt);
    let prevKey: string | null = null; // where the truck is coming from
    let loaded = false;
    const stops: { kind: "rack" | "drop"; at: number; left: number; key: string; name: string; id: string; evidence: boolean; afterNote: boolean }[] = [];
    for (const p of t.pickups) {
      const a = ms(p.arrivedAt), l = ms(p.leftAt);
      if (!Number.isFinite(a)) continue;
      stops.push({ kind: "rack", at: a, left: Number.isFinite(l) ? l : a, key: `t:${p.terminalId ?? p.pickupId}`, name: names.terminal(p.terminalId) || p.name || "Terminal", id: p.pickupId,
        evidence: Number.isFinite(l) && (p.outcome === "no_load" || !!p.beginAt), afterNote: p.hasDelayNote });
    }
    for (const d of t.deliveries) {
      const a = ms(d.arrivedAt), l = ms(d.leftAt);
      if (!Number.isFinite(a)) continue;
      stops.push({ kind: "drop", at: a, left: Number.isFinite(l) ? l : a, key: `l:${d.locationId ?? d.deliveryId}`, name: names.location(d.locationId) || d.name || "Delivery", id: d.deliveryId,
        evidence: Number.isFinite(l) && d.signed, afterNote: d.hasDelayNote });
    }
    stops.sort((x, y) => x.at - y.at);
    for (const s of stops) {
      // The leg that got here: loaded once product is aboard, empty before that and after a no-load rack.
      const legType: SegType = loaded ? "loaded_leg" : "empty_leg";
      const lane = prevKey ? `${prevKey}>${s.key}` : `start>${s.key}`;
      const leg = push(legType, cursor, s.at, lane, prevKey, s.key, `${prevKey ? "" : "Start > "}${s.name}`, t.tripId, { evidence: true });
      if (leg) {
        for (const d of t.delays) if ((d.leg === "to_rack" || d.leg === "to_drop") && (d.pickupId === s.id || d.deliveryId === s.id)) addDelay(leg, d.minutes, d.label);
      }
      const seg = push(s.kind === "rack" ? "rack" : "drop", s.at, s.left, s.key, s.key, s.key, s.name, t.tripId, { evidence: s.evidence, afterNote: s.afterNote });
      if (seg) {
        for (const d of t.delays) if ((d.leg === "at_rack" || d.leg === "at_drop") && (d.pickupId === s.id || d.deliveryId === s.id)) addDelay(seg, d.minutes, d.label);
      }
      if (s.kind === "rack") {
        const p = t.pickups.find((x) => x.pickupId === s.id);
        if (p && p.outcome !== "no_load") loaded = true;
      }
      prevKey = s.key; cursor = s.left;
    }
  }

  for (const sp of spans.filter((x) => x.userId === shift.userId)) {
    const a = ms(sp.from), b = ms(sp.to);
    if (sp.kind === "fuel") push("fuel", a, b, "fuel", null, null, "Fuel stop", undefined, { evidence: true });
    else push("empty_leg", a, b, "empty_move", null, null, sp.place ? `Empty move to ${sp.place}` : "Empty move", undefined, { evidence: true });
  }

  // Overlaps count once. Stops, fuel stops and empty moves take their own time; a leg yields around them (a fuel stop
  // in the middle of a leg splits it in two).
  const solidTypes = new Set<SegType>(["rack", "drop", "fuel"]);
  const isSolid = (r: Raw) => solidTypes.has(r.type) || r.key === "empty_move";
  const solids = raws.filter(isSolid).sort((x, y) => x.startMs - y.startMs || x.endMs - y.endMs);
  const placed: { r: Raw; from: number; to: number }[] = [];
  let edge = -Infinity;
  for (const r of solids) {
    const from = Math.max(r.startMs, edge);
    if (r.endMs > from) { placed.push({ r, from, to: r.endMs }); edge = r.endMs; }
  }
  for (const r of raws.filter((x) => !isSolid(x))) {
    let from = r.startMs;
    for (const p of placed.filter((q) => q.to > r.startMs && q.from < r.endMs).sort((x, y) => x.from - y.from)) {
      if (p.from > from) placed.push({ r, from, to: Math.min(p.from, r.endMs) });
      from = Math.max(from, p.to);
    }
    if (from < r.endMs) placed.push({ r, from, to: r.endMs });
  }
  placed.sort((x, y) => x.from - y.from || x.to - y.to);
  const out: Segment[] = [];
  let frontier = sStart;
  const finish = (r: Raw, from: number, to: number, grayKind?: Segment["grayKind"]): Segment => {
    const d = delaysFor.get(r);
    const lp = localParts(from, tz);
    return {
      userId: r.userId, shiftStart: shift.startedAt, type: r.type, startMs: from, endMs: to, minutes: Math.max(0, (to - from) / MIN),
      key: r.key, fromKey: r.fromKey, toKey: r.toKey, label: r.label, hour: lp.hour, dow: lp.dow, grayKind, tripId: r.tripId,
      liveDelayMin: d ? Math.min(d.live, (to - from) / MIN) : 0, delayLabels: d?.labels ?? [], afterNote: !!r.afterNote, evidence: r.evidence !== false,
    };
  };
  const gray = (from: number, to: number, kind: Segment["grayKind"]) => {
    if (to - from < MIN) return;
    out.push(finish({ userId: shift.userId, type: "gray", startMs: from, endMs: to, key: null, fromKey: null, toKey: null, label: kind === "start" ? "Start of shift" : kind === "end" ? "End of shift" : "Between trips", evidence: true }, from, to, kind));
  };
  let first = true;
  for (const q of placed) {
    const from = Math.max(q.from, frontier), to = q.to;
    if (to <= from) continue;
    if (from > frontier) gray(frontier, from, first ? "start" : "between");
    out.push(finish(q.r, from, to));
    frontier = to; first = false;
  }
  if (first) gray(sStart, sEnd, "start");
  else if (sEnd > frontier) gray(frontier, sEnd, "end");
  return out;
}

export function airMilesBetween(a: LatLon, b: LatLon): number { // used by the fallback standard
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
