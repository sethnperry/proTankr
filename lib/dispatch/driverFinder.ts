// lib/dispatch/driverFinder.ts
//
// Dispatch "Plan a load": the driver list only shows what the search asks for.
// Matches name, employee number, local area, region (a full list), and truck
// number: whoever has the truck now, and the last person in it before them.
// Pure, so it can be tested without a session.

export type FinderPerson = {
  userId: string;
  name: string;
  employeeNumber: string | null;
  localArea: string | null;
  region: string | null;
};
export type FinderMatch = { person: FinderPerson; why: string | null };

const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function findDrivers(i: {
  query: string;
  people: FinderPerson[];
  /** user id -> truck name they hold now */
  heldTruck: Map<string, string>;
  /** truck use, newest first */
  truckUsers: { truckName: string; driverId: string }[];
  limit?: number;
}): FinderMatch[] {
  const q = low(i.query);
  if (!q) return [];
  const byId = new Map(i.people.map((p) => [p.userId, p]));
  const out = new Map<string, FinderMatch>();
  const add = (p: FinderPerson | undefined, why: string | null) => { if (p && !out.has(p.userId)) out.set(p.userId, { person: p, why }); };

  // Trucks whose number matches: the holder now, then the last different driver.
  const trucks = new Set<string>();
  for (const t of i.heldTruck.values()) if (low(t).includes(q)) trucks.add(t);
  for (const u of i.truckUsers) if (low(u.truckName).includes(q)) trucks.add(u.truckName);
  const truckHits: FinderMatch[] = [];
  for (const t of [...trucks].sort()) {
    const holders = [...i.heldTruck].filter(([, name]) => name === t).map(([id]) => id);
    for (const id of holders) { const p = byId.get(id); if (p) truckHits.push({ person: p, why: `In truck ${t}` }); }
    const prev = i.truckUsers.find((u) => u.truckName === t && !holders.includes(u.driverId));
    const pp = prev ? byId.get(prev.driverId) : undefined;
    if (pp) truckHits.push({ person: pp, why: `Last in truck ${t}` });
  }
  for (const m of truckHits) add(m.person, m.why);

  for (const p of i.people) {
    if (low(p.name).includes(q)) add(p, null);
    else if (low(p.employeeNumber).includes(q)) add(p, `Employee #${p.employeeNumber}`);
    else if (low(p.localArea).includes(q)) add(p, p.localArea);
    else if (low(p.region).includes(q)) add(p, p.region);
  }
  const rank = (m: FinderMatch) => (m.why?.startsWith("In truck") ? 0 : m.why?.startsWith("Last in") ? 1 : 2);
  return [...out.values()].sort((a, b) => rank(a) - rank(b) || a.person.name.localeCompare(b.person.name)).slice(0, i.limit ?? 60);
}
