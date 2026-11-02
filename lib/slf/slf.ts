// lib/slf/slf.ts
//
// Spotted Lanternfly, the rules only: which county names count as the same, which counties a trip entered that are
// in the company's zone list, what is attested and what is missing, and the compliance report. Pure.

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";

export type SlfAttestationRow = {
  trip_id: string; state: string; county: string; company_id: string; user_id: string;
  cab_exterior: boolean; frame_tool_box: boolean; trailer: boolean; attested_at: string; source: "geotab" | "app" | "manual"; client_updated_at?: string | null;
};

/** "Berks County", "berks", " BERKS county " are all "berks". */
export const normCounty = (c: string | null | undefined): string => (c ?? "").trim().toLowerCase().replace(/\s+(county|parish|borough)$/, "").replace(/\s+/g, " ");
export const normState = (s: string | null | undefined): string => (s ?? "").trim().toUpperCase();
export const countyKey = (state: string | null | undefined, county: string | null | undefined) => `${normState(state)}|${normCounty(county)}`;

export type Zone = { state: string; county: string };
export const zoneKeys = (zone: Zone[]) => new Set(zone.map((z) => countyKey(z.state, z.county)));

/** "Berks, Lehigh; Northampton" -> ["Berks", "Lehigh", "Northampton"]. For pasting a list in. */
export function parseCounties(text: string): string[] {
  return [...new Set(text.split(/[,;\n]+/).map((s) => s.trim().replace(/\s+county$/i, "")).filter(Boolean))];
}

export type TripStop = { kind: "pickup" | "delivery"; name: string; state: string | null; county: string | null; arrivedAt: string | null };

export type CountyEntry = { key: string; state: string; county: string; firstStop: string };

/** The in-zone counties a trip entered (a stop was arrived at there), once each, in the order entered. */
export function zoneCountiesEntered(stops: TripStop[], zone: Set<string>): CountyEntry[] {
  const out = new Map<string, CountyEntry>();
  for (const s of [...stops].filter((x) => x.arrivedAt && x.county && x.state).sort((a, b) => (a.arrivedAt as string).localeCompare(b.arrivedAt as string))) {
    const key = countyKey(s.state, s.county);
    if (zone.has(key) && !out.has(key)) out.set(key, { key, state: normState(s.state), county: (s.county as string).trim(), firstStop: s.name });
  }
  return [...out.values()];
}

export type Status = { entered: CountyEntry[]; attested: CountyEntry[]; missing: CountyEntry[] };
export function status(entered: CountyEntry[], attestations: Pick<SlfAttestationRow, "state" | "county">[]): Status {
  const have = new Set(attestations.map((a) => countyKey(a.state, a.county)));
  return { entered, attested: entered.filter((e) => have.has(e.key)), missing: entered.filter((e) => !have.has(e.key)) };
}

export type Checks = { cab: boolean; frame: boolean; trailer: boolean };
export const attestProblem = (c: Checks): string | null => (c.cab && c.frame && c.trailer ? null : "Check all three: the cab exterior, the frame rails and tool box, and the trailer.");

// ── The compliance report ──────────────────────────────────────────────────────────────────────────────────
export type ComplianceRow = { key: string; tripId: string; driverId: string; date: string; state: string; county: string; stop: string; attested: boolean; attestedAt: string | null };

export function complianceRows(trips: { trip_id: string; driver_id: string; started_at: string | null }[], stopsByTrip: Map<string, TripStop[]>, zone: Set<string>, attestations: SlfAttestationRow[]): ComplianceRow[] {
  const out: ComplianceRow[] = [];
  for (const t of trips) {
    const mine = attestations.filter((a) => a.trip_id === t.trip_id);
    for (const e of zoneCountiesEntered(stopsByTrip.get(t.trip_id) ?? [], zone)) {
      const a = mine.find((x) => countyKey(x.state, x.county) === e.key);
      out.push({ key: `${t.trip_id}|${e.key}`, tripId: t.trip_id, driverId: t.driver_id, date: t.started_at ?? "", state: e.state, county: e.county, stop: e.firstStop, attested: !!a, attestedAt: a?.attested_at ?? null });
    }
  }
  return out.sort((a, b) => Number(a.attested) - Number(b.attested) || b.date.localeCompare(a.date));
}

const mdy = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}` : ""; };
export function complianceColumns(nameOf: (id: string) => string): ShellColumn<ComplianceRow>[] {
  return [
    { key: "date", label: "Date", get: (r) => mdy(r.date), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.driverId), weight: 1.2 },
    { key: "county", label: "County", get: (r) => `${r.county}, ${r.state}`, weight: 1.4 },
    { key: "stop", label: "Stop", get: (r) => r.stop, weight: 1.4 },
    { key: "att", label: "Attested", get: (r) => (r.attested ? "Yes" : "MISSING"), weight: 0.9 },
  ];
}
export function complianceFilters(nameOf: (id: string) => string): ShellFilter<ComplianceRow>[] {
  return [
    { id: "att", label: "Attestation", of: (r) => (r.attested ? "yes" : "no"), show: (v) => (v === "yes" ? "Attested" : "Missing") },
    { id: "driver", label: "Driver", of: (r) => r.driverId, show: nameOf },
    { id: "county", label: "County", of: (r) => `${r.county}, ${r.state}` },
  ];
}
export const complianceSummary = (rows: ComplianceRow[]) => [
  { label: "In-zone counties", value: String(rows.length) }, { label: "Missing", value: String(rows.filter((r) => !r.attested).length) },
];
