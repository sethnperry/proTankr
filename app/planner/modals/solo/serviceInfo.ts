"use client";
// app/planner/modals/solo/serviceInfo.ts
//
// Service-due, last-service and wash lines for the report section.

import type { UnitServiceDue } from "./types";
import { type ServiceType } from "../ServiceTypeManager";
import type { UnitWash } from "./types";
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
}

export type ServiceRecordLite = { service_type_id: string; date: string; reading_value: number | null; created_at: string };

export function computeUnitServiceDue(unitLabel: "Truck" | "Trailer", records: ServiceRecordLite[], types: ServiceType[]): UnitServiceDue {
  // A record whose type doesn't apply to this unit only exists here because
  // it tagged along on a "Both" service with the other unit (see
  // SimpleServiceModal.save()) -- it's not a real service requirement for
  // *this* unit, so it can't be "what's next due" here. That companion
  // context still shows in the full Service History; this compact report
  // line should never surface a "(with Truck)"-style entry.
  const applicable = records.filter((r) => {
    const type = types.find((t) => t.service_type_id === r.service_type_id);
    return !type || type.applies_to === "both" || type.applies_to === unitLabel.toLowerCase();
  });
  if (!applicable.length) return { unitLabel, typeName: null, display: "No service recorded" };

  // Only the most recently logged record OF EACH TYPE determines that
  // type's own current due state -- `date` is a date-only column, so two
  // same-day records for the same type/unit tie on it; created_at breaks
  // the tie.
  const latestByType = new Map<string, ServiceRecordLite>();
  for (const r of applicable) {
    const prev = latestByType.get(r.service_type_id);
    if (!prev || r.date > prev.date || (r.date === prev.date && r.created_at > prev.created_at)) {
      latestByType.set(r.service_type_id, r);
    }
  }

  type Candidate = { record: ServiceRecordLite; type: ServiceType | null; sortKey: number };
  const durationCandidates: Candidate[] = [];
  const milesCandidates: Candidate[] = [];
  const hoursCandidates: Candidate[] = [];
  // "No computable due" bucket -- interval_kind "none", or a miles/hours
  // type whose latest record predates the reading field being required.
  const fallbackCandidates: Candidate[] = [];

  for (const record of latestByType.values()) {
    const type = types.find((t) => t.service_type_id === record.service_type_id) ?? null;
    if (!type || type.interval_kind === "none" || type.interval_value == null) {
      fallbackCandidates.push({ record, type, sortKey: 0 });
      continue;
    }
    if (type.interval_kind === "duration") {
      const due = new Date(record.date);
      due.setDate(due.getDate() + type.interval_value);
      durationCandidates.push({ record, type, sortKey: due.getTime() });
      continue;
    }
    if (record.reading_value == null) {
      fallbackCandidates.push({ record, type, sortKey: 0 });
      continue;
    }
    const nextReading = record.reading_value + type.interval_value;
    (type.interval_kind === "miles" ? milesCandidates : hoursCandidates).push({ record, type, sortKey: nextReading });
  }

  // A due DATE and a due ODOMETER/HOURS READING aren't the same unit of
  // "soon" -- only rankable within their own kind (comparing raw due
  // readings across records for the SAME unit is still valid even without
  // live telemetry, since it's the same monotonically increasing odometer/
  // hour meter counting up toward each threshold). When both a duration-due
  // and a mileage/hours-due type exist, duration wins -- a concrete
  // calendar deadline is the more universally actionable of the two.
  const soonest = (list: Candidate[]) => list.reduce((a, b) => (b.sortKey < a.sortKey ? b : a));
  const winner = durationCandidates.length
    ? soonest(durationCandidates)
    : milesCandidates.length
      ? soonest(milesCandidates)
      : hoursCandidates.length
        ? soonest(hoursCandidates)
        : // Nothing computably "due" for any type -- fall back to whichever was
          // logged most recently, same as this function's original behavior.
          fallbackCandidates.reduce((a, b) =>
            b.record.date !== a.record.date ? (b.record.date > a.record.date ? b : a) : b.record.created_at > a.record.created_at ? b : a,
          );

  const { record: latest, type } = winner;
  const typeName = type?.name ?? "Service";

  if (!type || type.interval_kind === "none" || type.interval_value == null) {
    return { unitLabel, typeName, display: `Last serviced ${fmtDate(latest.date)}` };
  }

  if (type.interval_kind === "duration") {
    const due = new Date(latest.date);
    due.setDate(due.getDate() + type.interval_value);
    return { unitLabel, typeName, display: `Due ${fmtDate(due.toISOString())}` };
  }

  // miles / hours -- needs the reading recorded at the last service to
  // compute a next-due threshold. Older records saved before the reading
  // field was required may not have one.
  if (latest.reading_value == null) {
    return { unitLabel, typeName, display: `Last serviced ${fmtDate(latest.date)} (reading not recorded)` };
  }
  const unitWord = type.interval_kind === "miles" ? "mi" : "hrs";
  const nextReading = latest.reading_value + type.interval_value;
  return { unitLabel, typeName, display: `Due at ${nextReading.toLocaleString()} ${unitWord}` };
}

export type UnitLastService = { unitLabel: "Truck" | "Trailer"; typeName: string | null; display: string };

/**
 * Backward-looking, unlike computeUnitServiceDue's forward-looking "next
 * due" -- per explicit spec, the trailer's own report line shows the date
 * (short form) and type of its MOST RECENT service, not a due prediction.
 * Trailers may not have a configured interval at all (service types can
 * be duration/miles/hours/none), so "due" often isn't even computable for
 * them -- but even when it is, this line is deliberately about what
 * already happened, matching "the trailer line should show the date...
 * and the type of service done."
 */
export function mostRecentServiceForUnit(
  unitLabel: "Truck" | "Trailer",
  records: ServiceRecordLite[],
  types: ServiceType[],
): UnitLastService {
  const applicable = records.filter((r) => {
    const type = types.find((t) => t.service_type_id === r.service_type_id);
    return !type || type.applies_to === "both" || type.applies_to === unitLabel.toLowerCase();
  });
  if (!applicable.length) return { unitLabel, typeName: null, display: "No service recorded" };
  const latest = applicable.reduce((a, b) => (b.date !== a.date ? (b.date > a.date ? b : a) : b.created_at > a.created_at ? b : a));
  const type = types.find((t) => t.service_type_id === latest.service_type_id) ?? null;
  const short = new Date(latest.date).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "2-digit" });
  return { unitLabel, typeName: type?.name ?? "Service", display: `${short} · ${type?.name ?? "Service"}` };
}

export function computeWashLines(truckWashedAt: string | null, trailerWashedAt: string | null): UnitWash[] {
  const sameDay = !!truckWashedAt && !!trailerWashedAt && truckWashedAt.slice(0, 10) === trailerWashedAt.slice(0, 10);
  if (sameDay) return [{ unitLabel: "Both", display: fmtDate(truckWashedAt!) }];

  const lines: UnitWash[] = [];
  if (truckWashedAt) lines.push({ unitLabel: "Truck", display: fmtDate(truckWashedAt) });
  if (trailerWashedAt) lines.push({ unitLabel: "Trailer", display: fmtDate(trailerWashedAt) });
  return lines;
}
