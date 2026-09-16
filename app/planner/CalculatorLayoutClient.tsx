"use client";
// app/planner/CalculatorLayoutClient.tsx
//
// Redesign shell: full-bleed gradient header (hamburger/bell/gear + alerts
// cluster), shared across every /planner/* route via this one layout client
// component rather than in-page chrome -- gets back/forward navigation for
// free and matches this app's existing multi-route convention.
//
// The visible tab bar (Dispatch/Insights/Planner/Cards/Vault) that used to
// render below/inline with this header is gone entirely -- every
// destination it held now lives in NavMenu's own dropdown instead, per
// explicit direction ("do away with the tabs and put the pages in the nav
// hamburger with reports etc."). See lib/ui/NavMenu.tsx and
// lib/ui/driver/navDestinations.ts for where that logic moved.
//
// Split out from layout.tsx (which is now a server component exporting its
// own `viewport.themeColor`) because Next's Metadata API requires viewport/
// metadata exports to live in a server component -- this client component
// holds all the actual interactive shell logic.

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NavMenu from "@/lib/ui/NavMenu";
import EquipmentModal from "./modals/EquipmentModal";
import ExpirationModal from "./modals/ExpirationModal";
import SettingsModal from "./modals/SettingsModal";
import LocationModal from "./modals/LocationModal";
import MyTerminalsModal from "./modals/MyTerminalsModal";
import RackSelectSheet from "./components/RackSelectSheet";
import TerminalOutageBanner from "./components/TerminalOutageBanner";
import { useActiveOutageBanner } from "./hooks/useTerminalOutageReports";
import { useIsLandscape } from "./hooks/useOrientation";
import { CalculatorShellProvider, useCalculatorShell } from "./CalculatorShellContext";
import { addDaysISO_, isPastISO_, formatMDYWithCountdown_ } from "./utils/dates";
import { normState } from "./utils/normalize";
import { themeIconStroke } from "./theme";

function BellIcon({ count, onClick, stroke }: { count: number; onClick: () => void; stroke: string }) {
  return (
    <button type="button" onClick={onClick} aria-label="Alerts" style={{ position: "relative", border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      {count > 0 && (
        <span style={{ position: "absolute", top: -4, right: -8, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 8, background: "#ef4444", font: "500 9px Outfit", lineHeight: "15px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {count}
        </span>
      )}
    </button>
  );
}

// outageBanner is now a prop, not fetched inside Header itself -- landscape
// mode needs the SAME data rendered in a different spot (ShellChrome, above
// the content column, since the vertical rail has no room for a horizontal
// ticker) that Header can't reach from inside its own returned tree, so
// useActiveOutageBanner moved up to ShellChrome (called once there) and
// both Header (portrait) and ShellChrome (landscape) consume the one result.
function Header({ onOpenSettings, isLandscape, outageBanner }: {
  onOpenSettings: () => void;
  isLandscape: boolean;
  outageBanner: ReturnType<typeof useActiveOutageBanner>;
}) {
  const shell = useCalculatorShell();
  const { darkMode } = shell.theme;
  const iconStroke = themeIconStroke(darkMode);
  const pathname = usePathname();

  // The OS status bar / PWA chrome strip above this header is drawn by the
  // browser from <meta name="theme-color">, not from any CSS on the page --
  // layout.tsx's static `viewport.themeColor` only sets its initial value,
  // so it has to be kept in sync here whenever Dark Mode/accent change.
  //
  // 2026-08-06: this used to reset the tag to "#ffffff" in a cleanup
  // function, which React fires before *every* re-run of this effect (i.e.
  // on every darkMode/accentColor change), not just on Header's true
  // unmount -- a real, needless "flash white, then set the real color"
  // write pattern that lines up with the reported "dark mode flashes back
  // to white then corrects" glitch. That pass's reasoning was: Next's own
  // per-route metadata already re-applies whatever static
  // `viewport.themeColor` a *different* layout declares once the user
  // actually navigates away from /planner entirely, so this effect only
  // needs to keep the tag in sync while Header is mounted, never reset it.
  //
  // 2026-08-19: that reasoning missed a case -- Next re-applies the
  // CURRENT route segment's own static metadata on every client-side
  // navigation, including navigation between two routes that share this
  // SAME layout (e.g. /planner -> /planner/reports). Since Header never
  // unmounts for that transition, its effect doesn't re-run on its own
  // (darkMode/accentColor didn't change) -- so Next's re-applied static
  // white default sat there uncorrected. `pathname` in the dependency
  // array makes this effect re-assert the real color on every route
  // change too, not just every theme change.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    // Flat black, matching the header's own background exactly (see below)
    // -- not themeFill/accentColor-driven anymore, per explicit direction
    // ("turn the background black so it looks like there's no header").
    if (meta) meta.setAttribute("content", "#0b0b0b");
  }, [pathname]);

  // Landscape: the whole header collapses into a vertical rail pinned to
  // the far left of the screen -- hamburger/bell/plan-letter/EQ/pin/temp
  // stack top-to-bottom instead of left-to-right, per explicit direction
  // ("move the icon strip into a vertical column and put it all the way
  // left"). This is the deferred "Phase 2" from the original icon-rail
  // pass ("the whole strip... eventually becoming a left-edge rail in
  // landscape... expect to move that around until we get it right") --
  // finally built once a real mockup existed to match. Every child here
  // (NavMenu, BellIcon, the portal slot) is the exact same element as the
  // portrait row; only this wrapping div's own flexDirection/padding
  // changed, plus justify-content:space-between now spaces them evenly
  // down the column the same way it did across the row -- the portaled
  // plan-letter/EQ/pin/temp cluster (page.tsx's headerIconsEl) needed no
  // changes at all, since none of its own buttons hardcode a row-only
  // layout; they just follow whichever direction this parent flex
  // container is in. No outage banner in this rail -- narrow and tall, no
  // room for a horizontal ticker; ShellChrome renders it separately,
  // above the content column, when isLandscape (see that component).
  // Settings (formerly its own gear icon here) now lives inside NavMenu's
  // own dropdown -- see NavMenu.tsx's onOpenSettings prop -- one fewer
  // icon in the rail, per explicit direction to reduce the icon count.
  if (isLandscape) {
    return (
      <div style={{
        width: 84, flexShrink: 0, background: "#0b0b0b",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        height: "100%",
      }}>
        <NavMenu darkMode={darkMode} onOpenSettings={onOpenSettings} />
        <BellIcon count={shell.expirations.expiredCount + shell.expirations.warningCount} onClick={() => shell.setExpModalOpen(true)} stroke={iconStroke} />
        <div id="planner-header-icons-slot" style={{ display: "contents" }} />
      </div>
    );
  }

  return (
    <div style={{
      // iOS's translucent status bar (see layout.tsx) shows whatever this
      // div paints underneath it -- extending the padding (and therefore
      // this background) up through the safe area is what actually makes
      // the status bar match the rest of the app instead of leaving a
      // seam; the icon row below is unaffected since it's a separate nested
      // div with its own fixed padding. Flat black (matching ShellChrome's
      // own content-area background below, #0b0b0b) instead of the old
      // themed gradient -- per explicit direction, the header should read
      // as an extension of the page, not a visibly separate band.
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
      background: "#0b0b0b", flexShrink: 0, position: "relative", overflow: "visible",
    }}>
      {/* Left/right safe-area padding, added alongside the existing top
          one -- per explicit follow-up with a real device screenshot
          showing black bars down both edges in landscape (a soft-nav-bar
          strip on one side, confirmed live). Without viewportFit:"cover"
          (layout.tsx) these env() calls are always 0 and this is a no-op;
          with it, the background still paints the full physical width
          (padding never shrinks an element's own background), only the
          icon row's actual CONTENT gets pushed in from the unsafe edges.

          All six icons (hamburger, bell, and whatever the Planner page's
          own portal slot below contributes) are direct children of this
          ONE flex row with justify-content:space-between, per explicit
          direction ("evenly space all the icons in the header") --
          previously NavMenu sat alone on the left against a separately-
          grouped bell/slot/gear cluster on the right, which only evenly
          spaced within that right cluster, not across the whole row.
          Settings (formerly its own gear icon at the far right here) now
          lives inside NavMenu's own dropdown instead -- see NavMenu.tsx's
          onOpenSettings prop -- one fewer icon in this row, per explicit
          direction to reduce the strip's icon count. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 calc(env(safe-area-inset-right, 0px) + 16px) 0 calc(env(safe-area-inset-left, 0px) + 16px)",
      }}>
        <NavMenu darkMode={darkMode} onOpenSettings={onOpenSettings} />
        <BellIcon count={shell.expirations.expiredCount + shell.expirations.warningCount} onClick={() => shell.setExpModalOpen(true)} stroke={iconStroke} />
        {/* Portal target for the Planner page's own plan-letter/Equipment/
            Location/Temperature cluster -- per explicit direction to try
            it merged into this shared header row for a few days ("I think
            I'll like it best at the top but want to play with it"). Empty
            on every other /planner/* route (only page.tsx ever portals
            content in here), so it costs nothing when not on Planner.
            Deliberately a portal target rather than lifting that state
            into CalculatorShellContext -- these four controls' underlying
            state (activeSlotLetter, tempF, presetQuickPickOpen, etc.) is
            genuinely Planner-page-local, and a portal makes this trivial
            to revert (delete the portal call, nothing to unwind here) if
            the header placement doesn't stick. display:"contents" makes
            this div invisible to layout -- its portaled children become
            direct flex items of the row above, so justify-content:
            space-between spaces all six icons evenly instead of grouping
            the four portaled ones into their own sub-cluster with a
            smaller, separately-set gap between them. */}
        <div id="planner-header-icons-slot" style={{ display: "contents" }} />
      </div>
      {/* Outage banner still renders right after the icon row either way
          -- when there's nothing to show it contributes zero height
          (see TerminalOutageBanner's own conditional return), so the
          header stays maximally thin; when there IS an active outage,
          this is what makes the header expand downward to show it, per
          explicit direction ("expand down when there's a terminal
          outage banner otherwise keep collapsed"). The tab bar that used
          to render below this (its own row in portrait, inline with the
          icon row in landscape) is gone entirely -- every destination it
          used to hold (Dispatch/Insights/Planner/Cards/Vault) now lives
          in NavMenu's own dropdown instead, per explicit direction ("do
          away with the tabs and put the pages in the nav hamburger with
          reports etc."). This also retires the just-fixed centerTab
          offsetLeft bug and the inline/compact variants along with it --
          no other caller, nothing left to keep working. */}
      <TerminalOutageBanner
        tickerMessage={outageBanner.tickerMessage}
        reports={outageBanner.reports}
        timeZone={outageBanner.timeZone}
        refresh={outageBanner.refresh}
      />
    </div>
  );
}

function ShellChrome({ children }: { children: React.ReactNode }) {
  const shell = useCalculatorShell();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Default (unresolved SSR/first-paint) is false -- same neutral-first
  // pattern this codebase already established for useIsLandscape's own
  // consumers elsewhere (page.tsx, PlannerControls.tsx), so the initial
  // render never mismatches between server and client.
  const isLandscape = useIsLandscape();
  const terminalId = shell.location.selectedTerminalId ? String(shell.location.selectedTerminalId) : null;
  const outageBanner = useActiveOutageBanner(terminalId, shell.effectiveUserId || null, shell.plannedProductIds);
  return (
    <div style={{ height: "100dvh", background: "#0b0b0b", color: "#fff", display: "flex", flexDirection: isLandscape ? "row" : "column", overflow: "hidden" }}>
      <Header onOpenSettings={() => setSettingsOpen(true)} isLandscape={isLandscape} outageBanner={outageBanner} />
      {/* The content wrapper is rendered with an IDENTICAL structure in both
          orientations so {children} (the entire planner page) keeps the same
          position in the React tree across an orientation flip. A previous
          version branched {children} into two structurally different subtrees
          -- landscape nested it an extra div deep behind the outage banner,
          portrait rendered it one div up -- so on every rotation React could
          not reconcile the moved subtree and unmounted+remounted the whole
          page. That wiped all page-local state: an in-progress compPlan
          cleared to empty compartments, and loadingOpen reset so an open Plan
          Review "backed out" to the planner. Keeping the wrapper shape
          constant and only toggling the banner's presence (via a stable
          ternary slot, so the pt-tabscroll div stays at child index 1 either
          way) and the padding preserves the subtree -- no remount, the plan
          survives rotation.

          Landscape shows the outage banner HERE (the icon rail is too narrow
          for a horizontal ticker); portrait shows it inside Header instead
          (see Header), so it's gated on isLandscape to avoid a double banner.

          Padding: left/right add the device's safe-area inset (real, non-zero
          now that layout.tsx declares viewportFit:"cover") on top of the base
          12px -- background stays #0b0b0b to the physical edge (padding never
          shrinks an element's own background), only CONTENT is pushed clear of
          the unsafe strip. Portrait keeps its 0px top (Header owns the top
          inset); landscape's left inset is owned by the rail, so its content
          padding needs no extra left inset. */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>
        {isLandscape ? (
          <TerminalOutageBanner
            tickerMessage={outageBanner.tickerMessage}
            reports={outageBanner.reports}
            timeZone={outageBanner.timeZone}
            refresh={outageBanner.refresh}
          />
        ) : null}
        <div
          className="pt-tabscroll"
          style={{
            flex: 1, overflowY: "auto", background: "#0b0b0b",
            padding: isLandscape
              ? "12px calc(env(safe-area-inset-right, 0px) + 12px) 12px 12px"
              : "0px calc(env(safe-area-inset-right, 0px) + 12px) 12px calc(env(safe-area-inset-left, 0px) + 12px)",
          }}
        >
          {children}
        </div>
      </div>

      <EquipmentModal
        open={shell.equipOpen}
        onClose={() => shell.setEquipOpen(false)}
        authUserId={shell.effectiveUserId}
        setupSession={shell.setupSession}
        combos={shell.equipment.combos}
        combosLoading={shell.equipment.combosLoading}
        combosError={shell.equipment.combosError}
        selectedComboId={shell.equipment.selectedComboId ?? ""}
        onSelectComboId={(id: string) => shell.equipment.setSelectedComboId(id)}
        onRefreshCombos={shell.equipment.fetchCombos}
        myRole={shell.role}
        currentTruckId={shell.equipment.currentTruckId}
        currentTrailerId={shell.equipment.currentTrailerId}
        setCurrentEquipment={shell.equipment.setCurrentEquipment}
      />

      <ExpirationModal
        open={shell.expModalOpen}
        onClose={() => shell.setExpModalOpen(false)}
        items={shell.expirations.items}
        activeItems={shell.expirations.activeItems}
        onOpenEquipment={() => shell.setEquipOpen(true)}
        onOpenTerminals={() => shell.setTermOpen(true)}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        onDeactivateTerminal={shell.terminals.deleteAccessDateForTerminal}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Location/Terminal picker -- shared single instance (same reasoning
          as EquipmentModal above): the Planner's "Select Location" card and
          the Terminal tab's identity header both open THIS modal pair, both
          read/write the one shared shell.location, so picking a city/
          terminal from either tab is instantly reflected in the other. */}
      <LocationModal
        open={shell.locOpen} onClose={() => shell.setLocOpen(false)}
        selectedState={shell.location.selectedState}
        selectedStateLabel={shell.selectedStateLabel}
        selectedStateName={shell.selectedStateName}
        statesError={shell.location.statesError}
        statesLoading={shell.location.statesLoading}
        statePickerOpen={shell.statePickerOpen}
        setStatePickerOpen={shell.setStatePickerOpen}
        stateOptions={shell.stateOptions}
        setSelectedState={shell.location.setSelectedState}
        selectedCity={shell.location.selectedCity}
        citiesLoading={shell.location.citiesLoading}
        citiesError={shell.location.citiesError}
        cities={shell.cities}
        topCities={shell.topCities}
        allCities={shell.allCities}
        setSelectedCity={shell.location.setSelectedCity}
        normState={normState}
        toggleCityStar={shell.toggleCityStar}
        isCityStarred={shell.isCityStarred}
        setLocOpen={shell.setLocOpen}
      />

      <MyTerminalsModal
        open={shell.termOpen} onClose={() => shell.setTermOpen(false)}
        selectedState={shell.location.selectedState}
        selectedCity={shell.location.selectedCity}
        termError={shell.terminals.termError}
        terminalsFiltered={shell.terminalFilters.terminalsFiltered}
        selectedTerminalId={shell.location.selectedTerminalId}
        expandedTerminalId={shell.expandedTerminalId}
        setExpandedTerminalId={shell.setExpandedTerminalId}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        accessDateByTerminalId={shell.terminals.accessDateByTerminalId}
        setAccessDateForTerminal_={shell.terminals.setAccessDateForTerminal}
        cardDataByTerminalId={shell.cardDataByTerminalId}
        myTerminalIds={shell.myTerminalIdSet}
        setMyTerminalIds={() => {}}
        setSelectedTerminalId={shell.chooseTerminal}
        setTermOpen={shell.setTermOpen}
        onChangeLocation={() => { shell.setTermOpen(false); shell.setLocOpen(true); }}
        authUserId={shell.effectiveUserId}
        myRole={shell.role}
        companyId={shell.companyId}
        onLoadMyTerminals={shell.terminals.loadMyTerminals}
      />

      <RackSelectSheet
        open={shell.rackPickerOpen}
        terminalLabel={shell.terminalFilters.terminalsFiltered.find(
          (t: any) => String(t.terminal_id) === String(shell.location.selectedTerminalId)
        )?.terminal_name ?? undefined}
        racks={shell.rackPickerRacks}
        onPick={shell.resolveRackPick}
      />

      <style jsx global>{`
        .pt-tabscroll { scrollbar-width: none; -ms-overflow-style: none; }
        .pt-tabscroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

export default function CalculatorLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <CalculatorShellProvider>
      <ShellChrome>{children}</ShellChrome>
    </CalculatorShellProvider>
  );
}
