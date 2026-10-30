// lib/trips/gaugingAsk.ts
//
// When a driver marks a terminal down for gauging and we don't know its gauging time yet, the app asks
// "when does it begin, and when does it end?" and stores them as the terminal's gauging_cutoff (start,
// "HH:MM" terminal time) and gauging_minutes (length, wrapping past midnight). Pure.

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));

/** True when the terminal has no gauging time of its own, so the question is worth asking. */
export function needsGaugingAnswer(t: { gauging_cutoff?: string | null } | null | undefined): boolean {
  return !!t && !(t.gauging_cutoff && HM.test(t.gauging_cutoff));
}

/** Start and end as "HH:MM" -> what the terminal row stores. An end before the start runs past midnight. */
export function gaugingFromTimes(start: string, end: string): { cutoff: string; minutes: number } | null {
  if (!HM.test(start) || !HM.test(end)) return null;
  const a = mins(start), b = mins(end);
  if (a === b) return null;
  const minutes = (b - a + 1440) % 1440;
  return minutes > 720 ? null : { cutoff: start, minutes };
}
