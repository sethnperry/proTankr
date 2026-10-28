"use client";
// app/planner/modals/solo/PickerDialog.tsx
//
// Select Equipment: the truck/trailer grid.

import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { EquipmentBoard } from "../../components/equipment/EquipmentBoard";
import { saveBtnStyle, S } from "./styles";
import { createLongPress } from "./longPress";
import type { SoloModel } from "./useSoloEquipment";

export function PickerDialog({ m }: { m: SoloModel }) {
  const {
    awaitingTruck,
    boardRows,
    boardStatus,
    boardTapTrailer,
    boardTapTruck,
    canAddRemove,
    claimedByCombo,
    coupleFrom,
    filter,
    loading,
    pickerOpen,
    scrollRef,
    selectedTrailerId,
    selectedTruckId,
    setAddTrailerOpen,
    setAddTruckOpen,
    setAwaitingTruck,
    setCoupleFrom,
    setDetailComboId,
    setFilterOpen,
    setPickerOpen,
    setRemoveTarget,
    setSelectedTrailerId,
    trailers,
    trucks,
  } = m;
  return (
    <>
      {/* ── Select Equipment -- the two-column truck/trailer grid + connector
          line + Filter, moved behind its own screen (per explicit
          direction: "the two column grid... needs to be in its own window
          behind a select equipment button"). Tapping a card here keeps its
          exact prior behavior (toggle/select/couple, away-confirm,
          commandeer-confirm, new-tare prompt); the main screen re-renders
          the status report once this closes. ── */}
      <FullscreenModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          if (awaitingTruck) {
            setAwaitingTruck(false);
            setSelectedTrailerId(null);
          }
        }}
        title="Select Equipment"
        footer={null}
        headerRight={
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: filter.region || filter.localArea || filter.awayOnly ? "#fff" : "rgba(255,255,255,0.4)",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.3,
            }}
          >
            Filter{filter.region || filter.localArea || filter.awayOnly ? " •" : ""}
          </button>
        }
      >
        <div ref={scrollRef} style={{ position: "relative", height: "100%", overflowY: "auto", minHeight: 0 }}>
          {coupleFrom && (
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.06)",
                padding: "10px 12px",
                marginBottom: 12,
                fontSize: 13,
                lineHeight: 1.5,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span>
                Coupling{" "}
                <b>
                  {(coupleFrom.kind === "truck"
                    ? trucks.find((t) => t.truck_id === coupleFrom.id)?.truck_name
                    : trailers.find((t) => t.trailer_id === coupleFrom.id)?.trailer_name) ?? "unit"}
                </b>
                . Tap a {coupleFrom.kind === "truck" ? "trailer" : "truck"} to pair with it.
              </span>
              <button
                type="button"
                onClick={() => setCoupleFrom(null)}
                style={{ background: "none", border: "none", color: "#93c5fd", fontWeight: 800, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          )}
          {awaitingTruck && (
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.06)",
                padding: "10px 12px",
                marginBottom: 12,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <b>Truck parked.</b> Tap a truck to hook up to{" "}
              {trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name ?? "the trailer"}, or tap Done to leave without
              equipment.
            </div>
          )}
          {!selectedTruckId && !selectedTrailerId && !coupleFrom && !awaitingTruck && !loading && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 12 }}>
              Tap your truck, then Couple, then tap your trailer.
            </div>
          )}
          <EquipmentBoard
            rows={boardRows}
            claimedByCombo={claimedByCombo}
            initials={boardStatus.initials}
            activity={boardStatus.activity} destByTrailer={boardStatus.destByTrailer}
            strips={boardStatus.strips}
            mine={{ truckId: selectedTruckId, trailerId: selectedTrailerId }}
            loading={loading}
            onCombo={(c) => setDetailComboId(c.comboId)}
            pendingId={coupleFrom?.id ?? null}
            onTruck={(u) => boardTapTruck(u.id)}
            onTrailer={(u) => boardTapTrailer(u.id)}
            canAdd={canAddRemove}
            onAddTruck={() => setAddTruckOpen(true)}
            onAddTrailer={() => setAddTrailerOpen(true)}
            // Long-press-to-remove is staff-only; a plain fleet driver taps to
            // select/couple and nothing else.
            longPress={
              canAddRemove
                ? (u) => {
                    const { didFire, ...handlers } = createLongPress(() => setRemoveTarget({ kind: u.kind, id: u.id, name: u.name }));
                    return { handlers: handlers as Record<string, unknown>, didFire };
                  }
                : undefined
            }
          />
          <button
            type="button"
            onClick={() => {
              setPickerOpen(false);
              if (awaitingTruck) {
                setAwaitingTruck(false);
                setSelectedTrailerId(null);
              }
            }}
            style={{ ...saveBtnStyle, marginTop: 20 }}
          >
            Done
          </button>
        </div>
      </FullscreenModal>
    </>
  );
}
