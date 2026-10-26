"use client";
// app/planner/modals/solo/UnitPopouts.tsx
//
// Loose-unit and combo pop-outs, drop/swap, documents, take-over.

import React from "react";
import BinderModal from "../BinderModal";
import UnitPickerSheet from "../UnitPickerSheet";
import { ComboDetailSheet } from "../../components/equipment/ComboDetailSheet";
import { AddDocumentSheet } from "../../components/equipment/AddDocumentSheet";
import type { SoloModel } from "./useSoloEquipment";

export function UnitPopouts({ m }: { m: SoloModel }) {
  const {
    authUserId,
    boardRows,
    claimedByNames,
    companyId,
    detailCombo,
    detailMine,
    detailRow,
    detailUnit,
    docDraft,
    docUnit,
    dropSwapOpen,
    loadEquipment,
    myRole,
    openStatusFor,
    resolvePair,
    setDetailComboId,
    setDetailUnit,
    setDocDraft,
    setDocUnit,
    setDropSwapOpen,
    setSelectedTrailerId,
    setSelectedTruckId,
    setStatusFlow,
    setStudPickOpen,
    setTakeCombo,
    startCouple,
    studPickOpen,
    takeCombo,
    trailers,
    trucks,
  } = m;
  return (
    <>
      {/* ── Loose-unit pop-out: same window as a combo, with Couple as its main button ── */}
      {detailUnit &&
        (() => {
          const u =
            detailUnit.kind === "truck"
              ? boardRows.trucks.find((x) => x.id === detailUnit.id)
              : boardRows.trailers.find((x) => x.id === detailUnit.id);
          if (!u) return null;
          return (
            <ComboDetailSheet
              open
              onClose={() => setDetailUnit(null)}
              companyId={companyId}
              truck={detailUnit.kind === "truck" ? u : null}
              trailer={detailUnit.kind === "trailer" ? u : null}
              holderLabel={null}
              primaryLabel="Couple"
              onOpenFile={(kind) => setDocUnit({ kind, id: u.id })}
              onDropSwap={() => startCouple(detailUnit.kind, u.id)}
              onStud={() => {
                setDetailUnit(null);
                openStatusFor(detailUnit.kind, u.id);
              }}
              onDocCaptured={(kind, files) => {
                setDetailUnit(null);
                setDocDraft({ kind, id: u.id, files });
              }}
            />
          );
        })()}

      {/* ── Combo pop-out: tap a connected combo on the picker ── */}
      {detailRow && (
        <ComboDetailSheet
          open
          onClose={() => setDetailComboId(null)}
          companyId={companyId}
          truck={detailRow.truck}
          trailer={detailRow.trailer}
          holderLabel={
            detailMine
              ? "In use by you"
              : detailCombo?.claimed_by
                ? `In use by ${claimedByNames[detailCombo.claimed_by] ?? "another driver"}`
                : null
          }
          onOpenFile={(kind) => setDocUnit({ kind, id: kind === "truck" ? detailRow.truck.id : detailRow.trailer.id })}
          onDropSwap={() => setDropSwapOpen(true)}
          onStud={() => setStudPickOpen(true)}
          onDocCaptured={(kind, files) => {
            setDetailComboId(null);
            setDocDraft({ kind, id: kind === "truck" ? detailRow.truck.id : detailRow.trailer.id, files });
          }}
        />
      )}
      {detailRow && dropSwapOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#151515",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 2,
              padding: 20,
              maxWidth: 360,
              width: "100%",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>
              {detailRow.truck.name} / {detailRow.trailer.name}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 16 }}>
              {detailMine
                ? "Drop the trailer, or park the truck and hook up another one. You set a status and, if you want, where it is."
                : "Take this combo as your equipment."}
            </div>
            {(() => {
              const opt: React.CSSProperties = {
                width: "100%",
                padding: "16px 18px",
                borderRadius: 2,
                marginBottom: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 800,
                textAlign: "left",
                cursor: "pointer",
              };
              const closeAll = () => {
                setDropSwapOpen(false);
                setDetailComboId(null);
              };
              if (!detailMine) {
                return (
                  <button
                    type="button"
                    style={{ ...opt, background: "#fff", color: "#000" }}
                    onClick={() => {
                      const owner =
                        detailCombo?.claimed_by && detailCombo.claimed_by !== authUserId
                          ? (claimedByNames[detailCombo.claimed_by] ?? "another driver")
                          : null;
                      setDropSwapOpen(false);
                      if (owner) {
                        setTakeCombo({ truckId: detailRow.truck.id, trailerId: detailRow.trailer.id, ownerName: owner });
                        return;
                      }
                      setSelectedTruckId(detailRow.truck.id);
                      setSelectedTrailerId(detailRow.trailer.id);
                      void resolvePair(detailRow.truck.id, detailRow.trailer.id, undefined, true);
                      setDetailComboId(null);
                    }}
                  >
                    Take this combo
                  </button>
                );
              }
              return (
                <>
                  <button
                    type="button"
                    style={opt}
                    onClick={() => {
                      closeAll();
                      setStatusFlow("drop_trailer");
                      openStatusFor("trailer", detailRow.trailer.id);
                    }}
                  >
                    Drop trailer · {detailRow.trailer.name}
                  </button>
                  <button
                    type="button"
                    style={opt}
                    onClick={() => {
                      closeAll();
                      setStatusFlow("park_truck");
                      openStatusFor("truck", detailRow.truck.id);
                    }}
                  >
                    Park truck · {detailRow.truck.name}
                  </button>
                </>
              );
            })()}
            <button
              type="button"
              onClick={() => setDropSwapOpen(false)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {detailRow && (
        <UnitPickerSheet
          open={studPickOpen}
          title="Update status for which unit?"
          subtitle="Flag it In Use, Deadline, or Readyline."
          truckName={detailRow.truck.name}
          trailerName={detailRow.trailer.name}
          onPickTruck={() => {
            setStudPickOpen(false);
            openStatusFor("truck", detailRow.truck.id);
          }}
          onPickTrailer={() => {
            setStudPickOpen(false);
            openStatusFor("trailer", detailRow.trailer.id);
          }}
          onCancel={() => setStudPickOpen(false)}
        />
      )}
      {docDraft && (
        <AddDocumentSheet
          open
          onClose={() => setDocDraft(null)}
          companyId={companyId}
          unitKind={docDraft.kind}
          unitId={docDraft.id}
          unitName={
            (docDraft.kind === "truck"
              ? trucks.find((t) => t.truck_id === docDraft.id)?.truck_name
              : trailers.find((t) => t.trailer_id === docDraft.id)?.trailer_name) ?? ""
          }
          initialFiles={docDraft.files}
          onSaved={() => {
            void loadEquipment();
          }}
        />
      )}
      <BinderModal
        open={!!docUnit}
        onClose={() => setDocUnit(null)}
        companyId={companyId}
        truckId={docUnit?.kind === "truck" ? docUnit.id : null}
        trailerId={docUnit?.kind === "trailer" ? docUnit.id : null}
        truckName={trucks.find((t) => t.truck_id === docUnit?.id)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === docUnit?.id)?.trailer_name}
        myRole={myRole}
      />
      {takeCombo && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#151515",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 2,
              padding: 20,
              maxWidth: 360,
              width: "100%",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Take this combo from {takeCombo.ownerName}?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 16 }}>
              They're using it right now. Taking it removes it from their equipment.
            </div>
            <button
              type="button"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 2,
                border: "none",
                background: "#fff",
                color: "#000",
                fontWeight: 800,
                cursor: "pointer",
                marginBottom: 8,
              }}
              onClick={() => {
                const t = takeCombo;
                setTakeCombo(null);
                setDetailComboId(null);
                setSelectedTruckId(t.truckId);
                setSelectedTrailerId(t.trailerId);
                void resolvePair(t.truckId, t.trailerId, undefined, true);
              }}
            >
              Take it
            </button>
            <button
              type="button"
              onClick={() => setTakeCombo(null)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
