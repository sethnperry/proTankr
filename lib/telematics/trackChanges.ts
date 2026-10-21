// lib/telematics/trackChanges.ts
//
// What "Update from Geotab" would change for a truck, in plain words, so the
// dispatcher can acknowledge it before anything is written. Pure.

export type TrackChange = { kind: "location" | "hookup" | "driver"; text: string; /** a pair would be separated if this is applied */ separates?: boolean };

export type TrackInput = {
  truckName: string;
  place: string | null;            // "Tampa, FL" from the truck's position
  storedPlace: string | null;      // what ProTankr last had for the truck
  hasPosition: boolean;
  hookKnown: boolean;              // the provider tracks trailer hookups for this company
  observedTrailerId: string | null;
  observedTrailerName: string | null;
  ourTrailerId: string | null;     // the trailer ProTankr has paired with this truck right now
  ourTrailerName: string | null;
  driverName: string | null;       // signed in to the truck
  claimedByName: string | null;    // has the truck selected in ProTankr
};

export function buildChanges(i: TrackInput): TrackChange[] {
  const out: TrackChange[] = [];
  if (i.hasPosition) {
    out.push({
      kind: "location",
      text: i.place
        ? `Truck ${i.truckName} is in ${i.place}${i.storedPlace && i.storedPlace !== i.place ? ` (was ${i.storedPlace})` : ""}.`
        : `Truck ${i.truckName} position will be saved.`,
    });
  }
  if (i.hookKnown && i.observedTrailerId !== i.ourTrailerId && (i.observedTrailerId || i.ourTrailerId)) {
    if (i.observedTrailerId && i.ourTrailerId) {
      out.push({ kind: "hookup", separates: true, text: `Geotab shows truck ${i.truckName} pulling trailer ${i.observedTrailerName ?? "another trailer"}, but ProTankr has it with trailer ${i.ourTrailerName ?? "?"}.` });
    } else if (i.observedTrailerId) {
      out.push({ kind: "hookup", text: `Geotab shows truck ${i.truckName} pulling trailer ${i.observedTrailerName ?? "a trailer"}. ProTankr has no trailer with it.` });
    } else {
      out.push({ kind: "hookup", separates: true, text: `Geotab shows no trailer hooked to truck ${i.truckName}, but ProTankr has it with trailer ${i.ourTrailerName ?? "?"}.` });
    }
  }
  if (i.driverName && i.claimedByName && i.driverName !== i.claimedByName) {
    out.push({ kind: "driver", text: `${i.driverName} is signed in to the truck. ProTankr has it selected by ${i.claimedByName}.` });
  } else if (i.driverName && !i.claimedByName) {
    out.push({ kind: "driver", text: `${i.driverName} is signed in to the truck. Nobody has it selected in ProTankr.` });
  }
  return out;
}
