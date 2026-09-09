"use client";
// CalculatorShellContext.tsx
//
// Redesign shell (equipment-settings-spec.md ~= "ProTankr mobile app design"
// handoff, Phase 1): the new header (hamburger/bell/gear + alerts cluster)
// and the Planner/Cards/Vault tab bar live in a shared layout
// (`app/planner/layout.tsx`) above all three tab routes, but the
// gear icon opens the SAME Equipment sheet the Planner tab's own info card
// opens, and the bell icon needs the SAME expirations data Planner already
// computes -- both need one shared instance of `useEquipment`/`useLocation`/
// `useTerminals`/`useExpirations`, not a second independent copy.
//
// Why this matters: useEquipment's selectedComboId is plain
// mount-time-hydrated localStorage state with no cross-instance sync (no
// storage-event listener, no realtime subscription) -- two separate calls
// to useEquipment() in the same page view (one in the layout, one in
// page.tsx) would NOT reflect each other's changes without a reload. This
// context hoists exactly the hooks the header needs to one instance,
// shared via context; everything else (compartments, plan math, presets,
// load workflow, temp prediction) stays local to page.tsx as before.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getSetupSession } from "@/lib/setupSession";
import type { SetupSession } from "@/lib/setupSession";
import { useEquipment } from "./hooks/useEquipment";
import { useLocation } from "./hooks/useLocation";
import { useTerminals } from "./hooks/useTerminals";
import { useExpirations } from "./hooks/useExpirations";
import { useTerminalFilters } from "./hooks/useTerminalFilters";
import { useDemoWatchdog } from "./hooks/useDemoWatchdog";
import { useTheme } from "./hooks/useTheme";
import { addDaysISO_ } from "./utils/dates";
import { normCity, normState } from "./utils/normalize";
import type { TerminalRow, TerminalCatalogRow } from "./types";
import { isRole, type Role } from "@/lib/ui/driver/role";

export type CardData = { cardNumber: string; privateNote: string; pin: string };

type ShellValue = {
  authEmail: string;
  authUserId: string;
  setupSession: SetupSession | null;
  effectiveUserId: string;
  equipment: ReturnType<typeof useEquipment>;
  location: ReturnType<typeof useLocation>;
  terminals: ReturnType<typeof useTerminals>;
  expirations: ReturnType<typeof useExpirations>;
  myTerminalIdSet: Set<string>;
  terminalFilters: ReturnType<typeof useTerminalFilters<TerminalRow, TerminalCatalogRow>>;
  equipOpen: boolean;
  setEquipOpen: (v: boolean) => void;
  expModalOpen: boolean;
  setExpModalOpen: (v: boolean) => void;
  termOpen: boolean;
  setTermOpen: (v: boolean) => void;
  // Location picker (state -> city) -- termOpen (above) already covers "pick
  // a terminal within the current city"; this is the step before it. Shared
  // (not local to page.tsx) so any tab can open the SAME LocationModal/
  // MyTerminalsModal instances (mounted once in ShellChrome, see that file)
  // and have the change reflect everywhere else that reads shell.location --
  // e.g. the Terminal tab's clickable terminal/city header.
  locOpen: boolean;
  setLocOpen: (v: boolean) => void;
  statePickerOpen: boolean;
  setStatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  expandedTerminalId: string | null;
  setExpandedTerminalId: (id: string | null) => void;
  isCityStarred: (state: string, city: string) => boolean;
  toggleCityStar: (state: string, city: string) => void;
  stateOptions: { code: string; name?: string | null }[];
  selectedStateLabel: string;
  selectedStateName: string;
  cities: string[];
  topCities: string[];
  allCities: string[];
  cardDataByTerminalId: Record<string, CardData>;
  setCardDataForTerminal_: (terminalId: string, data: CardData) => Promise<void>;
  theme: ReturnType<typeof useTheme>;
  // Role of effectiveUserId in their active company -- null until resolved.
  // Drives NavMenu's destination links (lib/ui/driver/navDestinations.ts)
  // and the landing-redirect effect in page.tsx (admin/dispatch -> their
  // Dispatch-page Planner; driver/lead -> this page).
  role: Role | null;
  companyId: string | null;
  // is_solo of the active company -- null until resolved. A solo company's
  // member is role 'admin' but navigates like a driver (Planner/Cards/Vault,
  // never the fleet Dispatch page); the landing redirect and the Cards/
  // Dispatch route gates all read this so a real solo driver isn't bounced
  // off the driver Planner. See lib/ui/driver/navDestinations.ts.
  isSolo: boolean | null;
  // Super admins (is_super_admin() RPC, same one NavMenu.tsx already uses)
  // get BOTH Planner and Dispatch reachable, regardless of their own company
  // role -- lets one account verify both without reassigning roles.
  isSuperAdmin: boolean;
  // True once the is_super_admin() RPC has settled, regardless of result --
  // distinct from isSuperAdmin itself (which starts false and could mean
  // "confirmed not a super admin" OR "still loading"). page.tsx's
  // landing-redirect effect needs this: role and isSuperAdmin resolve via
  // two fully independent effects with no ordering guarantee, so a real
  // super admin whose own company role happens to be "admin" could
  // otherwise get redirected to /planner/dispatch before their super-admin
  // flag has had a chance to resolve true -- a real race, not hypothetical
  // (confirmed by reading both effects' own dependency arrays directly).
  isSuperAdminResolved: boolean;
  // Which driver a dispatch/admin user currently has selected -- shared so
  // the Dispatch tab, the contextual Cards tab, and the Terminal tab's
  // auto-open-to-their-terminal behavior all agree on the same driver
  // without re-picking on every tab switch. Meaningless (and unused) for
  // driver/lead roles.
  selectedDriverId: string;
  setSelectedDriverId: (id: string) => void;
  // See the state declaration's own comment below for why this lives here.
  plannedProductIds: Set<string>;
  setPlannedProductIds: (ids: Set<string>) => void;
  // Rack-aware loading (see CLAUDE.md "rack-aware loading" discussion): the
  // ONE place that should ever change location.selectedTerminalId in the
  // driver-facing app -- resolves how many racks the terminal has and
  // either sets location.selectedRackId directly (0 or 1 rack, nothing to
  // ask) or opens rackPickerOpen for a multi-rack terminal. Every terminal-
  // selection call site (MyTerminalsModal, the Cards tab's "Select" button)
  // should call this instead of location.setSelectedTerminalId directly, so
  // a rack pick is never skipped just because a second entry point forgot to
  // ask.
  chooseTerminal: (terminalId: string) => void;
  rackPickerOpen: boolean;
  rackPickerRacks: { rack_id: string; rack_name: string }[];
  resolveRackPick: (rackId: string) => void;
  // See its own declaration's comment -- true while chooseTerminal's async
  // rack-count lookup is in flight, before rackPickerOpen has had a chance
  // to become the "still resolving" signal itself (multi-rack case) or the
  // rack is auto-set (0/1-rack case).
  rackResolving: boolean;
};

const ShellContext = createContext<ShellValue | null>(null);

export function useCalculatorShell(): ShellValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useCalculatorShell must be used within CalculatorShellProvider");
  return ctx;
}

export function CalculatorShellProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authEmail, setAuthEmail] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [setupSession, setSetupSession] = useState<SetupSession | null>(null);
  const effectiveUserId = setupSession?.targetUserId ?? authUserId ?? "";

  // Per the website rework spec: /planner redirects unauthenticated
  // visitors to /login. Client-side, not a server-side gate in layout.tsx
  // -- see that file's own comment for why (this app's browser Supabase
  // client persists sessions to localStorage only, which a server
  // component can't read via cookies).
  //
  // Uses getSession(), not getUser(). getUser() round-trips to the auth
  // server to revalidate the current access token -- if the app was
  // backgrounded long enough for that token to expire (JS timers freeze
  // in the background on mobile, so the SDK's own auto-refresh doesn't
  // fire until resume), getUser() sends the stale token, gets a 401 back,
  // and this code was reading that as "signed out" and bouncing to
  // /login -- even though a perfectly valid refresh token was sitting in
  // localStorage the whole time (this is exactly the "opens to login
  // every time" bug reported live). getSession() just reads (and lets the
  // SDK transparently refresh) the local session, no server round trip,
  // so it can't lose that race. This check is a UX routing gate only, not
  // a security boundary -- RLS is what actually protects data -- so
  // there's no reason to pay getUser()'s extra round trip here.
  useEffect(() => {
    let cancelled = false;
    const applySession = (session: { user: { id: string; email?: string | null } } | null) => {
      if (cancelled) return;
      setAuthEmail(session?.user.email ?? "");
      setAuthUserId(session?.user.id ?? "");
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      applySession(data.session);
      if (!data.session) router.replace("/login");
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(session);
      if (event === "SIGNED_OUT") router.replace("/login");
    });

    const session = getSetupSession();
    if (session) setSetupSession(session);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useDemoWatchdog(authUserId);

  const theme = useTheme(authUserId);

  const equipment = useEquipment(authUserId, setupSession);
  const location = useLocation(effectiveUserId);
  const terminals = useTerminals(
    effectiveUserId,
    location.selectedTerminalId,
    location.setSelectedTerminalId,
    null,
    setupSession
  );

  const expirations = useExpirations({
    truckId: equipment.selectedCombo?.truck_id ?? null,
    trailerId: equipment.selectedCombo?.trailer_id ?? null,
    truckName: equipment.truckNameById[equipment.selectedCombo?.truck_id ?? ""] ?? "",
    trailerName: equipment.trailerNameById[equipment.selectedCombo?.trailer_id ?? ""] ?? "",
    accessDateByTerminalId: terminals.accessDateByTerminalId,
    terminals: terminals.terminals,
    terminalCatalog: terminals.terminalCatalog,
    addDaysISO_,
    userId: effectiveUserId || null,
  });

  const myTerminalIdSet = useMemo(
    () => new Set((terminals.terminals ?? []).map((x: any) => String(x.terminal_id))),
    [terminals.terminals]
  );

  const terminalFilters = useTerminalFilters({
    terminals: terminals.terminals,
    terminalCatalog: terminals.terminalCatalog,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    myTerminalIdSet,
  });

  const [equipOpen, setEquipOpen] = useState(false);
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);

  // ── City starring (favorites shown at the top of LocationModal's city
  // list) -- moved here from page.tsx so the Terminal tab's own header can
  // open the SAME picker without a second, independently-drifting copy of
  // this logic (see this file's own header comment on why hoisting hooks
  // one level, not duplicating them, is the rule here).
  const CITY_STARS_KEY_PREFIX = "protankr_city_stars_v1::";
  const [starredCitySet, setStarredCitySet] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setStarredCitySet(new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []));
    } catch { setStarredCitySet(new Set()); }
  }, [authUserId]);

  // Stabilized via useCallback (previously plain functions, a new
  // reference every render) -- see hooks/useEquipment.ts's identical
  // comment for why this matters once value below is memoized.
  const cityKey = useCallback((state: string, city: string) => `${normState(state)}||${normCity(city)}`, []);
  const isCityStarred = useCallback((state: string, city: string) => starredCitySet.has(cityKey(state, city)), [starredCitySet, cityKey]);
  const toggleCityStar = useCallback((state: string, city: string) => {
    const key = cityKey(state, city);
    setStarredCitySet((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try { localStorage.setItem(`${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, [cityKey, authUserId]);

  const stateOptions = useMemo(() => {
    if (location.statesCatalog.length > 0) {
      return location.statesCatalog.map((r) => ({ code: normState(r.state_code), name: String(r.state_name || "").trim() })).filter((r) => r.code);
    }
    const codes = Array.from(new Set(terminals.terminalCatalog.map((t: any) => normState(t.state ?? "")))).filter(Boolean);
    return codes.map((code) => ({ code, name: code }));
  }, [location.statesCatalog, terminals.terminalCatalog]);

  const stateNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    stateOptions.forEach((s) => m.set(s.code, s.name || s.code));
    return m;
  }, [stateOptions]);

  const selectedStateLabel = useMemo(() => {
    if (!location.selectedState) return "";
    const code = normState(location.selectedState);
    return `${code} — ${stateNameByCode.get(code) || code}`;
  }, [location.selectedState, stateNameByCode]);

  const selectedStateName = useMemo(() => {
    if (!location.selectedState) return "";
    const code = normState(location.selectedState);
    return stateNameByCode.get(code) || code;
  }, [location.selectedState, stateNameByCode]);

  const cities = useMemo(() => {
    const st = normState(location.selectedState);
    return Array.from(new Set(
      location.citiesCatalog.filter((c) => normState(c.state_code ?? "") === st && c.active !== false)
        .map((c) => normCity(c.city_name ?? ""))
    )).filter(Boolean).sort();
  }, [location.citiesCatalog, location.selectedState]);

  const topCities = useMemo(() => {
    if (!location.selectedState || cities.length === 0) return [];
    const st = normState(location.selectedState);
    return cities.filter((c) => starredCitySet.has(cityKey(st, c))).sort();
  }, [location.selectedState, cities, starredCitySet]);

  const allCities = useMemo(() => {
    if (!location.selectedState) return cities;
    const st = normState(location.selectedState);
    return cities.filter((c) => !starredCitySet.has(cityKey(st, c)));
  }, [location.selectedState, cities, starredCitySet]);

  // ── Role (drives the Lead/Dispatch/Admin tab shown left of Planner) ──────
  // Same query shape as NavMenu.tsx's own role fetch, but scoped to
  // effectiveUserId (not authUserId) so admin impersonation ("Set up
  // planner for driver X") reflects the impersonated user's role, matching
  // every other piece of shared shell state.
  const [role, setRole] = useState<Role | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    (async () => {
      const [{ data: mRows }, { data: sRow }] = await Promise.all([
        supabase.from("user_companies").select("company_id, role").eq("user_id", effectiveUserId),
        supabase.from("user_settings").select("active_company_id").eq("user_id", effectiveUserId).maybeSingle(),
      ]);
      if (cancelled) return;
      const ms = (mRows ?? []) as { company_id: string; role: string }[];
      const activeId = (sRow?.active_company_id as string | null) ?? ms[0]?.company_id ?? null;
      const rawRole = ms.find((m) => m.company_id === activeId)?.role ?? null;
      setCompanyId(activeId);
      setRole(isRole(rawRole) ? rawRole : null);
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId]);

  // is_solo of the active company (null until resolved) -- see the ShellValue
  // field comment. Keyed on companyId so it re-resolves on a company switch.
  const [isSolo, setIsSolo] = useState<boolean | null>(null);
  useEffect(() => {
    if (!companyId) { setIsSolo(null); return; }
    let cancelled = false;
    supabase.from("companies").select("is_solo").eq("company_id", companyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsSolo(Boolean((data as any)?.is_solo)); });
    return () => { cancelled = true; };
  }, [companyId]);

  // Super-admin status is about the REAL signed-in account, not whoever
  // they're impersonating -- keyed on authUserId, not effectiveUserId.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // Flips true once the RPC settles, regardless of result -- see this
  // field's own comment on the ShellValue type above for the race it exists
  // to close.
  const [isSuperAdminResolved, setIsSuperAdminResolved] = useState(false);
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("is_super_admin");
      if (cancelled) return;
      setIsSuperAdmin(Boolean(data));
      setIsSuperAdminResolved(true);
    })();
    return () => { cancelled = true; };
  }, [authUserId]);

  // ── Card data (card number + PIN + private note, per terminal, per user) ──
  // Shared here (not local to the Planner page) because the new Cards tab
  // route needs the same data -- two independent fetches would risk the same
  // desync class of bug the equipment/location/terminals hooks were already
  // hoisted here to avoid.
  const [cardDataByTerminalId, setCardDataByTerminalId] = useState<Record<string, CardData>>({});

  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      if (setupSession) {
        const { getCardData } = await import("@/lib/adminSetupClient");
        const r = await getCardData(effectiveUserId);
        setCardDataByTerminalId(r.cardDataByTerminalId);
      } else {
        const { data } = await supabase
          .from("user_terminal_cards")
          .select("terminal_id, card_number, private_note, pin")
          .eq("user_id", effectiveUserId);
        if (data) {
          const map: Record<string, CardData> = {};
          for (const row of data as any[]) {
            map[String(row.terminal_id)] = {
              cardNumber: row.card_number ?? "",
              privateNote: row.private_note ?? "",
              pin: row.pin ?? "",
            };
          }
          setCardDataByTerminalId(map);
        }
      }
    })();
  }, [effectiveUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stabilized via useCallback -- see cityKey/isCityStarred/toggleCityStar's
  // identical comment above.
  const setCardDataForTerminal_ = useCallback(async (terminalId: string, data: CardData) => {
    setCardDataByTerminalId(prev => ({ ...prev, [terminalId]: data }));
    if (!effectiveUserId) return;
    if (setupSession) {
      const { setCardData } = await import("@/lib/adminSetupClient");
      await setCardData(effectiveUserId, terminalId, data.cardNumber, data.privateNote, data.pin);
    } else {
      await supabase.from("user_terminal_cards").upsert(
        {
          user_id: effectiveUserId,
          terminal_id: terminalId,
          card_number: data.cardNumber,
          private_note: data.privateNote,
          pin: data.pin || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,terminal_id" }
      );
    }
  }, [effectiveUserId, setupSession]);

  const [selectedDriverId, setSelectedDriverId] = useState("");

  // Which products the driver's current live plan actually calls for --
  // shared here (not local to page.tsx) so the header's outage banner
  // (mounted above every tab, not just Planner) can filter to only
  // relevant reports regardless of which tab is currently active. Driven
  // by page.tsx's own compPlan via an effect (see that file) -- page.tsx
  // itself unmounts when navigating to a sibling tab, so this value is a
  // last-known snapshot while elsewhere, not a live subscription; that's
  // the correct behavior here (the driver is still going to load that
  // plan when they return to Planner). Starts empty until Planner has
  // been visited at least once this session.
  const [plannedProductIds, setPlannedProductIds] = useState<Set<string>>(new Set());

  // ── Rack-aware loading ────────────────────────────────────────────────────
  // See CLAUDE.md "rack-aware loading, unified": every terminal now has at
  // least one rack (auto-named "Main Rack" if it never touched the Terminal
  // tab), and a rack owns both its product list and its reference reading --
  // this resolves (or asks for, when a terminal genuinely has more than one)
  // which rack, in one place shared by every terminal-selection entry point.
  const [rackPickerOpen, setRackPickerOpen] = useState(false);
  const [rackPickerRacks, setRackPickerRacks] = useState<{ rack_id: string; rack_name: string }[]>([]);
  const rackPickerTerminalIdRef = useRef("");
  // Guards against a stale async rack-count lookup resolving after a second,
  // newer terminal pick already superseded it (see this ref's use below).
  const latestTerminalRequestRef = useRef("");
  // True from the moment chooseTerminal starts its async rack-count lookup
  // until either branch resolves (0/1-rack: rack auto-set; >1-rack:
  // rackPickerOpen flips true, which itself signals "still resolving" from
  // then on). Exists so a caller watching "is any terminal-pick machinery
  // still in flight" (page.tsx's mid-load terminal-switch confirm, see
  // CLAUDE.md 2026-09-05) has a real signal to wait for -- without this,
  // there's a genuine gap between chooseTerminal being called (which sets
  // selectedTerminalId synchronously) and rackPickerOpen actually flipping
  // true (an awaited network round trip later) where naively checking
  // "termOpen/locOpen/rackPickerOpen all false" reads as fully settled even
  // though a rack picker is about to open a moment later -- confirmed live,
  // this was a real bug (the terminal-switch confirm sheet and the rack
  // picker briefly showed at the same time) before this flag was added.
  const [rackResolving, setRackResolving] = useState(false);

  const chooseTerminal = useCallback((terminalId: string) => {
    latestTerminalRequestRef.current = terminalId;
    location.setSelectedTerminalId(terminalId);
    if (!terminalId) {
      location.setSelectedRackId("");
      return;
    }
    setRackResolving(true);
    (async () => {
      const { data } = await supabase
        .from("terminal_racks")
        .select("rack_id, rack_name")
        .eq("terminal_id", terminalId)
        .order("rack_name", { ascending: true });
      if (latestTerminalRequestRef.current !== terminalId) return; // superseded
      const racks = (data ?? []) as { rack_id: string; rack_name: string }[];
      if (racks.length <= 1) {
        location.setSelectedRackId(racks[0]?.rack_id ?? "");
        setRackResolving(false);
        return;
      }
      rackPickerTerminalIdRef.current = terminalId;
      setRackPickerRacks(racks);
      setRackPickerOpen(true);
      setRackResolving(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.setSelectedTerminalId, location.setSelectedRackId]);

  const resolveRackPick = useCallback((rackId: string) => {
    // If the terminal changed again while this sheet was open (shouldn't
    // happen -- the sheet is modal -- but cheap to guard), don't apply a
    // pick meant for a terminal that's no longer selected.
    if (rackPickerTerminalIdRef.current === location.selectedTerminalId) {
      location.setSelectedRackId(rackId);
    }
    setRackPickerOpen(false);
    setRackPickerRacks([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.setSelectedRackId, location.selectedTerminalId]);

  // Memoized -- this was previously a fresh object literal every render,
  // meaning ANY state change anywhere in this provider (including things
  // unrelated to what a given consumer actually reads) re-rendered the
  // entire shell tree: Header, TabBar, and whichever tab's page.tsx is
  // currently mounted. Safe to memoize now that every field above is
  // itself stable (raw useState values/setters, or useCallback/useMemo) --
  // see hooks/useEquipment.ts's identical comment. Part of the 2026-08-31
  // performance pass (see CLAUDE.md "Performance pass #2").
  const value: ShellValue = useMemo(() => ({
    authEmail, authUserId, setupSession, effectiveUserId,
    equipment, location, terminals, expirations,
    myTerminalIdSet, terminalFilters,
    equipOpen, setEquipOpen, expModalOpen, setExpModalOpen,
    termOpen, setTermOpen,
    locOpen, setLocOpen, statePickerOpen, setStatePickerOpen,
    expandedTerminalId, setExpandedTerminalId,
    isCityStarred, toggleCityStar,
    stateOptions, selectedStateLabel, selectedStateName, cities, topCities, allCities,
    cardDataByTerminalId, setCardDataForTerminal_,
    theme,
    role, companyId, isSolo, isSuperAdmin, isSuperAdminResolved,
    selectedDriverId, setSelectedDriverId,
    plannedProductIds, setPlannedProductIds,
    chooseTerminal, rackPickerOpen, rackPickerRacks, resolveRackPick, rackResolving,
  }), [
    authEmail, authUserId, setupSession, effectiveUserId,
    equipment, location, terminals, expirations,
    myTerminalIdSet, terminalFilters,
    equipOpen, setEquipOpen, expModalOpen, setExpModalOpen,
    termOpen, setTermOpen,
    locOpen, setLocOpen, statePickerOpen, setStatePickerOpen,
    expandedTerminalId, setExpandedTerminalId,
    isCityStarred, toggleCityStar,
    stateOptions, selectedStateLabel, selectedStateName, cities, topCities, allCities,
    cardDataByTerminalId, setCardDataForTerminal_,
    theme,
    role, companyId, isSolo, isSuperAdmin, isSuperAdminResolved,
    selectedDriverId, setSelectedDriverId,
    plannedProductIds, setPlannedProductIds,
    chooseTerminal, rackPickerOpen, rackPickerRacks, resolveRackPick, rackResolving,
  ]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
