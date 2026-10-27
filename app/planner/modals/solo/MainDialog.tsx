"use client";
// app/planner/modals/solo/MainDialog.tsx
//
// The main Equipment dialog: report section, action row, Select Equipment button.

import { useEffect, useRef } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { StatusBlock } from "./StatusBlock";
import { COLOR_TARE, COLOR_SERVICE, COLOR_WASH, saveBtnStyle, S } from "./styles";
import type { SoloModel } from "./useSoloEquipment";

export function MainDialog({ m }: { m: SoloModel }) {
  const {
    error,
    handleClose,
    loading,
    open,
    openEdit,
    openStatus,
    selectedCombo,
    selectedTrailerId,
    selectedTruckId,
    serviceLines,
    setPickerOpen,
    setScaleHistoryOpen,
    setScaleOpen,
    setServiceHistoryOpen,
    setServiceOpen,
    setWashHistoryOpen,
    setWashOpen,
    trailerServiceLine,
    washLines,
  } = m;
  // With nothing selected there is nothing to look at here: go straight to the picker, once per opening.
  const autoPicked = useRef(false);
  const hasUnit = !!selectedCombo || !!selectedTrailerId || !!selectedTruckId;
  useEffect(() => {
    if (!open) { autoPicked.current = false; return; }
    if (loading) return;
    if (!hasUnit && !autoPicked.current) { autoPicked.current = true; setPickerOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);
  return (
    <>
      <FullscreenModal open={open} onClose={handleClose} title="Equipment" footer={null}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {error && (
            <div
              style={{
                borderRadius: 2,
                padding: 12,
                marginBottom: 10,
                background: "rgba(180,40,40,0.18)",
                border: "1px solid rgba(180,40,40,0.32)",
                color: "rgba(255,255,255,0.92)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          <button type="button" style={{ ...S.selectEquipmentBtn, marginBottom: 14 }} onClick={() => setPickerOpen(true)}>
            Select Equipment
          </button>

          {/* ── Status report -- replaces the old grid + per-card away
              badge/caption. See the statusBlockEl computation above. ── */}
          {!hasUnit && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, textAlign: "center", margin: "8px 8px 18px" }}>
              Pick the truck and trailer you're running today.
            </div>
          )}
          {hasUnit && <StatusBlock m={m} />}

          {hasUnit && <div style={S.divider} />}

          {/* ── Report section (non-scrolling) ── */}
          {hasUnit ? (<div style={{ flexShrink: 0 }}>
            {/* Tare + Target merged onto one row per explicit follow-up
                ("no need to say weight or gross weight just tare and
                target. the 'lbs' speaks for itself") -- tap anywhere on
                the row still opens Scale History, same as either used to
                individually. */}
            {selectedCombo && (Number(selectedCombo.tare_lbs ?? 0) > 0 || Number(selectedCombo.target_weight ?? 0) > 0) && (
              <div style={S.reportLine} onClick={() => setScaleHistoryOpen(true)}>
                <span style={S.reportLabel}>Tare / Target</span>
                <span style={{ fontWeight: 900, color: COLOR_TARE }}>
                  {Number(selectedCombo.tare_lbs ?? 0) > 0 ? `${Number(selectedCombo.tare_lbs).toLocaleString()}` : "—"}
                  {" / "}
                  {Number(selectedCombo.target_weight ?? 0) > 0 ? `${Number(selectedCombo.target_weight).toLocaleString()}` : "—"}
                  {" lbs"}
                </span>
              </div>
            )}
            {serviceLines.length > 0 ? (
              <div style={S.reportLine} onClick={() => setServiceHistoryOpen(true)}>
                <span style={S.reportLabel}>Truck{serviceLines[0].typeName ? ` - ${serviceLines[0].typeName}` : ""}</span>
                <span style={{ fontWeight: 900, color: COLOR_SERVICE, fontSize: 13 }}>{serviceLines[0].display}</span>
              </div>
            ) : (
              <div style={S.reportLine} onClick={() => setServiceHistoryOpen(true)}>
                <span style={S.reportLabel}>Truck</span>
                <span style={{ fontWeight: 900, color: COLOR_SERVICE }}>No service recorded</span>
              </div>
            )}
            {/* Trailer's own line, brought back per explicit follow-up --
                backward-looking (last serviced), not a due prediction,
                see mostRecentServiceForUnit's own header comment. Only
                shown once a trailer is actually selected. */}
            {selectedTrailerId && trailerServiceLine && (
              <div style={S.reportLine} onClick={() => setServiceHistoryOpen(true)}>
                <span style={S.reportLabel}>Trailer Serviced</span>
                <span style={{ fontWeight: 900, color: COLOR_SERVICE, fontSize: 13 }}>{trailerServiceLine.display}</span>
              </div>
            )}
            {washLines.length > 0 ? (
              <div style={S.reportLine} onClick={() => setWashHistoryOpen(true)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                  {washLines.map((w) => (
                    <div key={w.unitLabel} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={S.reportLabel}>{w.unitLabel === "Both" ? "Washed" : `${w.unitLabel} washed`}</span>
                      <span style={{ fontWeight: 900, color: COLOR_WASH, fontSize: 13 }}>{w.display}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={S.reportLine} onClick={() => setWashHistoryOpen(true)}>
                <span style={S.reportLabel}>Washed on</span>
                <span style={{ fontWeight: 900, color: COLOR_WASH }}>No wash recorded</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <div style={S.actionBtn()} onClick={() => setScaleOpen(true)}>
                Scale
              </div>
              <div style={S.actionBtn()} onClick={() => setServiceOpen(true)}>
                Service
              </div>
              <div style={S.actionBtn()} onClick={() => setWashOpen(true)}>
                Wash
              </div>
              <div style={S.actionBtn()} onClick={openEdit}>
                Edit
              </div>
            </div>

            {/* Stud -- pulled out of the small action-button row into its
                own full-width button, same size/shape as Done, directly
                above it -- per explicit direction. */}
            <button type="button" onClick={openStatus} style={{ ...saveBtnStyle, marginTop: 14 }}>
              Stud
            </button>

            {/* This modal opts out of FullscreenModal's own default Done
                button (footer={null}, see header comment -- everything here
                autosaves, no Save/Decouple step) but still needs an
                explicit, deliberate way to close. */}
            <button type="button" onClick={handleClose} style={{ ...saveBtnStyle, marginTop: 10 }}>
              Done
            </button>
          </div>) : (
            <button type="button" onClick={handleClose} style={{ ...saveBtnStyle, marginTop: 10 }}>
              Not now
            </button>
          )}
        </div>
      </FullscreenModal>
    </>
  );
}
