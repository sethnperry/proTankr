"use client";
// app/planner/modals/loading/TripStepOverlays.tsx
//
// Trip steps after the products: supplier picker, loading times, and signature.

import { SupplierPicker } from "../../components/trip/SupplierPicker";
import { DelayReasonField, SignatureAccept, TimesEditor, fieldInput, fieldLabel } from "../../components/trip/tripUi";
import { StepCard } from "./StepCard";
import type { LoadingModel } from "./useLoadingModel";

export function TripStepOverlays({ m }: { m: LoadingModel }) {
  const {
    finishSignStep,
    finishTimesStep,
    pickingSupplier,
    seqGroups,
    seqSupplier,
    setCompSeqIndex,
    setPickingSupplier,
    setSeqError,
    setSeqFocus,
    setSeqSupplier,
    setSeqSupplierId,
    setTripNote,
    setTripOdometer,
    setTripReasonId,
    setTripSigned,
    setTripStep,
    setTripStepError,
    setTripTimes,
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
