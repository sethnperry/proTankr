// lib/supabase/dedupeFetch.ts
//
// A fetch wrapper for the Supabase client that stops the app asking the server the same question many times.
// Opening the dashboard fires ~170 requests, many of them identical (the same settings, the same user, the same
// super-admin check, asked by five components). Each costs a round trip on a phone.
//
//   - A GET to the database (/rest/v1/...) or the "who am I" call (/auth/v1/user) that is identical to one already
//     in flight, or answered within the last few seconds by the same signed-in user, shares that answer.
//   - Any write (insert, update, delete, upload) or any RPC clears everything remembered, so a screen that saves and
//     then reloads never reads an old answer. RPCs that only read (the super-admin check) are exempt and live longer.
//   - Everything else (token refresh, sign in, storage downloads) passes straight through untouched.
//
// Pure: the real fetch is passed in, so this is unit tested without a network.

type Fetch = typeof fetch;

export const READ_TTL_MS = 4_000;     // database reads
export const USER_TTL_MS = 30_000;    // who am I
export const STATIC_RPC_TTL_MS = 5 * 60_000; // is_super_admin: changes only by a deliberate admin action
const STATIC_RPCS = new Set(["is_super_admin"]);

type Entry = { at: number; ttl: number; res: Promise<Response> };

export function makeDedupeFetch(base: Fetch, now: () => number = Date.now): Fetch & { clear: () => void } {
  const cache = new Map<string, Entry>();
  const clear = () => { for (const [k, e] of cache) if (e.ttl !== STATIC_RPC_TTL_MS) cache.delete(k); };

  const fn = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = typeof input === "string" || input instanceof URL ? null : (input as Request);
    const url = req ? req.url : String(input);
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    let path = "";
    try { path = new URL(url, "http://x").pathname; } catch { return base(input, init); }

    const headers = new Headers(init?.headers ?? req?.headers ?? undefined);
    const auth = headers.get("authorization") ?? "";
    const isRest = path.startsWith("/rest/v1/");
    const rpcName = isRest && path.startsWith("/rest/v1/rpc/") ? path.slice("/rest/v1/rpc/".length) : null;

    // Static, read-only RPC (a POST, but safe to share).
    if (method === "POST" && rpcName && STATIC_RPCS.has(rpcName)) {
      const key = `rpc|${rpcName}|${auth}|${typeof init?.body === "string" ? init.body : ""}`;
      return share(cache, key, STATIC_RPC_TTL_MS, now, () => base(input, init));
    }
    // Any other write or RPC: forget what we know.
    if (method !== "GET" && method !== "HEAD") {
      if (isRest || path.startsWith("/storage/") || path.startsWith("/auth/v1/user")) clear();
      return base(input, init);
    }
    if (method === "GET" && path === "/auth/v1/user") {
      return share(cache, `user|${auth}`, USER_TTL_MS, now, () => base(input, init));
    }
    if (method === "GET" && isRest) {
      return share(cache, `get|${url}|${auth}|${headers.get("accept") ?? ""}|${headers.get("accept-profile") ?? ""}|${headers.get("prefer") ?? ""}|${headers.get("range") ?? ""}`, READ_TTL_MS, now, () => base(input, init));
    }
    return base(input, init);
  }) as Fetch & { clear: () => void };
  fn.clear = clear;
  return fn;
}

function share(cache: Map<string, Entry>, key: string, ttl: number, now: () => number, go: () => Promise<Response>): Promise<Response> {
  const hit = cache.get(key);
  if (hit && now() - hit.at < hit.ttl) return hit.res.then((r) => r.clone());
  const res = go();
  const entry: Entry = { at: now(), ttl, res };
  cache.set(key, entry);
  // A failed or non-OK answer is not remembered: the next ask goes to the server again.
  res.then((r) => { if (!r.ok && cache.get(key) === entry) cache.delete(key); }, () => { if (cache.get(key) === entry) cache.delete(key); });
  return res.then((r) => r.clone());
}
