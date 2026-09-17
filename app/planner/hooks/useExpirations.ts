"use client";
// hooks/useExpirations.ts

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export type ExpirationItem = {
  id: string;
  label: string;
  entityName: string;      // truck name, trailer name, terminal name, badge name, or "License"/"Medical"/"TWIC"
  entitySubtitle: string;  // doc type for equipment, city/state for terminals
  entityType: "truck" | "trailer" | "terminal" | "badge" | "credential";
  entityId: string;
  expiresISO: string;
  daysLeft: number;
  expired: boolean;
  // Terminal items only -- carried as structured fields (not just parsed
  // back out of entitySubtitle) so the notification modal can group by
  // city without re-parsing a "City, ST" display string.
  city?: string;
  state?: string;
};

// Truck/trailer expirations are read from the dynamic permit_types +
// equipment_permits system (see supabase/migrations/20260723000000_
// permit_types_binder.sql) rather than the old hardcoded expiration-date
// columns -- this keeps the badge in sync with whatever the Binder screen
// shows, including permit types the driver renamed or added themselves.
type PermitRow = {
  equipment_permit_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  expiration_date: string | null;
  permit_types: { name: string } | null;
};

type BadgeRow = { id: string; port_name: string; category: string | null; expiration_date: string | null };

const TRUCK_WARN_DAYS      = 30;
const TRAILER_WARN_DAYS    = 30;
// Terminal cards, badges, and credentials all share the same 7-day warn
// window -- matches the Dispatch tab's own expStateFor (see
// app/planner/dispatch/page.tsx), which this modal is organized to agree
// with rather than inventing a second set of thresholds.
const TERMINAL_WARN_DAYS   = 7;
const BADGE_WARN_DAYS      = 7;
const CREDENTIAL_WARN_DAYS = 7;

const DEFER_KEY = "protankr_exp_deferred_v1";

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(isoDate + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

function loadDeferred(): Set<string> {
  try {
    const raw = localStorage.getItem(DEFER_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}

function saveDeferred(set: Set<string>) {
  try { localStorage.setItem(DEFER_KEY, JSON.stringify(Array.from(set))); } catch {}
}

export function useExpirations(opts: {
  truckId: string | null;
  trailerId: string | null;
  truckName: string;
  trailerName: string;
  accessDateByTerminalId: Record<string, string | undefined>;
  terminals: any[];
  terminalCatalog?: any[];
  addDaysISO_: (iso: string, days: number) => string;
  // Whoever's own badges/license/medical/TWIC to check -- effectiveUserId,
  // so this respects admin impersonation the same way equipment/terminals
  // already do.
  userId: string | null;
}) {
  const {
    truckId, trailerId, truckName, trailerName,
    accessDateByTerminalId, terminals, terminalCatalog, addDaysISO_,
    userId,
  } = opts;

  const [truckPermits,   setTruckPermits]   = useState<PermitRow[]>([]);
  const [trailerPermits, setTrailerPermits] = useState<PermitRow[]>([]);
  const [truckLoaded,   setTruckLoaded]   = useState(false);
  const [trailerLoaded, setTrailerLoaded] = useState(false);

  const [badgeRows, setBadgeRows] = useState<BadgeRow[]>([]);
  const [licenseExp, setLicenseExp] = useState<string | null>(null);
  const [medicalExp, setMedicalExp] = useState<string | null>(null);
  const [twicExp, setTwicExp] = useState<string | null>(null);
  const [credsLoaded, setCredsLoaded] = useState(false);

  const [deferred,   setDeferred]   = useState<Set<string>>(() => loadDeferred());

  // Fetch truck permits
  useEffect(() => {
    if (!truckId) { setTruckPermits([]); setTruckLoaded(true); return; }
    (async () => {
      const { data } = await supabase
        .from("equipment_permits")
        .select("equipment_permit_id, truck_id, trailer_id, expiration_date, permit_types(name)")
        .eq("truck_id", truckId);
      setTruckPermits((data ?? []) as unknown as PermitRow[]);
      setTruckLoaded(true);
    })();
  }, [truckId]);

  // Fetch trailer permits
  useEffect(() => {
    if (!trailerId) { setTrailerPermits([]); setTrailerLoaded(true); return; }
    (async () => {
      const { data } = await supabase
        .from("equipment_permits")
        .select("equipment_permit_id, truck_id, trailer_id, expiration_date, permit_types(name)")
        .eq("trailer_id", trailerId);
      setTrailerPermits((data ?? []) as unknown as PermitRow[]);
      setTrailerLoaded(true);
    })();
  }, [trailerId]);

  // Fetch badges + credentials
  useEffect(() => {
    if (!userId) { setBadgeRows([]); setLicenseExp(null); setMedicalExp(null); setTwicExp(null); setCredsLoaded(true); return; }
    (async () => {
      const [{ data: badgeData }, { data: licRow }, { data: medRow }, { data: twicRow }] = await Promise.all([
        supabase.from("driver_port_ids").select("id, port_name, category, expiration_date").eq("user_id", userId),
        supabase.from("driver_licenses").select("expiration_date").eq("user_id", userId).maybeSingle(),
        supabase.from("driver_medical_cards").select("expiration_date").eq("user_id", userId).maybeSingle(),
        supabase.from("driver_twic_cards").select("expiration_date").eq("user_id", userId).maybeSingle(),
      ]);
      setBadgeRows((badgeData ?? []) as BadgeRow[]);
      setLicenseExp((licRow as any)?.expiration_date ?? null);
      setMedicalExp((medRow as any)?.expiration_date ?? null);
      setTwicExp((twicRow as any)?.expiration_date ?? null);
      setCredsLoaded(true);
    })();
  }, [userId]);

  // Build item list
  const items = useMemo<ExpirationItem[]>(() => {
    const out: ExpirationItem[] = [];

    const name_ = truckName || "Truck";
    for (const row of truckPermits) {
      const iso = row.expiration_date;
      if (!iso) continue;
      const label = row.permit_types?.name ?? "Permit";
      const days = daysUntil(iso);
      if (days <= TRUCK_WARN_DAYS) {
        out.push({ id: `truck-${truckId}-${row.equipment_permit_id}`, label, entityName: name_, entitySubtitle: label, entityType: "truck", entityId: String(truckId), expiresISO: iso, daysLeft: days, expired: days < 0 });
      }
    }

    const trailerName_ = trailerName || "Trailer";
    for (const row of trailerPermits) {
      const iso = row.expiration_date;
      if (!iso) continue;
      const label = row.permit_types?.name ?? "Permit";
      const days = daysUntil(iso);
      if (days <= TRAILER_WARN_DAYS) {
        out.push({ id: `trailer-${trailerId}-${row.equipment_permit_id}`, label, entityName: trailerName_, entitySubtitle: label, entityType: "trailer", entityId: String(trailerId), expiresISO: iso, daysLeft: days, expired: days < 0 });
      }
    }

    for (const [terminalId, lastVisitISO] of Object.entries(accessDateByTerminalId)) {
      if (!lastVisitISO) continue;
      // Prefer the shared terminals-catalog (useTerminalsCatalog.ts) over the
      // live my_terminals_with_status state -- MyTerminalsModal.tsx's own
      // card countdown (the "sorted" array) reads renewal_days from this
      // same catalog exclusively, and both terminal-edit write paths
      // (EditTerminalModal.tsx, app/admin/page.tsx's TerminalModal) now
      // explicitly invalidate it on save. The live `terminals` state has no
      // equivalent guarantee -- it only refreshes when loadMyTerminals()
      // happens to re-run (e.g. a fresh mount of the Planner layout), which
      // an admin's edit made from elsewhere (or from within the same
      // long-lived session) doesn't reliably trigger -- so preferring it
      // here let this bell/report disagree with the card on the very same
      // terminal's renewal_days after an edit. Both sources read the same
      // underlying `terminals.renewal_days` column either way; this only
      // changes which one wins when they haven't both refreshed yet.
      const terminal = terminalCatalog?.find((t: any) => String(t.terminal_id) === terminalId)
        ?? terminals.find((t: any) => String(t.terminal_id) === terminalId);
      const renewalDays = Number(terminal?.renewal_days ?? terminal?.renewalDays ?? 90) || 90;
      const expiresISO = addDaysISO_(lastVisitISO, renewalDays);
      const days = daysUntil(expiresISO);
      if (days <= TERMINAL_WARN_DAYS) {
        const city  = terminal?.city  ? String(terminal.city)  : "";
        const state = terminal?.state ? String(terminal.state) : "";
        const subtitle = city && state ? `${city}, ${state}` : city || state || "Terminal Card";
        out.push({
          id: `terminal-${terminalId}`,
          label: subtitle,
          entityName: terminal?.terminal_name ?? `Terminal ${terminalId}`,
          entitySubtitle: subtitle,
          entityType: "terminal",
          entityId: terminalId,
          expiresISO,
          daysLeft: days,
          expired: days < 0,
          city: city || undefined,
          state: state || undefined,
        });
      }
    }

    for (const b of badgeRows) {
      const iso = b.expiration_date;
      if (!iso) continue;
      const days = daysUntil(iso);
      if (days <= BADGE_WARN_DAYS) {
        const name = b.category ? `${b.port_name} (${b.category})` : b.port_name;
        out.push({ id: `badge-${b.id}`, label: name, entityName: name, entitySubtitle: "Badge", entityType: "badge", entityId: String(b.id), expiresISO: iso, daysLeft: days, expired: days < 0 });
      }
    }

    const credentialEntries: { key: string; name: string; iso: string | null }[] = [
      { key: "license", name: "License", iso: licenseExp },
      { key: "medical", name: "Medical", iso: medicalExp },
      { key: "twic", name: "TWIC", iso: twicExp },
    ];
    for (const c of credentialEntries) {
      if (!c.iso) continue;
      const days = daysUntil(c.iso);
      if (days <= CREDENTIAL_WARN_DAYS) {
        out.push({ id: `credential-${c.key}`, label: c.name, entityName: c.name, entitySubtitle: "Credential", entityType: "credential", entityId: c.key, expiresISO: c.iso, daysLeft: days, expired: days < 0 });
      }
    }

    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }, [truckPermits, trailerPermits, truckId, trailerId, truckName, trailerName, accessDateByTerminalId, terminals, terminalCatalog, addDaysISO_, badgeRows, licenseExp, medicalExp, twicExp]);

  // Auto-remove from deferred only when data is fully loaded
  // Guards against wiping deferred state during initial load before data arrives
  // dataLoaded: truck+trailer+badges/credentials fetched AND terminals data has arrived
  // We check terminals.length > 0 OR accessDateByTerminalId has keys
  // to ensure we don't wipe deferred state before terminal data loads
  const terminalDataReady = Object.keys(accessDateByTerminalId).length > 0 || terminals.length > 0;
  const dataLoaded = truckLoaded && trailerLoaded && credsLoaded && terminalDataReady;

  useEffect(() => {
    if (!dataLoaded) return;
    const activeIds = new Set(items.map(i => i.id));
    setDeferred(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        if (!activeIds.has(id)) { next.delete(id); changed = true; }
      }
      if (changed) saveDeferred(next);
      return changed ? next : prev;
    });
  }, [items, dataLoaded]);

  const toggleDefer = useCallback((id: string) => {
    setDeferred(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveDeferred(next);
      return next;
    });
  }, []);

  const activeItems   = useMemo(() => items.filter(i => !deferred.has(i.id)), [items, deferred]);
  const deferredItems = useMemo(() => items.filter(i =>  deferred.has(i.id)), [items, deferred]);

  const expiredCount  = useMemo(() => activeItems.filter(i => i.expired).length,  [activeItems]);
  const warningCount  = useMemo(() => activeItems.filter(i => !i.expired).length, [activeItems]);
  const mostUrgent    = activeItems[0] ?? null;
  const allDeferred   = items.length > 0 && activeItems.length === 0;

  // Memoized -- see useEquipment.ts's identical comment for why.
  return useMemo(() => ({
    items, activeItems, deferredItems, expiredCount, warningCount, mostUrgent, allDeferred, toggleDefer,
  }), [items, activeItems, deferredItems, expiredCount, warningCount, mostUrgent, allDeferred, toggleDefer]);
}
