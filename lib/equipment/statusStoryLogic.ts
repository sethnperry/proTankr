// lib/equipment/statusStoryLogic.ts — the pure half of statusStory (tested without a database).

export type StatusStory = {
  byId: string | null; byName: string | null; at: string | null; source: "shift end" | "status update" | null;
  lat: number | null; lon: number | null; placeLabel: string | null;
};
export type ShiftEndRow = { user_id: string; occurred_at: string };

export const WINDOW_MS = 3 * 60_000;

/** The user whose shift ended in the few minutes before the status was set. `userId` narrows it to one person. */
export function inferShiftEnd(events: ShiftEndRow[], statusAtIso: string | null, userId?: string | null): string | null {
  const t = statusAtIso ? Date.parse(statusAtIso) : NaN;
  if (!Number.isFinite(t)) return null;
  const hits = events.filter((e) => {
    const d = t - Date.parse(e.occurred_at);
    return d >= -30_000 && d <= WINDOW_MS && (!userId || e.user_id === userId);
  });
  const who = [...new Set(hits.map((h) => h.user_id))];
  return who.length === 1 ? who[0] : null;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "Deadlined by Kyle Tatro · 11/14, 12:00 AM · shift end" */
export function storyLine(verb: string, s: Pick<StatusStory, "byName" | "at" | "source">): string {
  return [s.byName ? `${verb} by ${s.byName}` : verb, s.at ? fmt(s.at) : null, s.source].filter(Boolean).join(" · ");
}

