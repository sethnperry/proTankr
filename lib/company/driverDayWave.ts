// lib/company/driverDayWave.ts
//
// A driver's whole shift on one line, like a sine wave. The line starts at the center when the shift begins. Each
// trip's loading terminal is a peak (first trip), then a trough (second), and so on; every delivery is back on the
// center line. Time spent at a stop, or stopped on the way, is a flat clip; driving is the curve between stops.
// Pure: no React, no Supabase, no clock (the caller passes `nowMs`).

import type { TripCompartmentLoadRow, TripDeliveryRow, TripPickupRow, TripRow } from "../trips/types.ts";

export type DayTrip = {
  trip: TripRow; pickups: TripPickupRow[]; deliveries: TripDeliveryRow[]; compLoads: TripCompartmentLoadRow[];
  /** Delays logged on the way (not at a stop). */
  delays: { leg: string; startedAt: string; endedAt: string | null }[];
};
export type DayLabels = {
  startLabel: string | null;
  terminal: (p: TripPickupRow) => { code: string; city: string | null };
  delivery: (d: TripDeliveryRow, trip: TripRow) => { label: string; city: string | null };
};

export type NodeState = "done" | "current" | "next" | "skipped";
export type WaveNode = { key: string; kind: "start" | "pickup" | "delivery"; label: string; timeMs: number | null; level: -1 | 0 | 1; x: number; state: NodeState };
export type WaveSeg = { kind: "drive" | "hold"; x0: number; x1: number; y0: number; y1: number; projected: boolean };
export type Wave = { nodes: WaveNode[]; segs: WaveSeg[]; truck: { x: number; y: number; moving: boolean } | null; tStart: number; tEnd: number };

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);
const MIN = 60_000;

type Entry = { node: Omit<WaveNode, "x" | "timeMs">; arrive: number | null; leave: number | null };
type Piece = { kind: "drive" | "hold"; t0: number; t1: number; y0: number; y1: number; projected: boolean; node?: number };

export function buildWave(o: { shiftStartMs: number; nowMs: number; trips: DayTrip[]; labels: DayLabels }): Wave {
  const { shiftStartMs, nowMs, labels } = o;
  const trips = [...o.trips].filter((t) => t.trip.status !== "cancelled" && t.trip.status !== "dispatched" && ms(t.trip.started_at) >= shiftStartMs - 6 * 3600_000)
    .sort((a, b) => ms(a.trip.started_at) - ms(b.trip.started_at));
  const entries: Entry[] = [];
  trips.forEach((t, k) => {
    const peak: -1 | 1 = k % 2 === 0 ? 1 : -1;
    const pk = [...t.pickups].sort((a, b) => a.seq - b.seq);
    for (const p of pk) {
      const { code, city } = labels.terminal(p);
      const skipped = p.outcome === "no_load";
      entries.push({
        node: { key: p.pickup_id, kind: "pickup", label: city ? `${code} - ${city}` : code, level: peak, state: skipped ? "skipped" : p.left_at ? "done" : p.arrived_at ? "current" : "next" },
        arrive: ms(p.arrived_at), leave: ms(p.left_at),
      });
    }
    for (const d of [...t.deliveries].filter((x) => x.status !== "cancelled").sort((a, b) => a.seq - b.seq)) {
      const l = labels.delivery(d, t.trip);
      entries.push({
        node: { key: d.delivery_id, kind: "delivery", label: l.label, level: 0, state: d.left_at || d.status === "complete" ? "done" : d.arrived_at ? "current" : "next" },
        arrive: ms(d.arrived_at), leave: ms(d.left_at),
      });
    }
  });

  const first = trips[0]?.trip;
  const startLeave = first ? ms(first.started_at) : nowMs;
  const pieces: Piece[] = [];
  const nodes: (Omit<WaveNode, "x"> & { piece: number })[] = [{ key: "start", kind: "start", label: labels.startLabel ?? "Start", timeMs: shiftStartMs, level: 0, state: "done", piece: 0 }];
  let t = shiftStartMs, y = 0;
  const hold = (t0: number, t1: number, yy: number, projected = false, node?: number) => { pieces.push({ kind: "hold", t0, t1: Math.max(t1, t0), y0: yy, y1: yy, projected, node }); };
  const drive = (t0: number, t1: number, y0: number, y1: number, projected = false) => {
    // Delays on the way are flat clips cut out of the drive.
    const cuts = trips.flatMap((x) => x.delays).map((d) => ({ a: ms(d.startedAt), b: d.endedAt ? ms(d.endedAt) : nowMs })).filter((d) => d.a >= t0 && d.b <= t1 && d.b > d.a).sort((p, q) => p.a - q.a);
    const moving = (t1 - t0) - cuts.reduce((s, c) => s + (c.b - c.a), 0);
    let cursor = t0, done = 0;
    const at = (m: number) => y0 + (y1 - y0) * (moving > 0 ? Math.min(1, m / moving) : 1);
    for (const c of cuts) {
      if (c.a > cursor) { const d = c.a - cursor; pieces.push({ kind: "drive", t0: cursor, t1: c.a, y0: at(done), y1: at(done + d), projected, }); done += d; }
      hold(c.a, c.b, at(done), projected);
      cursor = c.b;
    }
    if (t1 > cursor) pieces.push({ kind: "drive", t0: cursor, t1, y0: at(done), y1, projected });
  };

  // On duty before the truck started moving.
  if (startLeave - t > 3 * MIN) hold(t, startLeave, 0);
  t = Math.max(t, startLeave);
  let projectedFrom: number | null = null;
  let truckPiece: { idx: number; at: "node" | "drive" } | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (projectedFrom == null && Number.isFinite(e.arrive!)) {
      if (e.arrive! > t) drive(t, e.arrive!, y, e.node.level);
      const endAt = Number.isFinite(e.leave!) ? e.leave! : nowMs;
      nodes.push({ ...e.node, timeMs: e.arrive, piece: pieces.length });
      hold(e.arrive!, endAt, e.node.level, false, nodes.length - 1);
      t = endAt; y = e.node.level;
      if (!Number.isFinite(e.leave!)) truckPiece = { idx: pieces.length - 1, at: "node" };
    } else {
      // Not reached yet: the drive toward it is drawn up to now, then projected.
      if (projectedFrom == null) {
        projectedFrom = t;
        // Arrival isn't known: assume the drive takes half again as long as it has so far (at least 30 minutes).
        const elapsed = Math.max(0, nowMs - t);
        const driveEnd = t + Math.max(30 * MIN, elapsed * 1.5);
        const frac = elapsed / (driveEnd - t);
        const yNow = y + (e.node.level - y) * frac;
        if (elapsed > 0) { drive(t, nowMs, y, yNow); truckPiece = { idx: pieces.length - 1, at: "drive" }; }
        drive(Math.max(t, nowMs), driveEnd, yNow, e.node.level, true);
        nodes.push({ ...e.node, timeMs: null, piece: pieces.length });
        t = driveEnd; y = e.node.level;
      } else {
        drive(t, t + 20 * MIN, y, e.node.level, true);
        nodes.push({ ...e.node, timeMs: null, piece: pieces.length });
        t += 20 * MIN; y = e.node.level;
      }
    }
  }
  if (entries.length === 0 && nowMs > t) hold(t, nowMs, 0), truckPiece = { idx: pieces.length - 1, at: "node" };
  // Time since the last stop with nothing planned: on duty, standing at the center.
  if (entries.length > 0 && projectedFrom == null && nowMs > t && y === 0) { hold(t, nowMs, 0); truckPiece = { idx: pieces.length - 1, at: "node" }; }

  // Time to width: every piece gets at least a floor so short stops stay visible.
  const spanMs = Math.max(MIN, pieces.reduce((s, p) => s + (p.t1 - p.t0), 0));
  const w = pieces.map((p) => Math.max(p.t1 - p.t0, spanMs * (p.kind === "drive" ? 0.05 : 0.025)));
  const total = w.reduce((s, v) => s + v, 0) || 1;
  const xs: number[] = [0];
  for (const v of w) xs.push(xs[xs.length - 1] + v / total);
  const segs: WaveSeg[] = pieces.map((p, i) => ({ kind: p.kind, x0: xs[i], x1: xs[i + 1], y0: p.y0, y1: p.y1, projected: p.projected }));
  const outNodes: WaveNode[] = nodes.map((n) => ({ key: n.key, kind: n.kind, label: n.label, timeMs: n.timeMs, level: n.level, state: n.state, x: n.piece >= xs.length - 1 ? 1 : xs[n.piece] }));
  let truck: Wave["truck"] = null;
  if (truckPiece) {
    const s = segs[truckPiece.idx];
    truck = { x: s.x1, y: s.y1, moving: truckPiece.at === "drive" };
  }
  return { nodes: outNodes, segs, truck, tStart: shiftStartMs, tEnd: Math.max(nowMs, t) };
}

/** "3:00p" */
export function clock(msv: number | null): string {
  if (msv == null || !Number.isFinite(msv)) return "";
  const d = new Date(msv);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() < 12 ? "a" : "p"}`;
}

export type DayRow = { n: number; tripId: string; from: string; to: string; codes: (string | null)[]; customer: string; startMs: number; endMs: number | null; hours: number; gallons: number };

/** One row per trip for the brief report under the wave. */
export function dayRows(o: { trips: DayTrip[]; nowMs: number; labels: DayLabels; productCode: (id: string | null | undefined) => string | null; startLabel: string | null }): DayRow[] {
  const sorted = [...o.trips].filter((t) => t.trip.status !== "cancelled" && t.trip.status !== "dispatched").sort((a, b) => ms(a.trip.started_at) - ms(b.trip.started_at));
  let origin = o.startLabel ?? "Start";
  return sorted.map((t, i) => {
    const loaded = t.pickups.filter((p) => p.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
    const terms = loaded.map((p) => { const l = o.labels.terminal(p); return l.city ? `${l.city} - ${l.code}` : l.code; });
    const drops = t.deliveries.filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq);
    const dl = drops.map((d) => o.labels.delivery(d, t.trip));
    const comps = t.compLoads.filter((c) => c.disposition !== "cancelled");
    const nums = [...new Set([...comps.map((c) => c.comp_number)])].sort((a, b) => b - a);
    const codes = nums.map((n) => o.productCode(comps.find((c) => c.comp_number === n)?.product_id));
    const end = Math.max(...drops.map((d) => ms(d.left_at)).filter(Number.isFinite), ms(t.trip.completed_at) || 0) || null;
    const startMs = ms(t.trip.started_at);
    const endMs = t.trip.status === "complete" && end ? end : null;
    const stop = endMs ?? o.nowMs;
    const row: DayRow = {
      n: i + 1, tripId: t.trip.trip_id, from: origin, to: terms.join(" + ") || "No rack yet", codes,
      customer: dl.map((d) => d.label).join(" + ") || "No delivery set", startMs, endMs,
      hours: Math.max(0, Math.round(((stop - startMs) / 3600_000) * 100) / 100),
      gallons: Math.round(comps.reduce((s, c) => s + (Number(c.gross_gallons) || 0), 0)),
    };
    origin = dl[dl.length - 1]?.city ?? origin;
    return row;
  });
}

/** What the driver is doing now, from their newest unfinished trip. */
export function driverStatus(trips: DayTrip[]): { text: string; trip: DayTrip | null } {
  const open = [...trips].filter((t) => !["complete", "cancelled", "dispatched"].includes(t.trip.status)).sort((a, b) => ms(b.trip.started_at) - ms(a.trip.started_at))[0] ?? null;
  if (!open) return { text: "Between loads", trip: null };
  if (open.trip.status === "parked") return { text: "Parked preloaded", trip: open };
  if (open.pickups.some((p) => p.arrived_at && !p.left_at && !p.outcome)) return { text: "Loading", trip: open };
  if (open.deliveries.some((d) => d.arrived_at && !d.left_at && d.status !== "complete")) return { text: "Delivering", trip: open };
  if (open.compLoads.some((c) => c.disposition === "loaded")) return { text: "Loaded, en route", trip: open };
  return { text: "En route to rack", trip: open };
}
