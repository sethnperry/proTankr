// lib/telematics/switch.ts
//
// The company's telematics switch, in one place.
//
// Server: `connectionOn(row)` decides whether a connection counts (connected AND switched on); `providerFor` uses it, so
// every server read of the tracker honors the switch.
// Browser: a module flag set once per session from /api/telematics/status. `tfetch` is `fetch` for the /api/telematics
// routes: with the switch off it makes no network call and answers {connected:false}, the same thing a company with no
// connection gets, so every caller already knows what to do. Until the status is known the flag is on (nothing changes).

export type ConnectionRow = { status?: string | null; enabled?: boolean | null } | null | undefined;

/** Connected and switched on. A missing `enabled` (older row) counts as on. */
export function connectionOn(c: ConnectionRow): c is NonNullable<ConnectionRow> {
  return !!c && c.status === "active" && c.enabled !== false;
}

let on = true;
export const telematicsOn = (): boolean => on;
export function setTelematicsOn(v: boolean): void { on = v; }

const OFF_BODY = JSON.stringify({ connected: false, off: true });

export function tfetch(input: string, init?: RequestInit): Promise<Response> {
  if (!on) return Promise.resolve(new Response(OFF_BODY, { status: 200, headers: { "content-type": "application/json" } }));
  return fetch(input, init);
}
