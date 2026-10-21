"use client";
// lib/dispatch/useGeofenceWatch.ts
//
// Dispatch-side geofence alerts. For every load in progress whose next stop the
// driver hasn't arrived at in the app, watch the truck's live position against
// that stop's geofence (centers learned from Arrive taps, lib/telematics/geofence).
// When the truck has come to rest inside, the board marks the card, and if the
// driver still hasn't tapped Arrive after a few minutes a browser notification
// goes out once ("Seth's truck is at Citgo; not arrived in the app").

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { buildTripRoute, type Place } from "@/lib/trips/fleetProgress";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";
import type { LatLon } from "@/lib/trips/deliveryLocations";
import { fenceFor, inside, NEW_WATCH, stepWatch, type Watch } from "@/lib/telematics/geofence";
import type { LivePos } from "@/lib/telematics/progress";

export const OVERDUE_MS = 5 * 60_000;
const FRESH_MS = 10 * 60_000;

export type GeoState = { tripId: string; stopName: string; sinceMs: number; overdue: boolean };

function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s].slice(-300))); } catch { /* storage blocked */ }
}

export function useGeofenceWatch(o: {
  userId: string | null;
  companyId: string | null;
  trips: FleetTrip[];
  locations: Map<string, Place>;
  positions: Map<string, LivePos>;
  terminalLL: (id: string) => LatLon | null;
  locationLL: (id: string) => LatLon | null;
}): Map<string, GeoState> {
  const { companyId, positions } = o;
  const [points, setPoints] = useState<Map<string, LatLon[]>>(new Map());
  const [state, setState] = useState<Map<string, GeoState>>(new Map());
  const watches = useRef<Map<string, Watch>>(new Map());
  const latest = useRef(o);
  latest.current = o;
  const notifiedKey = `proTankr:u:${o.userId}:geoNotified`;

  // Learned stop centers for the whole company, refreshed now and then.
  useEffect(() => {
    if (!companyId) return;
    let off = false;
    const load = async () => {
      const { data } = await supabase.from("stop_arrival_points").select("kind, ref_id, lat, lon").eq("company_id", companyId).order("created_at", { ascending: false }).limit(3000);
      if (off) return;
      const m = new Map<string, LatLon[]>();
      for (const r of (data ?? []) as { kind: string; ref_id: string; lat: number; lon: number }[]) {
        const k = `${r.kind}:${r.ref_id}`;
        const a = m.get(k) ?? [];
        if (a.length < 12) a.push({ lat: Number(r.lat), lon: Number(r.lon) });
        m.set(k, a);
      }
      setPoints(m);
    };
    void load();
    const t = window.setInterval(() => void load(), 30 * 60_000);
    return () => { off = true; window.clearInterval(t); };
  }, [companyId]);

  const signature = useMemo(() => [...positions.entries()].map(([k, v]) => `${k}:${v.at}`).join("|"), [positions]);

  useEffect(() => {
    const { trips, locations, terminalLL, locationLL } = latest.current;
    const now = Date.now();
    const next = new Map<string, GeoState>();
    const live = new Set<string>();
    for (const ft of trips) {
      if (ft.trip.status === "parked" || !ft.trip.truck_id) continue;
      const pos = positions.get(ft.trip.truck_id);
      const route = buildTripRoute(ft.trip, ft.pickups, ft.deliveries, locations, ft.start);
      const node = route.nodes[route.position.at];
      if (!node || !route.position.enRoute) continue; // the driver already arrived (or nothing ahead)
      const pk = ft.pickups.find((p) => p.pickup_id === node.key);
      const dl = ft.deliveries.find((d) => d.delivery_id === node.key);
      const target = pk?.terminal_id ? { kind: "terminal", ref: String(pk.terminal_id), ll: terminalLL(String(pk.terminal_id)) }
        : dl?.location_id ? { kind: "location", ref: dl.location_id, ll: locationLL(dl.location_id) } : null;
      if (!target) continue;
      const wk = `${ft.trip.trip_id}:${node.key}`;
      live.add(wk);
      if (!pos || !pos.at || now - Date.parse(pos.at) > FRESH_MS) continue;
      const fence = fenceFor(points.get(`${target.kind}:${target.ref}`) ?? [], target.ll);
      if (!fence) continue;
      const w = stepWatch(watches.current.get(wk) ?? NEW_WATCH, { inside: inside({ lat: pos.lat, lon: pos.lon }, fence), speedMph: pos.speedMph, nowMs: now });
      watches.current.set(wk, w);
      if (w.confirmedAtMs == null) continue;
      const overdue = now - w.confirmedAtMs >= OVERDUE_MS;
      next.set(ft.trip.trip_id, { tripId: ft.trip.trip_id, stopName: node.sub ?? node.label, sinceMs: w.confirmedAtMs, overdue });
      if (overdue) {
        const done = readSet(notifiedKey);
        if (!done.has(wk)) {
          done.add(wk); writeSet(notifiedKey, done);
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(`${ft.driverName ?? "A truck"} is at ${node.sub ?? node.label}`, { body: "The truck has stopped there but the driver hasn't tapped Arrive in the app.", tag: `protankr-geofence-${wk}` });
            }
          } catch { /* some browsers only allow notifications from a service worker */ }
        }
      }
    }
    for (const k of [...watches.current.keys()]) if (!live.has(k)) watches.current.delete(k);
    setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, points]);

  return state;
}
