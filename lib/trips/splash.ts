// lib/trips/splash.ts
//
// Splash blending: product is loaded on top of another in the same compartment (ethanol first at one
// terminal, regular on top at the next). The blend percent is the first product's share of the finished
// compartment, so how much goes on top follows from what is already aboard:
//   total = aboard / pct,  on top = total - aboard,  held to the room the compartment has left.
// Pure.

export type SplashPlan = {
  /** Gallons already in the compartment. */
  aboard: number;
  /** Gallons of room left in it. */
  room: number;
  /** Gallons to load on top (the amount needed, held to the room). */
  add: number;
  /** True when the room is short of what the percent needs. */
  short: boolean;
  /** The first product's share of the compartment once `add` is loaded, in percent. Null when nothing is aboard. */
  blend: number | null;
  /** The finished compartment, gallons. */
  total: number;
};

/** The usual blend choices (E10, E15). */
export const BLEND_CHOICES = [10, 15] as const;

export function validPct(pct: number): boolean {
  return Number.isFinite(pct) && pct > 0 && pct < 100;
}

export function splashPlan(args: { max: number; aboard: number; pct: number }): SplashPlan {
  const max = Math.max(0, args.max);
  const aboard = Math.max(0, args.aboard);
  const room = Math.max(0, max - aboard);
  if (!validPct(args.pct) || aboard <= 0) {
    return { aboard, room, add: 0, short: false, blend: aboard > 0 ? 100 : null, total: aboard };
  }
  const need = (aboard * (100 - args.pct)) / args.pct;
  const add = Math.floor(Math.min(need, room));
  return {
    aboard, room, add, short: need > room + 0.5,
    blend: aboard / (aboard + add) * 100,
    total: aboard + add,
  };
}

/** What a compartment may take on top of its load: loaded, with room, and not already blended. */
export function canSplashInto(args: { max: number; aboard: number | null; rows: number }): boolean {
  return args.rows === 1 && args.aboard != null && args.aboard > 0 && args.max - args.aboard >= 1;
}
