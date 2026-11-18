// lib/recap/score.ts
//
// Credit. A segment earns its actual minutes up to the standard, so going faster earns nothing extra, plus verified
// wait. credit = evidence x (min(actual, standard) + wait). Gray zone is credited up to the admin's allowance for its
// kind and a per-shift cap; the rest is unaccounted. ATR = credit / on-duty time.

import type { Shift } from "../shifts/shiftLogic.ts";
import type { LatLon, RecapSettings, Scored, Segment, ShiftScore } from "./types.ts";
import { bucketOf } from "./time.ts";
import { standardFor, type Standards } from "./standards.ts";

const OVER = 1.25; // a peer ran the same stretch at least 25% over standard

export function scoreShifts(
  shifts: { shift: Shift; segments: Segment[] }[],
  std: Standards,
  settings: RecapSettings,
  coords: (key: string | null) => LatLon | null,
): ShiftScore[] {
  // First pass: standards and excess for every segment (corroboration needs every driver's).
  type Pre = { seg: Segment; standard: ReturnType<typeof standardFor>; excess: number };
  const pre = new Map<Segment, Pre>();
  const seen = new Map<string, number>(); // visits made earlier in this same week
  for (const { segments } of shifts) {
    for (const seg of [...segments].sort((a, b) => a.startMs - b.startMs)) {
      const vk = `${seg.userId}|${seg.key}`;
      const idx = (std.visits.get(vk) ?? 0) + (seen.get(vk) ?? 0);
      if (seg.type === "rack" || seg.type === "drop") seen.set(vk, (seen.get(vk) ?? 0) + 1);
      const standard = standardFor(seg, std, settings, coords, idx);
      pre.set(seg, { seg, standard, excess: standard ? Math.max(0, seg.minutes - standard.minutes) : 0 });
    }
  }
  // Peers who ran the same place at the same hour at least 25% over standard.
  const slow = new Map<string, Set<string>>();
  for (const p of pre.values()) {
    if (!p.standard || !p.seg.key || p.seg.minutes < p.standard.minutes * OVER) continue;
    const k = `${p.seg.type}|${p.seg.key}|${bucketOf(p.seg.hour)}`;
    const set = slow.get(k) ?? new Set<string>(); set.add(p.seg.userId); slow.set(k, set);
  }

  return shifts.map(({ shift, segments }) => {
    let grayLeft = settings.shiftGrayCapMin;
    const endedByHand = !shift.unconfirmed && !!shift.endSource && shift.endSource !== "geotab";
    const scored: Scored[] = [...segments].sort((a, b) => a.startMs - b.startMs).map((seg): Scored => {
      const base = { ...seg, standardMin: null as number | null, basis: null as Scored["basis"], credit: 0, excessMin: 0, waitCredited: 0, corroborated: false, unaccounted: 0, cause: null as string | null };
      if (seg.type === "gray") {
        const allow = seg.grayKind === "start" ? settings.startAllowanceMin : seg.grayKind === "end" ? (endedByHand ? settings.endAllowanceMin : 0) : settings.betweenAllowanceMin;
        const credit = Math.max(0, Math.min(seg.minutes, allow, grayLeft));
        grayLeft -= credit;
        return { ...base, standardMin: allow, basis: "allowance", credit, unaccounted: seg.minutes - credit, cause: seg.minutes > credit ? "Unexplained gap" : null };
      }
      if (seg.type === "fuel") return { ...base, standardMin: seg.minutes, basis: "actual", credit: seg.minutes };
      const p = pre.get(seg)!;
      const e = seg.evidence ? 1 : settings.evidenceLow;
      const standard = p.standard?.minutes ?? seg.minutes;
      const credited = Math.min(seg.minutes, standard);
      const excess = Math.max(0, seg.minutes - standard);
      let wait = 0, corroborated = false;
      const live = Math.min(seg.liveDelayMin, excess);
      wait += live;
      let rest = excess - live;
      const peers = seg.key ? slow.get(`${seg.type}|${seg.key}|${bucketOf(seg.hour)}`) : undefined;
      if (rest > 0 && peers) {
        const others = [...peers].filter((u) => u !== seg.userId).length;
        if (others >= settings.corroborationDrivers) { wait += rest; rest = 0; corroborated = true; }
      }
      if (rest > 0 && seg.afterNote) { wait += rest * settings.lateAnswerCredit; }
      const credit = e * (credited + wait);
      const cause = excess > 0 ? (seg.delayLabels[0] ?? (corroborated ? "Others were slow here too" : seg.afterNote ? "Reason given afterward" : "Unexplained")) : null;
      return { ...base, standardMin: standard, basis: p.standard?.basis ?? null, credit, excessMin: excess, waitCredited: wait, corroborated, unaccounted: Math.max(0, seg.minutes - credit), cause };
    });
    const onDuty = Math.max(0, (Date.parse(shift.endedAt!) - Date.parse(shift.startedAt)) / 60_000);
    return { shift, userId: shift.userId, onDutyMin: onDuty, creditMin: scored.reduce((n, s) => n + s.credit, 0), segments: scored, estimate: shift.startSource !== "geotab" };
  });
}
