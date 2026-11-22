"use client";
// app/planner/modals/solo/StatusDialog.tsx
//
// Update Status (STUD) for equipment you hold, and everything that follows from it.
//
// STUD from the main screen asks which equipment (Truck, Trailer or Both), then offers only Deadline and Readyline: it is already
// in use, by you. Either one parks the unit and takes it apart from its partner. What is left is never left half-done:
//  - a trailer with no truck opens Select Equipment to pick a truck (the pairing is confirmed);
//  - a truck with no trailer opens it to pick a trailer, and closing it asks you to confirm In Use · Bobtail;
//  - closing with a trailer and no truck asks to STUD the trailer (park it) or select a truck, because a trailer is never in
//    use without power;
//  - Both parks both units, uncoupled, and you hold nothing.

import EquipmentStatusModal from "../EquipmentStatusModal";
import UnitPickerSheet from "../UnitPickerSheet";
import { supabase } from "@/lib/supabase/client";
import type { SoloModel } from "./useSoloEquipment";

const optStyle: React.CSSProperties = { width: "100%", padding: "16px 18px", borderRadius: 2, marginBottom: 10, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, fontWeight: 800, textAlign: "left", cursor: "pointer" };
const primaryStyle: React.CSSProperties = { ...optStyle, background: "#fff", color: "#000" };

function Sheet({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 20, maxWidth: 360, width: "100%" }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 16 }}>{body}</div>
        {children}
      </div>
    </div>
  );
}

export function StatusDialog({ m }: { m: SoloModel }) {
  const {
    companyId,
    loadEquipment,
    onClose,
    onRefreshCombos,
    onRefreshCurrentEquipment,
    onSelectComboId,
    selectedTruckId,
    selectedTrailerId,
    trucks,
    trailers,
    setAwaitingTruck,
    setAwaitingTrailer,
    setPickerOpen,
    setSelectedTrailerId,
    setSelectedTruckId,
    setStatusFlow,
    setStatusTarget,
    setCurrentEquipment,
    statusFlow,
    statusTarget,
    studTargetOpen,
    setStudTargetOpen,
    startStud,
    pairConfirm,
    setPairConfirm,
    closeAsk,
    setCloseAsk,
    awaitTrailerId,
    setAwaitTrailerId,
    finishCouple,
    openStatusFor,
  } = m;

  const truckName = trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name ?? null;
  const trailerName = trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name ?? null;
  const askTrailerName = trailers.find((t) => t.trailer_id === closeAsk?.trailerId)?.trailer_name ?? null;
  const refreshAll = async () => {
    await onRefreshCurrentEquipment?.();
    await Promise.all([loadEquipment(), onRefreshCombos()]);
  };

  // Parking no longer splits a pair by itself (that is the point of the End shift fix), so every park here breaks the pairing, then
  // keeps whichever unit stays with the driver (or neither).
  async function splitPair(kind: "truck" | "trailer", id: string, keep: "truck" | "trailer" | null) {
    try {
      const { data } = await supabase.from("equipment_combos").select("combo_id, truck_id, trailer_id")
        .eq("active", true).eq(kind === "truck" ? "truck_id" : "trailer_id", id).limit(1);
      const c = ((data ?? []) as any[])[0];
      if (!c) return;
      await supabase.rpc("decouple_combo", { p_combo_id: c.combo_id });
      // Only a truck is held on its own (bobtail). A trailer is never held without a truck: it waits in the app (awaitTrailerId).
      if (setCurrentEquipment) await setCurrentEquipment(keep === "truck" ? c.truck_id : null, null);
    } catch { /* the status already saved; the pair can be split from the picker */ }
  }

  // Running a truck with no trailer: In Use, Bobtail.
  async function confirmBobtail() {
    const c = closeAsk;
    setCloseAsk(null);
    if (!c || !selectedTruckId) return;
    try {
      await supabase.rpc("set_equipment_status", { p_unit_kind: "truck", p_unit_id: selectedTruckId, p_status: "in_use", p_sub_status: "Bobtail" });
      if (setCurrentEquipment) await setCurrentEquipment(selectedTruckId, null);
    } catch { /* the truck is still held; the status can be set from STUD */ }
    setAwaitingTrailer(false);
    setPickerOpen(false);
    await refreshAll();
    if (c.then === "main") onClose();
  }

  function confirmPair() {
    const pc = pairConfirm;
    setPairConfirm(null);
    if (!pc) return;
    setAwaitingTruck(false);
    setAwaitingTrailer(false);
    setAwaitTrailerId(null);
    setPickerOpen(false);
    finishCouple(pc.truckId, pc.trailerId, pc.second); // the usual confirms (in use, away, new tare) still apply
  }

  const pairTruck = pairConfirm ? trucks.find((t) => t.truck_id === pairConfirm.truckId)?.truck_name : null;
  const pairTrailer = pairConfirm ? trailers.find((t) => t.trailer_id === pairConfirm.trailerId)?.trailer_name : null;

  return (
    <>
      {/* Which equipment to STUD (only when you hold both). */}
      <UnitPickerSheet
        open={studTargetOpen}
        truckName={truckName}
        trailerName={trailerName}
        title="STUD which equipment?"
        subtitle="Park it with a status. A parked unit is released from you, and the pair comes apart."
        onPickTruck={() => startStud("truck")}
        onPickTrailer={() => startStud("trailer")}
        onPickBoth={() => startStud("both")}
        onCancel={() => setStudTargetOpen(false)}
      />

      {statusTarget && (
        <EquipmentStatusModal
          open={!!statusTarget}
          onClose={() => {
            setStatusTarget(null);
            setStatusFlow(null);
          }}
          companyId={companyId}
          unitKind={statusTarget.kind}
          unitId={statusTarget.id}
          unitName={statusTarget.name}
          pair={statusTarget.pair ?? null}
          currentStatus={statusFlow ? "readyline" : statusTarget.status}
          locationOptional={!!statusFlow}
          allowed={statusFlow ? ["deadline", "readyline"] : undefined}
          currentNotes={statusTarget.notes}
          currentSubStatus={statusTarget.subStatus}
          homeLocalArea={statusTarget.homeLocalArea}
          onSaved={(newStatus) => {
            // Deadline / Readyline release the unit from whoever held it (set_equipment_status), so it is no longer selected: drop it
            // from the local selection AND the parent's combo pointer, then refresh current equipment from the server before the combo
            // list (a stale fallback would show the truck re-paired with an earlier trailer). In Use evicts nothing.
            if (statusFlow === "park_both") {
              // Both parked, uncoupled: you hold nothing.
              const t = statusTarget.pair?.truckId ?? statusTarget.id;
              setSelectedTruckId(null);
              setSelectedTrailerId(null);
              onSelectComboId("");
              setStatusFlow(null);
              void (async () => { await splitPair("truck", t, null); await refreshAll(); })();
              return;
            }
            if (statusFlow === "drop_trailer") {
              // The trailer is parked. With a truck left, pick another trailer for it (or confirm bobtail); with none, you hold nothing.
              const keepTruck = !!selectedTruckId;
              setSelectedTrailerId(null);
              onSelectComboId("");
              setStatusFlow(null);
              if (keepTruck) { setAwaitingTruck(false); setAwaitingTrailer(true); setPickerOpen(true); }
              else { setAwaitingTruck(false); setAwaitTrailerId(null); setPickerOpen(false); }
              void (async () => { await splitPair("trailer", statusTarget.id, keepTruck ? "truck" : null); await refreshAll(); })();
              return;
            }
            if (statusFlow === "park_truck") {
              // The truck is parked. A trailer can't run without one, so pick a new truck for it (the pairing is confirmed); with no
              // trailer left, you hold nothing.
              const keepTrailer = !!selectedTrailerId;
              setSelectedTruckId(null);
              onSelectComboId("");
              setStatusFlow(null);
              if (keepTrailer) { setAwaitingTrailer(false); setAwaitTrailerId(selectedTrailerId); setAwaitingTruck(true); setPickerOpen(true); }
              else { setAwaitingTruck(false); setAwaitTrailerId(null); setPickerOpen(false); }
              void (async () => { await splitPair("truck", statusTarget.id, keepTrailer ? "trailer" : null); await refreshAll(); })();
              return;
            }
            if (newStatus !== "in_use") {
              if (statusTarget.kind === "truck") setSelectedTruckId(null);
              else setSelectedTrailerId(null);
              if (m.selectedComboId) onSelectComboId("");
            }
            void (async () => {
              if (newStatus !== "in_use") await onRefreshCurrentEquipment?.();
              await Promise.all([loadEquipment(), onRefreshCombos()]);
            })();
          }}
        />
      )}

      {/* Confirm the new pairing before it is made. */}
      {pairConfirm && (
        <Sheet title="Confirm the pairing" body={`Pair truck ${pairTruck ?? "?"} with trailer ${pairTrailer ?? "?"}? You'll run them together.`}>
          <button type="button" style={primaryStyle} onClick={confirmPair}>Pair them</button>
          <button type="button" style={optStyle} onClick={() => setPairConfirm(null)}>Cancel</button>
        </Sheet>
      )}

      {/* Closing with a truck and no trailer: confirm the bobtail. */}
      {closeAsk?.kind === "truck_only" && (
        <Sheet title="Run bobtail?" body={`You're keeping truck ${truckName ?? ""} with no trailer. Its status becomes In Use · Bobtail.`}>
          <button type="button" style={primaryStyle} onClick={() => void confirmBobtail()}>Confirm bobtail</button>
          <button type="button" style={optStyle} onClick={() => { const c = closeAsk; setCloseAsk(null); if (c?.then === "main") { setAwaitingTruck(false); setAwaitingTrailer(true); setPickerOpen(true); } }}>Pick a trailer</button>
        </Sheet>
      )}

      {/* Closing with a trailer and no truck: a trailer is never in use without power. */}
      {closeAsk?.kind === "trailer_only" && (
        <Sheet title="This trailer needs a truck" body={`Trailer ${askTrailerName ?? ""} can't be in use without power. Park it with a status, or select a truck for it.`}>
          <button type="button" style={primaryStyle} onClick={() => { const id = closeAsk.trailerId; setCloseAsk(null); if (id) { setStatusFlow("drop_trailer"); openStatusFor("trailer", id); } }}>STUD the trailer</button>
          <button type="button" style={optStyle} onClick={() => { const id = closeAsk.trailerId ?? null; setCloseAsk(null); setAwaitingTrailer(false); setAwaitTrailerId(id); setAwaitingTruck(true); setPickerOpen(true); }}>Select a truck</button>
          <button type="button" style={optStyle} onClick={() => setCloseAsk(null)}>Cancel</button>
        </Sheet>
      )}
    </>
  );
}
