// lib/ui/startPoll.ts
//
// A setInterval for data polling that does nothing while the app is in the background, and catches up with one
// refresh the moment it comes back (when it has been away at least one full interval). A phone left in a cab with
// the app open used to keep asking the server every 30-60 seconds, per screen, all day.
// Returns a stop function. Clocks that only update a number on screen can keep using setInterval.

export function startPoll(fn: () => void, ms: number): () => void {
  if (typeof document === "undefined") return () => {};
  let last = Date.now();
  const run = () => { last = Date.now(); fn(); };
  const t = window.setInterval(() => { if (document.visibilityState === "visible") run(); }, ms);
  const onVis = () => { if (document.visibilityState === "visible" && Date.now() - last >= ms) run(); };
  document.addEventListener("visibilitychange", onVis);
  return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
}
