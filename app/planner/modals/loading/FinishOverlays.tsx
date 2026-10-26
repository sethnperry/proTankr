"use client";
// app/planner/modals/loading/FinishOverlays.tsx
//
// Windows opened from Plan Review: cap entry, per-product Finish Loading, split load, trip times and signature.

import ValueEntryOverlay from "../../components/ValueEntryOverlay";
import { SupplierPicker } from "../../components/trip/SupplierPicker";
import { DelayReasonField, SignatureAccept, TimesEditor, fieldInput, fieldLabel } from "../../components/trip/tripUi";
import { StepCard } from "./StepCard";
import type { LoadingModel } from "./useLoadingModel";

export function FinishOverlays({ m }: { m: LoadingModel }) {
  const {
    commitCompStep,
    cancelLogSequence,
    commitGallonsOverlay,
    compSeqIndex,
    finishSignStep,
    finishSplit,
    finishTimesStep,
    gallonsCap,
    gallonsInput,
    gallonsTarget,
    goToPreviousCompStep,
    openSplit,
    orderedCompLines,
    pickingSupplier,
    productNameById,
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
    setCompSeqIndex,
    setGallonsInput,
    setGallonsTarget,
    setPickingSupplier,
    setSeqApi,
    setSeqBol,
    setSeqError,
    setSeqFocus,
    setSeqGallons,
    setSeqNet,
    setSeqNetTouched,
    setSeqSupplier,
    setSeqSupplierId,
    setSeqTemp,
    setSplitDraft,
    setSplitProductId,
    setTripNote,
    setTripOdometer,
    setTripReasonId,
    setTripSigned,
    setTripStep,
    setTripStepError,
    setTripTimes,
    splitDraft,
    splitProductId,
    trip,
    tripNote,
    tripOdometer,
    tripReasonId,
    tripSigned,
    tripStep,
    tripStepError,
    tripTimes,
  } = m;
  return (
    <>
      {/* Compartment cap tap-to-adjust -- sets the max gallons for this comp
          (weight-bounded solver, can't overload); recovers from a mistype.
          Review mode only -- report mode's compartments aren't tappable. */}
      <ValueEntryOverlay
        open={gallonsTarget != null}
        title={gallonsTarget ? `Cap · C${gallonsTarget.comp}` : "Cap"}
        fields={[{ key: "gallons", label: "Max gallons", value: gallonsInput, onChange: setGallonsInput, suffix: "gal" }]}
        hint={gallonsCap != null ? `Up to ${Math.round(gallonsCap)} gal` : undefined}
        onCancel={() => setGallonsTarget(null)}
        onSubmit={commitGallonsOverlay}
      />

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

      {/* Split Load: which BOL each of this product's compartments came on. */}
      {splitProductId != null &&
        (() => {
          const comps = orderedCompLines.filter((l) => l.productId === splitProductId);
          const used = Math.max(1, ...comps.map((l) => splitDraft[l.comp] ?? 1));
          const choices = Math.min(comps.length, used + 1);
          return (
            <StepCard
              title={`Split · ${productNameById.get(splitProductId) ?? splitProductId}`}
              onBack={() => setSplitProductId(null)}
              backLabel="Cancel"
              onNext={finishSplit}
              nextLabel="Done"
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center" as const }}>
                Group the compartments by BOL. Each BOL gets its own window.
              </div>
              {comps.map((l) => (
                <div key={l.comp} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, width: 32 }}>C{l.comp}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: "1 1 auto" }}>
                    {Math.round(l.gallons).toLocaleString()} gal
                  </span>
                  {Array.from({ length: choices }, (_, i) => i + 1).map((n) => {
                    const on = (splitDraft[l.comp] ?? 1) === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSplitDraft((d) => ({ ...d, [l.comp]: n }))}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 2,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 700,
                          border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                          background: on ? "#fff" : "transparent",
                          color: on ? "#000" : "rgba(255,255,255,0.7)",
                        }}
                      >
                        BOL {n}
                      </button>
                    );
                  })}
                </div>
              ))}
            </StepCard>
          );
        })()}

      {trip && (
        <SupplierPicker
          open={pickingSupplier}
          suppliers={trip.suppliers}
          current={seqSupplier || null}
          onAdd={trip.onAddSupplier}
          onPick={(p) => {
            setSeqSupplier(p.name);
            setSeqSupplierId(p.supplier_id);
            setSeqError(null);
            setSeqFocus("api");
            setPickingSupplier(false);
          }}
          onClose={() => setPickingSupplier(false)}
        />
      )}

      {trip && tripStep === "times" && tripTimes && (
        <StepCard
          title={trip.pickupName ? `Times · ${trip.pickupName}` : "Loading times"}
          onBack={() => {
            setTripStep(null);
            setTripStepError(null);
            setCompSeqIndex(Math.max(0, seqGroups.length - 1));
          }}
          backLabel="‹ Back"
          onNext={finishTimesStep}
          nextLabel="Next"
          error={tripStepError}
        >
          <TimesEditor
            times={tripTimes}
            onChange={(t) => {
              setTripTimes(t);
              setTripStepError(null);
            }}
            beginLabel="Begin loading"
          />
          <DelayReasonField
            times={tripTimes}
            threshold={trip.settings.loading_delay_threshold_minutes}
            reasons={trip.reasons}
            kind="loading"
            reasonId={tripReasonId}
            note={tripNote}
            onChange={(id, n) => {
              setTripReasonId(id);
              setTripNote(n);
              setTripStepError(null);
            }}
          />
          {trip.needsOdometer && (
            <div>
              <div style={fieldLabel}>Odometer</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                This pickup is in a different city from the last one.
              </div>
              <input
                value={tripOdometer}
                onChange={(e) => {
                  setTripOdometer(e.target.value);
                  setTripStepError(null);
                }}
                inputMode="numeric"
                style={fieldInput}
              />
            </div>
          )}
        </StepCard>
      )}

      {trip && tripStep === "sign" && (
        <StepCard
          title="Loading driver"
          onBack={() => {
            setTripStep("times");
            setTripStepError(null);
          }}
          backLabel="‹ Back"
          onNext={finishSignStep}
          nextLabel="Finish Loading"
          error={tripStepError}
        >
          <SignatureAccept
            savedPath={trip.signature}
            onSave={trip.onSaveSignature}
            accepted={tripSigned}
            onAccept={(v) => {
              setTripSigned(v);
              setTripStepError(null);
            }}
            who="the loading driver"
          />
        </StepCard>
      )}
    </>
  );
}
