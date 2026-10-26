"use client";
// app/planner/modals/loading/ProductEntryOverlay.tsx
//
// The per-product Finish Loading / Edit Load window (BOL, supplier, API, temp, gross, net).

import ValueEntryOverlay from "../../components/ValueEntryOverlay";
import type { LoadingModel } from "./useLoadingModel";

export function ProductEntryOverlay({ m }: { m: LoadingModel }) {
  const {
    commitCompStep,
    cancelLogSequence,
    compSeqIndex,
    goToPreviousCompStep,
    openSplit,
    pickingSupplier,
    seqApi,
    seqBol,
    seqBusy,
    seqCalc,
    seqDot,
    seqError,
    seqFocus,
    seqGallons,
    seqGroup,
    seqGroups,
    seqLabel,
    seqNet,
    seqNetShown,
    seqNetTouched,
    seqProductCompCount,
    seqSubmitLabel,
    seqSupplier,
    seqTemp,
    setPickingSupplier,
    setSeqApi,
    setSeqBol,
    setSeqError,
    setSeqGallons,
    setSeqNet,
    setSeqNetTouched,
    setSeqTemp,
    splitProductId,
    trip,
  } = m;
  return (
    <>
      {/* Finish Loading / Edit Load: one window per product (per BOL after
          a split). BOL # and supplier first (trip mode), then API, temp,
          gross, net -- the keypad's Next walks the fields in that order. */}
      <ValueEntryOverlay
        open={compSeqIndex != null && !pickingSupplier && splitProductId == null}
        title={seqLabel}
        dotColor={seqDot}
        focusKey={seqFocus}
        fields={[
          ...(trip
            ? [
                {
                  key: "bol",
                  label: "BOL #",
                  value: seqBol,
                  text: true,
                  badge: seqBol.trim() && (trip.geotabBols ?? []).includes(seqBol.trim()) ? "✓" : undefined,
                  onChange: (v: string) => {
                    setSeqBol(v);
                    setSeqError(null);
                  },
                  // Next on the BOL opens the supplier list when none is picked yet.
                  onEnter: () => {
                    if (seqSupplier.trim()) return false;
                    setPickingSupplier(true);
                    return true;
                  },
                  after: (
                    <>
                      {(trip.geotabBols?.length ?? 0) > 0 && (
                        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                          {trip.geotabBols!.includes(seqBol.trim()) ? (
                            <span style={{ color: "#4ade80", fontWeight: 800 }}>
                              Matches your telematics app. Check it against the BOL.
                            </span>
                          ) : (
                            <>
                              Telematics app has:{" "}
                              {trip.geotabBols!.map((b) => (
                                <button
                                  key={b}
                                  type="button"
                                  onClick={() => {
                                    setSeqBol(b);
                                    setSeqError(null);
                                  }}
                                  style={{
                                    marginLeft: 6,
                                    padding: "3px 8px",
                                    border: "1px solid rgba(255,255,255,0.35)",
                                    background: "transparent",
                                    color: "#fff",
                                    fontWeight: 800,
                                    fontSize: 12,
                                    cursor: "pointer",
                                    borderRadius: 2,
                                  }}
                                >
                                  {b}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setPickingSupplier(true)}
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: "9px 10px",
                          borderRadius: 2,
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          border: "1px solid rgba(255,255,255,0.15)",
                          background: "rgba(255,255,255,0.04)",
                          color: seqSupplier ? "#fff" : "rgba(255,255,255,0.45)",
                          fontSize: 15,
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {seqSupplier || "Pick supplier"}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
                      </button>
                    </>
                  ),
                },
              ]
            : []),
          {
            key: "api",
            label: "API",
            value: seqApi,
            onChange: (v: string) => {
              setSeqApi(v);
              setSeqError(null);
            },
            decimal: true,
          },
          {
            key: "temp",
            label: "Temp",
            value: seqTemp,
            onChange: (v: string) => {
              setSeqTemp(v);
              setSeqError(null);
            },
            suffix: "°F",
            decimal: true,
          },
          {
            key: "gallons",
            label: "Gross",
            value: seqGallons,
            onChange: (v: string) => {
              setSeqGallons(v);
              setSeqError(null);
            },
            suffix: "gal",
          },
          ...(trip
            ? [
                {
                  key: "net",
                  label: "Net",
                  value: seqNetShown,
                  onChange: (v: string) => {
                    setSeqNet(v);
                    setSeqNetTouched(true);
                    setSeqError(null);
                  },
                  suffix: "gal",
                  decimal: true,
                },
              ]
            : []),
        ]}
        footer={
          seqProductCompCount > 1 ? (
            <button
              type="button"
              onClick={openSplit}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 2,
                cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "rgba(255,255,255,0.75)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {seqGroup && seqGroup.bolCount > 1 ? "Change Split" : "Split Load"}
            </button>
          ) : undefined
        }
        hint={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" as const }}>
            {seqGroup && (
              <span>
                {seqGroup.comps.map((c) => `C${c}`).join(" + ")}
                {seqGroups.length > 1 && compSeqIndex != null ? ` · ${compSeqIndex + 1} of ${seqGroups.length}` : ""}
              </span>
            )}
            {trip && seqNetTouched && seqCalc != null && String(seqCalc) !== seqNet && (
              <button
                type="button"
                onClick={() => {
                  setSeqNet(String(seqCalc));
                  setSeqNetTouched(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Calculated net {seqCalc} · use it
              </button>
            )}
            <span>If the BOL shows more than one, use the lowest API and the coldest temperature.</span>
          </div>
        }
        onCancel={compSeqIndex != null && compSeqIndex > 0 ? goToPreviousCompStep : cancelLogSequence}
        cancelLabel={compSeqIndex != null && compSeqIndex > 0 ? "‹ Back" : "Cancel"}
        onSubmit={() => {
          void commitCompStep();
        }}
        submitLabel={seqSubmitLabel}
        error={seqError}
        busyLabel={seqBusy ? "Checking…" : null}
      />
    </>
  );
}
