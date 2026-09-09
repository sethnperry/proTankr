"use client";
// app/planner/dispatch/page.tsx
//
// Real Dispatch tab dashboard, replacing the old Dashboard/Tasks/Ledger
// placeholder shell (shelved along with the rest of the 2026-07-30
// role-tabs work -- see CLAUDE.md "Terminal Tier — Build Spec"). Reachable
// as the Dispatch/Admin roles' middle tab (CalculatorLayoutClient.tsx).
//
// Pick a driver (shared via shell.selectedDriverId so the Cards tab and
// Terminal tab agree on the same driver across tab switches), then see:
// identity/schedule, equipment + its expiring/expired permit items,
// terminal card status (grouped by city), badges, credentials, and a
// dispatcher-notes box. All expiration coloring throughout this page uses
// one local expStateFor rule (expiring within 7 days = amber, ANY past
// date = red, no date on file = gray -- see that function's own comment
// for why this isn't cardTheme.ts's shared cardStateFor) so nothing on
// this page disagrees with itself about what "soon" or "overdue" means.
//
// 2026-08-07 rework (per explicit user direction): Terminal Cards grouped
// by city; added Badges and Credentials sections (same admin+dispatch RLS
// FleetCredentialsModal.tsx already relies on -- driver_licenses/
// driver_medical_cards/driver_twic_cards/driver_port_ids); Equipment moved
// above Terminal Cards and switched from "primary" equipment
// (user_primary_trucks/trailers) to whatever combo the driver has actually
// claimed right now (equipment_combos.claimed_by) -- "primary" is a
// separate, different concept (a fallback default, not "what they're in
// today") and reading it here would show stale/wrong equipment for a
// driver who slip-seated into something else.
//
// Equipment's expiring-permit list reads `equipment_permits` (joined to
// permit_types(name)) -- the dynamic system the Binder screen manages --
// not the old hardcoded trucks/trailers columns (reg_expiration_date etc.)
// this originally used. That first attempt assumed the old columns were
// the safer, more-current source (per this repo's own documented "the
// admin edit form still writes the old columns, equipment_permits can go
// stale" risk), but a live report ("dispatch shows Registration expired,
// the equipment modal shows it's fine") proved the opposite for this real
// company: a direct query found equipment_permits' Registration row for
// truck 25184 at 2027-07-31, a full year past the old column's untouched
// 2026-07-31 -- someone renewed it through the Binder, which only ever
// wrote to equipment_permits, so the old column silently never caught up.
// equipment_permits is also what useExpirations.ts (the header bell badge)
// already reads, so this now agrees with that too instead of disagreeing
// with two different "current" equipment views at once.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { startSetupSession } from "@/lib/setupSession";
import { useCalculatorShell } from "../CalculatorShellContext";
import DriverPicker from "../components/DriverPicker";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { addDaysISO_, daysUntilISO_, formatMDYWithCountdown_ } from "../utils/dates";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";

// This page deliberately does NOT use cardTheme.ts's shared cardStateFor --
// that function fades anything expired more than 7 days ago from "expired"
// (red) to a separate "inactive" state (gray), which doesn't match what was
// actually asked for here ("expired cards should show date in red" has no
// day-limit; only "expiring" was scoped to "the next 7 days"). Under the
// shared function, a permit 8+ days overdue would silently render gray
// instead of red -- worse, collectExpiringPermits() below would drop it
// from the Equipment list entirely, since its filter only ever looked for
// "expiring"/"expired", never "inactive". This 3-state version has no such
// cliff: anything in the past is "expired," full stop.
type ExpState = "not_set" | "valid" | "expiring" | "expired";
function expStateFor(iso: string | null | undefined): ExpState {
  if (!iso) return "not_set";
  const days = daysUntilISO_(iso);
  if (days === null) return "not_set";
  if (days < 0) return "expired";
  if (days <= 7) return "expiring";
  return "valid";
}
const DARK_EXP_COLOR: Record<ExpState, string> = {
  not_set: "rgba(255,255,255,0.35)",
  valid: "rgba(255,255,255,0.85)",
  expiring: "#f59e0b",
  expired: "#ef4444",
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat, matches the mockup's day-icon row

type DriverIdentity = {
  display_name: string;
  division: string | null;
  region: string | null;
  local_area: string | null;
  employee_number: string | null;
};

type TerminalCardRow = {
  terminal_id: string;
  terminal_name: string;
  city: string | null;
  state: string | null;
  expiresISO: string | null;
  hasCard: boolean;
};

type PermitItem = { label: string; iso: string };

type EquipmentSummary = {
  truckName: string | null;
  truckMake: string | null;
  trailerName: string | null;
  trailerMake: string | null;
  permitItems: PermitItem[]; // pre-filtered to expiring/expired only, soonest first
};

type BadgeRow = { id: string; port_name: string; category: string | null; expiration_date: string | null };

type CredentialSummary = { licenseExp: string | null; medicalExp: string | null; twicExp: string | null };

type EquipmentPermitRow = { expiration_date: string | null; permit_types: { name: string } | null };

// unitLabel ("Truck 25184" / "Trailer 3151") is baked directly into each
// item's label -- per explicit request, dispatch couldn't tell which unit
// a bare "Registration" line belonged to when a driver has both a truck
// and trailer with their own permit sets.
function collectExpiringPermits(unitLabel: string, rows: EquipmentPermitRow[]): PermitItem[] {
  const out: PermitItem[] = [];
  for (const r of rows) {
    const iso = r.expiration_date;
    if (!iso) continue;
    const state = expStateFor(iso);
    if (state === "expiring" || state === "expired") {
      out.push({ label: `${unitLabel} — ${r.permit_types?.name ?? "Permit"}`, iso });
    }
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function ExpirationLine({ label, iso }: { label: string; iso: string | null }) {
  const state = expStateFor(iso);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "#fff", fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 800, color: DARK_EXP_COLOR[state] }}>
        {iso ? formatMDYWithCountdown_(iso) : "Not on file"}
      </span>
    </div>
  );
}

export default function DispatchPage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const { selectedDriverId, setSelectedDriverId, companyId, effectiveUserId, authUserId } = shell;
  const canUseAppAs = shell.role === "admin" || shell.isSuperAdmin;

  // This page had NO access gate at all before this -- a driver/lead hitting
  // this URL directly wasn't blocked, only kept off it by the (now-removed)
  // tab bar simply not showing this tab to them. Now that this is admin/
  // dispatch's real Planner (see the role-restructure this shipped
  // alongside), a real gate is needed: driver/lead don't belong here at all,
  // symmetric with the new gate on Cards (app/planner/cards/layout.tsx)
  // blocking admin/dispatch the other direction. Gated on
  // isSuperAdminResolved for the same race-condition reason page.tsx's own
  // landing redirect is -- role resolves independently of isSuperAdmin, with
  // no ordering guarantee.
  useEffect(() => {
    if (shell.role == null) return;
    if (!shell.isSuperAdminResolved) return;
    if (shell.isSolo === null) return; // a solo admin is NOT a dispatcher -- wait for resolution, then bounce to /planner
    if (!canReachDestination("dispatch", shell.role, shell.isSuperAdmin, shell.isSolo)) {
      router.replace("/planner");
    }
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, router]);
  // Sourced from the shared cached catalog (lib/queries/useTerminalsCatalog.ts)
  // instead of this page's own .in("terminal_id", terminalIds) network
  // lookup below -- the full catalog is already cached, so this is a
  // client-side filter instead of a round trip.
  const { data: terminalsCatalog = [] } = useTerminalsCatalog();

  const [identity, setIdentity] = useState<DriverIdentity | null>(null);
  const [schedule, setSchedule] = useState<{ days: number[]; start: string; end: string }>({ days: [], start: "", end: "" });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [cards, setCards] = useState<TerminalCardRow[]>([]);
  const [cardSearch, setCardSearch] = useState("");
  const [equipment, setEquipment] = useState<EquipmentSummary>({ truckName: null, truckMake: null, trailerName: null, trailerMake: null, permitItems: [] });
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary>({ licenseExp: null, medicalExp: null, twicExp: null });
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDriverId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [
        { data: nameRows }, { data: schedRow }, { data: notesRow },
        { data: accessRows }, { data: cardRows },
        { data: claimedCombos },
        { data: badgeRows },
        { data: licRows }, { data: medRows }, { data: twicRows },
      ] = await Promise.all([
        supabase.rpc("get_display_names_full", { p_user_ids: [selectedDriverId] }),
        supabase.from("driver_schedules").select("days_of_week, shift_start_local, shift_end_local").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("dispatcher_notes").select("note").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("terminal_access").select("terminal_id, carded_on").eq("user_id", selectedDriverId),
        supabase.from("user_terminal_cards").select("terminal_id").eq("user_id", selectedDriverId),
        // Whatever combo the driver actually has claimed right now -- not
        // "primary" (a separate fallback-default concept, see file header).
        supabase.from("equipment_combos").select("truck_id, trailer_id, claimed_at").eq("claimed_by", selectedDriverId).neq("active", false).order("claimed_at", { ascending: false }).limit(1),
        supabase.from("driver_port_ids").select("id, port_name, category, expiration_date").eq("user_id", selectedDriverId).order("expiration_date", { ascending: true, nullsFirst: false }),
        supabase.from("driver_licenses").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("driver_medical_cards").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("driver_twic_cards").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
      ]);
      if (cancelled) return;

      const nameRow = (nameRows ?? [])[0] as any;
      setIdentity(nameRow ? {
        display_name: nameRow.display_name ?? "Unknown",
        division: nameRow.division ?? null,
        region: nameRow.region ?? null,
        local_area: nameRow.local_area ?? null,
        employee_number: nameRow.employee_number ?? null,
      } : null);

      setSchedule({
        days: (schedRow as any)?.days_of_week ?? [],
        start: (schedRow as any)?.shift_start_local?.slice(0, 5) ?? "",
        end: (schedRow as any)?.shift_end_local?.slice(0, 5) ?? "",
      });
      setNotes((notesRow as any)?.note ?? "");

      const cardIdSet = new Set(((cardRows ?? []) as any[]).map((r) => String(r.terminal_id)));
      const accessByTerminal = new Map<string, string>();
      for (const r of (accessRows ?? []) as any[]) accessByTerminal.set(String(r.terminal_id), r.carded_on);

      const terminalIds = Array.from(new Set([...accessByTerminal.keys(), ...cardIdSet]));
      const idSet = new Set(terminalIds);
      const termRows = terminalsCatalog.filter((t) => idSet.has(String(t.terminal_id)));
      const rows: TerminalCardRow[] = termRows.map((t) => {
        const tid = String(t.terminal_id);
        const cardedOn = accessByTerminal.get(tid) ?? null;
        const renewalDays = t.renewal_days ?? 90;
        return {
          terminal_id: tid,
          terminal_name: t.terminal_name ?? "",
          city: t.city, state: t.state,
          expiresISO: cardedOn ? addDaysISO_(cardedOn, renewalDays) : null,
          hasCard: cardIdSet.has(tid),
        };
      }).sort((a, b) => a.terminal_name.localeCompare(b.terminal_name));
      setCards(rows);

      const claimed = ((claimedCombos ?? [])[0] as any) ?? null;
      const truckId = claimed?.truck_id ?? null;
      const trailerId = claimed?.trailer_id ?? null;
      const [truckRes, trailerRes, truckPermitsRes, trailerPermitsRes] = await Promise.all([
        truckId ? supabase.from("trucks").select("truck_name, make").eq("truck_id", truckId).maybeSingle() : Promise.resolve({ data: null }),
        trailerId ? supabase.from("trailers").select("trailer_name, make").eq("trailer_id", trailerId).maybeSingle() : Promise.resolve({ data: null }),
        truckId
          ? supabase.from("equipment_permits").select("expiration_date, permit_types(name)").eq("truck_id", truckId)
          : Promise.resolve({ data: [] }),
        trailerId
          ? supabase.from("equipment_permits").select("expiration_date, permit_types(name)").eq("trailer_id", trailerId)
          : Promise.resolve({ data: [] }),
      ]);
      const truckRow = (truckRes as any)?.data ?? null;
      const trailerRow = (trailerRes as any)?.data ?? null;
      const permitItems = [
        ...collectExpiringPermits(truckRow?.truck_name ? `Truck ${truckRow.truck_name}` : "Truck", ((truckPermitsRes as any)?.data ?? []) as EquipmentPermitRow[]),
        ...collectExpiringPermits(trailerRow?.trailer_name ? `Trailer ${trailerRow.trailer_name}` : "Trailer", ((trailerPermitsRes as any)?.data ?? []) as EquipmentPermitRow[]),
      ].sort((a, b) => a.iso.localeCompare(b.iso));
      setEquipment({
        truckName: truckRow?.truck_name ?? null,
        truckMake: truckRow?.make ?? null,
        trailerName: trailerRow?.trailer_name ?? null,
        trailerMake: trailerRow?.make ?? null,
        permitItems,
      });

      setBadges((badgeRows ?? []) as BadgeRow[]);
      setCredentials({
        licenseExp: (licRows as any)?.expiration_date ?? null,
        medicalExp: (medRows as any)?.expiration_date ?? null,
        twicExp: (twicRows as any)?.expiration_date ?? null,
      });

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDriverId, terminalsCatalog]);

  async function saveSchedule(next: { days: number[]; start: string; end: string }) {
    setSchedule(next);
    setScheduleSaving(true);
    await supabase.from("driver_schedules").upsert({
      user_id: selectedDriverId,
      company_id: companyId,
      days_of_week: next.days,
      shift_start_local: next.start || null,
      shift_end_local: next.end || null,
      updated_by: effectiveUserId || null,
    }, { onConflict: "user_id" });
    setScheduleSaving(false);
  }

  function toggleDay(d: number) {
    const days = schedule.days.includes(d) ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort();
    saveSchedule({ ...schedule, days });
  }

  async function saveNotes() {
    setNotesSaving(true);
    await supabase.from("dispatcher_notes").upsert({
      user_id: selectedDriverId,
      company_id: companyId,
      note: notes,
      updated_by: effectiveUserId || null,
    }, { onConflict: "user_id" });
    setNotesSaving(false);
  }

  const filteredCards = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => `${c.terminal_name} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase().includes(q));
  }, [cards, cardSearch]);

  // Group by city -- "No City" bucket sorts last so real cities always lead.
  const cardsByCity = useMemo(() => {
    const groups = new Map<string, TerminalCardRow[]>();
    for (const c of filteredCards) {
      const city = c.city?.trim() || "No City";
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city)!.push(c);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "No City") return 1;
      if (b === "No City") return -1;
      return a.localeCompare(b);
    });
  }, [filteredCards]);

  if (!selectedDriverId) {
    return (
      <div style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Select a driver to view.</div>
        <DriverPicker companyId={companyId} onPick={(id) => setSelectedDriverId(id)} />
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setSelectedDriverId("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          ‹ Change Driver
        </button>
      </div>

      {/* "Back strip" -- admin/super-admin only (dispatchers never get in a
          truck). Starts a real full-app setup session (same mechanism as
          /admin's "Set up planner for X"), not just this tab's own
          contextual card/notes view -- lets the admin use the whole app
          (Planner, Terminal, everything) as this driver. returnTo points
          back here so "← Return to Dispatch" lands where they actually
          started, not /admin. */}
      {canUseAppAs && !loading && identity && (
        <button
          type="button"
          onClick={() => {
            startSetupSession({
              targetUserId: selectedDriverId,
              targetDisplayName: identity.display_name,
              adminUserId: authUserId,
              returnTo: "/planner/dispatch",
            });
            // Hard navigation, not router.push -- the admin is already
            // inside the /planner layout, so CalculatorShellProvider is
            // already mounted and only ever reads sessionStorage once on
            // mount. A client-side push wouldn't remount it, so the new
            // setup session would silently never take effect (confirmed
            // live: content stayed the admin's own equipment/terminal data
            // after a router.push here). Matches JoinFleetView.tsx's own
            // same-class fix for the identical problem.
            window.location.href = "/planner";
          }}
          style={{
            width: "100%", textAlign: "left" as const, padding: "12px 14px", borderRadius: 10, marginBottom: 14,
            border: "1px solid rgba(251,146,60,0.35)", background: "rgba(251,146,60,0.10)",
            color: "#fb923c", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}
        >
          Use app as {identity.display_name} →
        </button>
      )}

      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && identity && (
        <>
          <SectionCard title="Driver">
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{identity.display_name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              {identity.division ? `Store ${identity.division}` : "—"}
              {identity.local_area ? ` – ${identity.local_area}` : ""}
              {identity.region ? `, ${identity.region}` : ""}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
              {DAY_LABELS.map((label, i) => {
                const active = schedule.days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    disabled={scheduleSaving}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", fontSize: 11, fontWeight: 800, cursor: "pointer",
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: active ? "#fff" : "rgba(255,255,255,0.05)",
                      color: active ? "#111" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <input
                type="time" value={schedule.start}
                onChange={(e) => saveSchedule({ ...schedule, start: e.target.value })}
                style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 12 }}
              />
              <span style={{ color: "rgba(255,255,255,0.3)", alignSelf: "center" }}>–</span>
              <input
                type="time" value={schedule.end}
                onChange={(e) => saveSchedule({ ...schedule, end: e.target.value })}
                style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 12 }}
              />
            </div>
          </SectionCard>

          <SectionCard title="Equipment">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Truck{equipment.truckName ? ` · ${equipment.truckName}` : ""}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{equipment.truckMake ?? ""}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Trailer{equipment.trailerName ? ` · ${equipment.trailerName}` : ""}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{equipment.trailerMake ?? ""}</span>
            </div>
            {!equipment.truckName && !equipment.trailerName && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No equipment currently selected.</div>
            )}
            {(equipment.truckName || equipment.trailerName) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 6 }}>
                {equipment.permitItems.length === 0 ? (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Nothing expiring soon.</div>
                ) : (
                  equipment.permitItems.map((p) => <ExpirationLine key={p.label} label={p.label} iso={p.iso} />)
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Terminal Cards">
            <input
              type="text" value={cardSearch} onChange={(e) => setCardSearch(e.target.value)}
              placeholder="All Terminals — search…"
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, marginBottom: 10 }}
            />
            {cardsByCity.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No terminal cards on file.</div>}
            <div style={{ display: "grid", gap: 14 }}>
              {cardsByCity.map(([city, cityCards]) => (
                <div key={city}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>
                    {city}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {cityCards.map((c) => (
                      <ExpirationLine
                        key={c.terminal_id}
                        label={c.terminal_name}
                        iso={c.expiresISO}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Badges">
            {badges.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No badges on file.</div>}
            <div style={{ display: "grid", gap: 6 }}>
              {badges.map((b) => (
                <ExpirationLine
                  key={b.id}
                  label={b.category ? `${b.port_name} (${b.category})` : b.port_name}
                  iso={b.expiration_date}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Credentials">
            <div style={{ display: "grid", gap: 6 }}>
              <ExpirationLine label="License" iso={credentials.licenseExp} />
              <ExpirationLine label="Medical" iso={credentials.medicalExp} />
              <ExpirationLine label="TWIC" iso={credentials.twicExp} />
            </div>
          </SectionCard>

          <SectionCard title="Notes">
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
              placeholder="Internal notes for dispatch/lead/admin — not visible to the driver…"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, resize: "vertical" as const }}
            />
            {notesSaving && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Saving…</div>}
          </SectionCard>
        </>
      )}
    </div>
  );
}
