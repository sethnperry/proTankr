// lib/adminSetupClient.ts
// Thin client used by hooks when a setupSession is active.
// Calls /api/admin/setup with the admin's JWT so the server
// can verify admin status, then performs the op as targetUserId.

import { supabase } from "@/lib/supabase/client";

async function getAdminToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

async function setupFetch<T = any>(
  op: string,
  targetUserId: string,
  params: Record<string, any> = {}
): Promise<T> {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ op, targetUserId, ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Setup API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Primary equipment ────────────────────────────────────────────────────────

export async function getPrimaryEquipment(targetUserId: string) {
  return setupFetch<{ primaryTruckIds: string[]; primaryTrailerIds: string[] }>(
    "get_primary_equipment", targetUserId
  );
}

export async function setPrimaryTruck(targetUserId: string, truckId: string) {
  return setupFetch("set_primary_truck", targetUserId, { truckId });
}

export async function removePrimaryTruck(targetUserId: string, truckId: string) {
  return setupFetch("remove_primary_truck", targetUserId, { truckId });
}

export async function setPrimaryTrailer(targetUserId: string, trailerId: string) {
  return setupFetch("set_primary_trailer", targetUserId, { trailerId });
}

export async function removePrimaryTrailer(targetUserId: string, trailerId: string) {
  return setupFetch("remove_primary_trailer", targetUserId, { trailerId });
}

// ── Terminal access ──────────────────────────────────────────────────────────

export async function getTerminalAccess(targetUserId: string) {
  return setupFetch<{ accessDateByTerminalId: Record<string, string> }>(
    "get_terminal_access", targetUserId
  );
}

export async function setTerminalAccess(targetUserId: string, terminalId: string, isoDate: string) {
  return setupFetch("set_terminal_access", targetUserId, { terminalId, isoDate });
}

// ── My terminals ─────────────────────────────────────────────────────────────

export async function getMyTerminals(targetUserId: string) {
  return setupFetch<{ terminals: any[] }>("get_my_terminals", targetUserId);
}

export async function setMyTerminal(targetUserId: string, terminalId: string) {
  return setupFetch("set_my_terminal", targetUserId, { terminalId });
}

export async function removeMyTerminal(targetUserId: string, terminalId: string) {
  return setupFetch("remove_my_terminal", targetUserId, { terminalId });
}

// ── Card data ────────────────────────────────────────────────────────────────

export async function getCardData(targetUserId: string) {
  return setupFetch<{ cardDataByTerminalId: Record<string, { cardNumber: string; privateNote: string; pin: string }> }>(
    "get_card_data", targetUserId
  );
}

export async function setCardData(
  targetUserId: string,
  terminalId: string,
  cardNumber: string,
  privateNote: string,
  pin: string
) {
  return setupFetch("set_card_data", targetUserId, { terminalId, cardNumber, privateNote, pin });
}

// ── Company ID ───────────────────────────────────────────────────────────────

export async function getCompanyId(targetUserId: string) {
  return setupFetch<{ companyId: string | null }>("get_company_id", targetUserId);
}

// ── RPC proxies ──────────────────────────────────────────────────────────────

export async function claimCombo(targetUserId: string, comboId: string) {
  return setupFetch("claim_combo", targetUserId, { comboId });
}

export async function coupleCombo(
  targetUserId: string,
  truckId: string,
  trailerId: string,
  opts?: { tareLbs?: number; targetWeight?: number; bufferLbs?: number; force?: boolean }
) {
  return setupFetch<{ data: { combo_id: string; tare_lbs: number; created: boolean } }>(
    "couple_combo", targetUserId,
    { truckId, trailerId, ...opts }
  );
}

export async function getCurrentEquipment(targetUserId: string) {
  return setupFetch<{ currentTruckId: string | null; currentTrailerId: string | null }>(
    "get_current_equipment", targetUserId
  );
}

export async function setCurrentEquipmentProxy(
  targetUserId: string,
  truckId: string | null,
  trailerId: string | null
) {
  return setupFetch("set_current_equipment", targetUserId, { truckId, trailerId });
}

export async function slipSeatCombo(targetUserId: string, comboId: string) {
  return setupFetch("slip_seat_combo", targetUserId, { comboId });
}

export async function getCarded(targetUserId: string, terminalId: string, cardedOn: string) {
  return setupFetch("get_carded", targetUserId, { terminalId, cardedOn });
}
