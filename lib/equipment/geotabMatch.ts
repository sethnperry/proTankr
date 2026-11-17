// lib/equipment/geotabMatch.ts — what to offer a driver when Geotab and ProTankr disagree about their equipment.
// Geotab is the source of truth for who is in which truck and what is hooked to it; the driver confirms before anything
// changes. Pure: no clock, no network.

export type GeoUnit = {
  id: string; name: string; status: string | null; notes: string | null; subStatus: string | null; statusAt: string | null; location: string | null;
  deadlinedBy: string | null; resume: { notes: string | null; deadlinedAt: string | null; deadlinedBy: string | null } | null;
};
export type GeoMine = {
  linked: boolean; signedIn?: boolean; role?: "driver" | "second"; truck?: GeoUnit | null; trailers?: GeoUnit[]; trailerKnown?: boolean;
  holder?: { id: string; name: string | null } | null; driver?: { id: string; name: string | null } | null; vehicleName?: string | null;
};
export type Held = { truckId: string | null; trailerId: string | null; secondSeatTruckId: string | null };

export type Proposal =
  | { kind: "second_seat"; truck: GeoUnit; driverName: string | null }
  | { kind: "promote"; truck: GeoUnit }
  | { kind: "link"; truck: GeoUnit; trailer: GeoUnit | null; holderName: string | null }
  | { kind: "couple"; truck: GeoUnit; trailer: GeoUnit }
  | { kind: "bobtail"; truck: GeoUnit }
  | { kind: "deadline_check"; truck: GeoUnit; trailer: GeoUnit | null };

export function proposalFor(geo: GeoMine | null | undefined, held: Held): Proposal | null {
  if (!geo?.linked || !geo.signedIn || !geo.truck) return null;
  const truck = geo.truck;
  const trailer = geo.trailers?.[0] ?? null;
  if (geo.role === "second") return held.secondSeatTruckId === truck.id ? null : { kind: "second_seat", truck, driverName: geo.driver?.name ?? null };
  if (held.secondSeatTruckId === truck.id) return { kind: "promote", truck };
  if (held.truckId !== truck.id) return { kind: "link", truck, trailer, holderName: geo.holder?.name ?? null };
  if (trailer && held.trailerId !== trailer.id) return { kind: "couple", truck, trailer };
  if (!trailer && geo.trailerKnown && held.trailerId) return { kind: "bobtail", truck };
  if (truck.status === "deadline" || (trailer && trailer.status === "deadline")) return { kind: "deadline_check", truck, trailer };
  return null;
}

/** The units in a proposal that are Deadline: each needs an answer (repairs done, or repositioning) before linking. */
export function deadlinedUnits(p: Proposal): { kind: "truck" | "trailer"; unit: GeoUnit }[] {
  const out: { kind: "truck" | "trailer"; unit: GeoUnit }[] = [];
  const trailer = "trailer" in p ? p.trailer : null;
  if (p.kind !== "second_seat" && p.kind !== "promote" && p.kind !== "bobtail") {
    if (p.truck.status === "deadline") out.push({ kind: "truck", unit: p.truck });
    if (trailer && trailer.status === "deadline") out.push({ kind: "trailer", unit: trailer });
  }
  return out;
}

/** A key that changes when the situation does, so "not now" lasts until something new happens. */
export function proposalKey(p: Proposal): string {
  const t = "trailer" in p && p.trailer ? p.trailer.id : "-";
  return `${p.kind}:${p.truck.id}:${t}:${p.truck.status ?? ""}`;
}
