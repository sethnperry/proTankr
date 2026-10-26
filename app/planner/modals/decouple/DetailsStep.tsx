"use client";
// app/planner/modals/decouple/DetailsStep.tsx
//
// Decouple dialog step.

import React from "react";

import type { TruckStatus, TrailerStatus } from "./types";
import { TRUCK_STATUSES, TRAILER_STATUSES, D } from "./helpers";
import { BackBtn } from "./BackBtn";
import { FieldLabel } from "./FieldLabel";
import { LocationField } from "./LocationField";
import { StatusPicker } from "./StatusPicker";
import type { DecoupleModel } from "./useDecouple";

export function DetailsStep({ m }: { m: DecoupleModel }) {
  const { truckName, trailerName, uncoupledTrucks, uncoupledTrailers, setStep, scenario, err, setErr, reviewAttempted, setReviewAttempted, sharedLocation, setSharedLocation, truckStatus, setTruckStatus, truckLocation, setTruckLocation, truckNotes, setTruckNotes, trailerStatus, setTrailerStatus, trailerLocation, setTrailerLocation, trailerNotes, setTrailerNotes, newTruckId, setNewTruckId, newTrailerId, setNewTrailerId, truckGeo, trailerGeo, sharedGeo, canProceed, scenarioColors, scenarioLabels } = m;
  let detailsBody: React.ReactNode = null;

  // ── SWAP TRUCK: park old truck (location + status + notes), pick new truck, recouple
  if (scenario === "swap_truck") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Park <strong style={{ color: "rgba(255,255,255,0.75)" }}>{truckName}</strong> and
          select the new truck to couple with <strong style={{ color: "rgba(255,255,255,0.75)" }}>{trailerName}</strong>.
          The trailer's status stays unchanged.
        </div>

        {/* Old truck — location + status + notes */}
        <div style={D.sectionTitle}>Parking {truckName}</div>
        <LocationField value={truckLocation} onChange={setTruckLocation}
          onGeoTag={truckGeo.trigger} geoLoading={truckGeo.geoLoading}
          isError={reviewAttempted && !truckLocation.trim()} />
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Truck status</FieldLabel>
          <StatusPicker
            options={TRUCK_STATUSES as any}
            value={truckStatus as TruckStatus}
            onChange={(v) => setTruckStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Repair ticket #, contact, ETA…"
            value={truckNotes} onChange={(e) => setTruckNotes(e.target.value)} />
        </div>

        <div style={D.divider} />

        {/* New truck picker */}
        <div style={D.sectionTitle}>New truck</div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Select truck to couple</FieldLabel>
          <select style={{ ...D.select, ...(reviewAttempted && !newTruckId ? D.inputErr : {}) }}
            value={newTruckId} onChange={(e) => setNewTruckId(e.target.value)}>
            <option value="">Select truck…</option>
            {uncoupledTrucks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {uncoupledTrucks.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              No uncoupled trucks available.
            </div>
          )}
        </div>
      </>
    );
  }

  // ── SWAP TRAILER: park old trailer (location + status + notes), pick new trailer, recouple
  if (scenario === "swap_trailer") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Park <strong style={{ color: "rgba(255,255,255,0.75)" }}>{trailerName}</strong> and
          select the new trailer to couple with <strong style={{ color: "rgba(255,255,255,0.75)" }}>{truckName}</strong>.
          The truck's status stays unchanged.
        </div>

        {/* Old trailer — location + status + notes */}
        <div style={D.sectionTitle}>Parking {trailerName}</div>
        <LocationField value={trailerLocation} onChange={setTrailerLocation}
          onGeoTag={trailerGeo.trigger} geoLoading={trailerGeo.geoLoading}
          isError={reviewAttempted && !trailerLocation.trim()} />
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Trailer status</FieldLabel>
          <StatusPicker
            options={TRAILER_STATUSES as any}
            value={trailerStatus as TrailerStatus}
            onChange={(v) => setTrailerStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Repair ticket #, contact, ETA…"
            value={trailerNotes} onChange={(e) => setTrailerNotes(e.target.value)} />
        </div>

        <div style={D.divider} />

        {/* New trailer picker */}
        <div style={D.sectionTitle}>New trailer</div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Select trailer to couple</FieldLabel>
          <select style={{ ...D.select, ...(reviewAttempted && !newTrailerId ? D.inputErr : {}) }}
            value={newTrailerId} onChange={(e) => setNewTrailerId(e.target.value)}>
            <option value="">Select trailer…</option>
            {uncoupledTrailers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {uncoupledTrailers.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              No uncoupled trailers available.
            </div>
          )}
        </div>
      </>
    );
  }

  // ── DROP TRAILER: STUD the trailer only (truck is bobtailing away)
  if (scenario === "drop_trailer") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Set the status for <strong style={{ color: "rgba(255,255,255,0.75)" }}>{trailerName}</strong> so
          others know where it is and whether it's available.
          <strong style={{ color: "#67e8f9" }}> {truckName}</strong> will be marked <strong style={{ color: "#67e8f9" }}>IN USE</strong> automatically (bobtailing away).
        </div>

        <div style={D.sectionTitle}>Trailer status — {trailerName}</div>
        <LocationField value={trailerLocation} onChange={setTrailerLocation}
          onGeoTag={trailerGeo.trigger} geoLoading={trailerGeo.geoLoading}
          isError={reviewAttempted && !trailerLocation.trim()} />
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Status</FieldLabel>
          <StatusPicker
            options={TRAILER_STATUSES as any}
            value={trailerStatus as TrailerStatus}
            onChange={(v) => setTrailerStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Loaded? Empty? Repair needed? ETA pickup…"
            value={trailerNotes} onChange={(e) => setTrailerNotes(e.target.value)} />
        </div>
      </>
    );
  }

  // ── PARK BOTH: one shared location, one reason per unit
  if (scenario === "park_both") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Both units are being parked at the same location.
          Enter the location once, then add a reason for each unit.
        </div>

        {/* Shared location */}
        <div style={D.sectionTitle}>Location (both units)</div>
        <LocationField value={sharedLocation} onChange={setSharedLocation}
          onGeoTag={sharedGeo.trigger} geoLoading={sharedGeo.geoLoading}
          isError={reviewAttempted && !sharedLocation.trim()} />

        <div style={D.divider} />

        {/* Truck status + reason */}
        <div style={D.sectionTitle}>Truck — {truckName}</div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Status</FieldLabel>
          <StatusPicker
            options={TRUCK_STATUSES as any}
            value={truckStatus as TruckStatus}
            onChange={(v) => setTruckStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Reason / Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Why is this truck being parked? Repair ticket, end of shift, etc."
            value={truckNotes} onChange={(e) => setTruckNotes(e.target.value)} />
        </div>

        <div style={D.divider} />

        {/* Trailer status + reason */}
        <div style={D.sectionTitle}>Trailer — {trailerName}</div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Status</FieldLabel>
          <StatusPicker
            options={TRAILER_STATUSES as any}
            value={trailerStatus as TrailerStatus}
            onChange={(v) => setTrailerStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Reason / Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Empty? Loaded? Scheduled for cleaning? Inspection pending?"
            value={trailerNotes} onChange={(e) => setTrailerNotes(e.target.value)} />
        </div>
      </>
    );
  }

  return scenario ? (
    <div>
      <BackBtn onClick={() => setStep("scenario")} />
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
        color: scenarioColors[scenario], textTransform: "uppercase" as const, marginBottom: 14 }}>
        {scenarioLabels[scenario]}
      </div>

      {detailsBody}

      {err && <div style={{ ...D.err, marginTop: 12 }}>{err}</div>}

      {/* Validation messages — only shown after first tap attempt */}
      {reviewAttempted && !canProceed() && (() => {
        const msgs: string[] = [];
        if (scenario === "swap_truck")   { if (!truckLocation.trim()) msgs.push("Truck location is required"); if (!newTruckId) msgs.push("Select a new truck"); }
        if (scenario === "swap_trailer") { if (!trailerLocation.trim()) msgs.push("Trailer location is required"); if (!newTrailerId) msgs.push("Select a new trailer"); }
        if (scenario === "drop_trailer") { if (!trailerLocation.trim()) msgs.push("Trailer location is required"); }
        if (scenario === "park_both")    { if (!sharedLocation.trim()) msgs.push("Location is required"); }
        return (
          <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ fontSize: 12, fontWeight: 700, color: "#f87171",
                display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>⚠</span> {m}
              </div>
            ))}
          </div>
        );
      })()}

      <button type="button"
        onClick={() => {
          setReviewAttempted(true);
          if (!canProceed()) return;
          setErr(null);
          setStep("confirm");
        }}
        style={{
          ...D.btn, ...D.btnPrimary, width: "100%", textAlign: "center" as const,
          padding: "14px 0", fontSize: 15, marginTop: 14,
          opacity: reviewAttempted && !canProceed() ? 0.5 : 1,
          transform: reviewAttempted && !canProceed() ? "scale(0.98)" : "scale(1)",
          transition: "opacity 150ms ease, transform 150ms ease",
          borderColor: reviewAttempted && !canProceed() ? "rgba(248,113,113,0.35)" : undefined,
        }}>
        Review & Confirm →
      </button>
    </div>
  ) : null;
}
