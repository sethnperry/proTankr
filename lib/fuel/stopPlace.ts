"use client";
// lib/fuel/stopPlace.ts
//
// City and state for a fuel stop when the driver hasn't given one: the phone's
// position, else the truck's tracker if linked. Each is given a few
// seconds so saving a stop never waits long. IFTA needs the state of every
// purchase.

import { currentCity } from "@/lib/trips/startPlace";
import { fetchTruckReading } from "@/lib/telematics/useTruckReading";

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export async function resolveStopPlace(truckId: string | null): Promise<{ city: string; state: string } | null> {
  const ph = await within(currentCity(), 3500);
  if (ph?.state) return { city: ph.city, state: ph.state };
  const tel = truckId ? await within(fetchTruckReading(truckId), 3500) : null; // the tracker, when the phone can't say
  return tel?.state ? { city: tel.city ?? "", state: tel.state } : null;
}
