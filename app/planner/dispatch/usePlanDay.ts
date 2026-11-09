"use client";
// app/planner/dispatch/usePlanDay.ts
//
// Plan page state for one driver: the ordered trips copied over from the TMS,
// the start time, the validation report (re-run on every change) and "dispatch
// the day". The page supplies the lookups; the checks live in
// lib/dispatch/validateDay.ts.
import { useMemo, useState } from "react";
import { validateDay, type DayContext, type DayReport, type DayTrip, type Others } from "@/lib/dispatch/validateDay";
import { buildDispatchedTrip } from "@/lib/dispatch/dispatchTrip";
import { writeDispatched } from "@/lib/dispatch/useDispatchData";

export type PlanDayDeps = {
  companyId: string | null;
  dispatcherId: string | null;
  driverId: string | null;
  /** Everything validateDay needs except the start time. */
  context: Omit<DayContext, "startMs" | "driveSoFarMin" | "dutyStartMs"> | null;
  defaultStartMs: number;
  /** Loads already dispatched to this driver and not begun: the day continues after them. */
  prior: { startMs: number; endMs: number; driveMin: number; locationLL: { lat: number; lon: number } | null }[];
  truckId: string | null;
  trailerId: string | null;
  terminalName: (id: string) => string;
  terminalPlace: (id: string) => { city: string | null; state: string | null };
  onDispatched: () => void;
  /** An existing trip being checked on its own: the report is about it, not the day being built. */
  inspect?: { trip: DayTrip; startMs: number; dutyStartMs: number; driveSoFarMin: number } | null;
};

export function usePlanDay(d: PlanDayDeps) {
  const [byDriver, setByDriver] = useState<Record<string, DayTrip[]>>({});
  const [startByDriver, setStartByDriver] = useState<Record<string, number | null>>({});
  const [ignoredBy, setIgnoredBy] = useState<Record<string, string[]>>({});
  const [handledBy, setHandledBy] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = d.driverId ?? "";
  const trips = byDriver[id] ?? [];
  const last = d.prior[d.prior.length - 1];
  const startMs = startByDriver[id] ?? last?.endMs ?? d.defaultStartMs;

  const report = useMemo<DayReport | null>(() => {
    if (d.inspect && d.context) {
      const r = validateDay([d.inspect.trip], { ...d.context, startMs: d.inspect.startMs, dutyStartMs: d.inspect.dutyStartMs, driveSoFarMin: d.inspect.driveSoFarMin });
      // Only this trip's own report: the terminal swap edits a trip being built, which this is not.
      return { ...r, issues: r.issues.map((i) => ({ ...i, fixes: i.fixes.filter((x) => x !== "terminal") })) };
    }
    if (!d.context || trips.length === 0) return null;
    return validateDay(trips, {
      ...d.context, startMs, startFrom: last?.locationLL ?? d.context.startFrom,
      dutyStartMs: d.prior[0]?.startMs ?? startMs, driveSoFarMin: d.prior.reduce((a, l) => a + l.driveMin, 0),
    });
  }, [d.context, trips, startMs, d.prior, d.inspect]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (fn: (t: DayTrip[]) => DayTrip[]) => { setByDriver((m) => ({ ...m, [id]: fn(m[id] ?? []) })); setMsg(null); };
  const move = (i: number, dir: -1 | 1) => set((t) => {
    const j = i + dir;
    if (j < 0 || j >= t.length) return t;
    const n = [...t]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const dispatchAll = async () => {
    if (!d.companyId || !d.dispatcherId || !d.driverId || !report) return;
    setBusy(true); setMsg(null);
    try {
      let seq = d.prior.length;
      for (const r of report.trips) {
        seq++;
        const place = d.terminalPlace(r.trip.terminalId);
        const rows = buildDispatchedTrip({
          companyId: d.companyId, dispatcherId: d.dispatcherId, driverId: d.driverId, seq,
          leg: {
            terminalId: r.trip.terminalId, terminalName: d.terminalName(r.trip.terminalId), city: place.city, state: place.state,
            locationId: r.trip.locationId, deliveryType: "drop", supplierId: r.trip.supplierId, orderNumber: r.trip.orderNumber,
            startMs: r.startMs, endMs: r.forecast.endMs, driveMin: r.forecast.driveMinutes, truckId: d.truckId, trailerId: d.trailerId,
            warnings: report.issues.filter((x) => x.tripId === r.trip.id || x.tripId === null).map((x) => x.text),
            shipper: r.trip.shipper, customer: r.trip.customer,
          },
        }, { now: new Date(), newId: () => crypto.randomUUID() });
        const err = await writeDispatched(rows as any);
        if (err) { setMsg({ ok: false, text: seq - d.prior.length > 1 ? `Sent ${seq - d.prior.length - 1} of ${report.trips.length}. Then: ${err}` : err }); d.onDispatched(); return; }
      }
      setMsg({ ok: true, text: `Dispatched ${report.trips.length} load${report.trips.length === 1 ? "" : "s"}.` });
      setByDriver((m) => ({ ...m, [id]: [] })); setStartByDriver((m) => ({ ...m, [id]: null })); setIgnoredBy((m) => ({ ...m, [id]: [] }));
      d.onDispatched();
    } finally { setBusy(false); }
  };

  return {
    trips, startMs, report, busy, msg,
    ignored: new Set(ignoredBy[id] ?? []),
    handled: handledBy[id] ?? {},
    markHandled: (issueId: string, note: string) => setHandledBy((m) => ({ ...m, [id]: { ...(m[id] ?? {}), [issueId]: note } })),
    ignore: (issueId: string) => setIgnoredBy((m) => ({ ...m, [id]: [...(m[id] ?? []), issueId] })),
    add: (t: DayTrip) => set((x) => [...x, t]),
    remove: (i: number) => set((x) => x.filter((_, j) => j !== i)),
    update: (i: number, patch: Partial<DayTrip>) => set((x) => x.map((t, j) => (j === i ? { ...t, ...patch } : t))),
    move,
    setStart: (ms: number | null) => setStartByDriver((m) => ({ ...m, [id]: ms })),
    dispatchAll,
  };
}
export type { Others };
