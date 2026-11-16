// lib/squawk/squawk.ts
//
// Squawk channels: which ones a driver is in right now, and the key each message is filed under. The server
// (supabase/migrations/20261117000000_squawk.sql) decides who may read or send; this only builds keys and labels.
// Pure: no React, no Supabase.

export type SquawkType = "city_network" | "city_internal" | "company" | "region" | "local_area" | "truck" | "trailer";

export const SQUAWK_TYPES: { type: SquawkType; label: string; hint: string }[] = [
  { type: "city_network", label: "Terminal city network", hint: "Drivers of every company in this city" },
  { type: "city_internal", label: "Terminal city internal", hint: "Your company's drivers in this city" },
  { type: "company", label: "Company wide", hint: "Everyone in your company" },
  { type: "region", label: "My region", hint: "Drivers in your region" },
  { type: "local_area", label: "My local area", hint: "Drivers in your local area" },
  { type: "truck", label: "This truck", hint: "Whoever is on this truck" },
  { type: "trailer", label: "This trailer", hint: "Whoever is on this trailer" },
];

export type SquawkCtx = {
  companyId: string | null;
  city: string | null; state: string | null;
  region: string | null; localArea: string | null;
  truckId: string | null; trailerId: string | null;
};

export const cityKey = (city: string, state: string) => `${city.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
const norm = (s: string) => s.trim();

/** The key a channel's messages are filed under, or null while the driver isn't in it (no city yet, no truck...). */
export function channelKey(type: SquawkType, c: SquawkCtx): string | null {
  const city = c.city && c.state ? cityKey(c.city, c.state) : null;
  switch (type) {
    case "city_network": return city;
    case "city_internal": return c.companyId && city ? `${c.companyId}|${city}` : null;
    case "company": return c.companyId;
    case "region": return c.companyId && c.region?.trim() ? `${c.companyId}|${norm(c.region)}` : null;
    case "local_area": return c.companyId && c.region?.trim() && c.localArea?.trim() ? `${c.companyId}|${norm(c.region)}|${norm(c.localArea)}` : null;
    case "truck": return c.truckId;
    case "trailer": return c.trailerId;
  }
}

const WHY: Record<SquawkType, string> = {
  city_network: "Pick a city", city_internal: "Pick a city", company: "No company", region: "No region on your profile",
  local_area: "No local area on your profile", truck: "No truck selected", trailer: "No trailer selected",
};

export type SquawkChannel = { type: SquawkType; label: string; hint: string; key: string | null; why: string | null };
export function availableChannels(c: SquawkCtx): SquawkChannel[] {
  return SQUAWK_TYPES.map((t) => { const key = channelKey(t.type, c); return { ...t, key, why: key ? null : WHY[t.type] }; });
}

/** "Tampa" for the city channels, so the header always says which city is being talked to. */
export const cityLabel = (c: SquawkCtx) => (c.city && c.state ? `${c.city}, ${c.state}` : null);
export const isCityType = (t: SquawkType) => t === "city_network" || t === "city_internal";

export type Attachment = { path: string; name: string; type: string; size: number };
export const MAX_ATTACHMENTS = 5;
export const MAX_BODY = 1000;
/** A message with attachments tells the reader to save them: the message expires once it has been viewed. */
export const hasAttachments = (m: { attachments?: unknown }) => Array.isArray(m.attachments) && m.attachments.length > 0;
export const ATTACHMENT_NOTICE = "Download this before you close the window. Messages expire after they are viewed.";

/** Unread counts by channel, for the dashboard alert: the biggest first. */
export function topUnread(rows: { channel_type: string; channel_key: string; n: number | string }[]): { type: SquawkType; key: string; n: number } | null {
  const list = rows.map((r) => ({ type: r.channel_type as SquawkType, key: r.channel_key, n: Number(r.n) })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  return list[0] ?? null;
}
export const totalUnread = (rows: { n: number | string }[]) => rows.reduce((s, r) => s + Number(r.n), 0);
