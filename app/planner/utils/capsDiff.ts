// app/planner/utils/capsDiff.ts
// Pure: whether a live plan is the saved plan with only the caps changed.

/** Same product in every compartment, but a different cap somewhere. */
export function capsDifferOnly(saved: Record<number, any> | undefined, live: Record<number, any> | undefined): boolean {
  const keys = new Set([...Object.keys(saved ?? {}), ...Object.keys(live ?? {})]);
  let capDiff = false;
  for (const k of keys) {
    const a = (saved ?? {})[Number(k)], b = (live ?? {})[Number(k)];
    const pa = a && !a.empty ? a.productId || "" : "", pb = b && !b.empty ? b.productId || "" : "";
    if (pa !== pb) return false;
    if (pa && (a?.capOverride ?? null) !== (b?.capOverride ?? null)) capDiff = true;
  }
  return capDiff;
}
