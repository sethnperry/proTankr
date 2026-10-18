"use client";

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type StateOption = { code: string; name?: string | null };

export default function LocationModal(props: {
  open: boolean;
  onClose: () => void;

  // State picker
  selectedState: string;
  selectedStateLabel: string;
  selectedStateName: string;

  statesError: string | null;
  statesLoading: boolean;
  statePickerOpen: boolean;
  setStatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stateOptions: StateOption[];

  setSelectedState: (code: string) => void;

  // City picker
  selectedCity: string;
  citiesLoading: boolean;
  citiesError: string | null;
  cities: string[];

  topCities: string[];
  allCities: string[];

  setSelectedCity: (city: string) => void;

  // helpers from page.tsx (keep logic centralized)
  normState: (s: string) => string;
  toggleCityStar: (state: string, city: string) => void;
  isCityStarred: (state: string, city: string) => boolean;

  // to preserve existing behavior (modal closes on city select)
  setLocOpen: (open: boolean) => void;
  // Called after a city is picked (the modal has already closed). The shell
  // uses it to open the terminal list so a city pick goes straight on to
  // picking a terminal there.
  onCityPicked?: () => void;
}) {
  const {
    open,
    onClose,

    selectedState,
    selectedStateName,

    statesError,
    statesLoading,
    statePickerOpen,
    setStatePickerOpen,
    stateOptions,

    setSelectedState,

    selectedCity,
    citiesLoading,
    citiesError,
    cities,

    topCities,
    allCities,

    setSelectedCity,

    toggleCityStar,
    isCityStarred,

    setLocOpen,
    onCityPicked,
  } = props;

  // Non-favorited cities start collapsed -- unless the currently selected
  // city isn't itself a favorite, in which case it'd otherwise be hidden
  // from view with no indication of where it went.
  const [citiesExpanded, setCitiesExpanded] = useState(
    () => !!selectedCity && !topCities.includes(selectedCity)
  );

  const cityRow = (c: string, starred: boolean) => {
    const active = c === selectedCity;
    return (
      <div
        key={c}
        role="button"
        tabIndex={0}
        onClick={() => { setSelectedCity(c); setLocOpen(false); onCityPicked?.(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedCity(c);
            setLocOpen(false);
            onCityPicked?.();
          }
        }}
        className={[
          "flex items-center rounded-[2px] border cursor-pointer select-none hover:bg-white/5",
          active ? "border-white/30 bg-white/5" : "border-white/10",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleCityStar(selectedState, c); }}
          aria-label={starred ? "Unstar city" : "Star city"}
          style={{
            flexShrink: 0, width: 26, height: 26, marginLeft: 12,
            borderRadius: "50%",
            border: `1px solid ${starred ? "rgba(234,179,8,0.55)" : "rgba(255,255,255,0.30)"}`,
            background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, lineHeight: 1, cursor: "pointer",
            color: starred ? "rgba(234,179,8,0.95)" : "rgba(255,255,255,0.30)",
          }}
        >
          {starred ? "★" : "☆"}
        </button>
        <div className="min-w-0 flex-1 px-3 py-3">
          <div className="text-sm font-semibold text-white truncate">{c}</div>
        </div>
      </div>
    );
  };

  return (
    <FullscreenModal open={open} title="Select Location" onClose={onClose} footer={null}>
      <div className="space-y-4">

        {/* STATE -- collapsed to a one-line "Showing cities in {state}" once
            set, matching My Terminals' header; only expands to the full
            state list when there's no state yet or "Change" is tapped. */}
        {!selectedState || statePickerOpen ? (
          <div>
            <div className="text-sm text-white/70 mb-2">
              {selectedState ? "Choose a different state." : "Choose the state you're loading in."}
            </div>
            {statesError ? <div className="mb-2 text-xs text-red-400">{statesError}</div> : null}
            {statesLoading ? (
              <div className="text-sm text-white/60">Loading states…</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stateOptions.map((s) => {
                  const active = s.code === selectedState;
                  return (
                    <button
                      key={s.code}
                      onClick={() => { setSelectedState(s.code); setStatePickerOpen(false); }}
                      className={[
                        "rounded-[2px] border px-3 py-3 text-left",
                        active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">{s.code} — {s.name || s.code}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedState && (
              <button
                type="button"
                onClick={() => setStatePickerOpen(false)}
                className="mt-3 text-xs font-semibold text-white/45 hover:text-white/70"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="text-sm text-white/70 flex items-center justify-between gap-2">
            <span>
              Showing cities in <span className="text-white">{selectedStateName}</span>
            </span>
            <button
              type="button"
              onClick={() => setStatePickerOpen(true)}
              className="shrink-0 text-xs font-semibold text-white/45 hover:text-white/70"
            >
              Change
            </button>
          </div>
        )}

        {/* CITY */}
        {selectedState && !statePickerOpen && (
          citiesLoading ? (
            <div className="rounded-[2px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              Loading cities…
            </div>
          ) : citiesError ? (
            <div className="rounded-[2px] border border-white/10 bg-white/[0.03] p-4 text-sm text-red-400">
              {citiesError}
            </div>
          ) : cities.length === 0 ? (
            <div className="rounded-[2px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              No cities available yet.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Favorites -- what's normally visible */}
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-white/50">Favorites</div>
                {topCities.length ? (
                  <div className="grid grid-cols-1 gap-2">
                    {topCities.map((c) => cityRow(c, true))}
                  </div>
                ) : (
                  <div className="text-sm text-white/40">
                    No favorite cities yet — tap the star on any city below to pin it here.
                  </div>
                )}
              </div>

              {/* Tap zone to expand the full (non-favorite) list */}
              {allCities.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCitiesExpanded((v) => !v)}
                  className="w-full flex items-center justify-between rounded-[2px] border border-white/10 px-3 py-2.5 text-xs font-semibold text-white/50 hover:bg-white/5"
                >
                  <span>{citiesExpanded ? "Hide all cities" : `Show all cities (${allCities.length})`}</span>
                  <span className="text-white/30">{citiesExpanded ? "▲" : "▼"}</span>
                </button>
              )}

              {citiesExpanded && allCities.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {allCities.map((c) => cityRow(c, false))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </FullscreenModal>
  );
}
