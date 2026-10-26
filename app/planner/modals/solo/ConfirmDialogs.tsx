"use client";
// app/planner/modals/solo/ConfirmDialogs.tsx
//
// Deadline, away, commandeer, remove and new-tare confirmations.

import type { SoloModel } from "./useSoloEquipment";

export function ConfirmDialogs({ m }: { m: SoloModel }) {
  const {
    awayConfirmTarget,
    busy,
    combos,
    commandeerTarget,
    confirmAway,
    confirmCommandeer,
    confirmDeadline,
    confirmRemove,
    deadlineConfirmTarget,
    driverHomeRegion,
    newTareInput,
    newTareTarget,
    removeTarget,
    selectedComboId,
    setAwayConfirmTarget,
    setCommandeerTarget,
    setDeadlineConfirmTarget,
    setNewTareInput,
    setNewTareTarget,
    setRemoveTarget,
    setSelectedTrailerId,
    setSelectedTruckId,
    submitNewTare,
  } = m;
  return (
    <>
      {/* ── Deadline confirmation -- selecting a truck/trailer flagged
          Deadline. A warning, not a hard block (confirmDeadline continues
          into the away/commandeer chain, same as any other selection). ── */}
      {deadlineConfirmTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
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
              border: "1px solid rgba(248,113,113,0.4)",
              borderRadius: 2,
              padding: 20,
              width: "100%",
              maxWidth: 400,
              boxSizing: "border-box" as const,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>This {deadlineConfirmTarget.kind} is Deadlined</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 18 }}>
              {deadlineConfirmTarget.notes || "No notes on file."} Couple it anyway?
            </div>
            {/* Same flex:1 basis + explicit nowrap so "Couple It" can never
                wrap onto a second line and grow taller than "Cancel" --
                both buttons stay identical width AND height. */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setDeadlineConfirmTarget(null)}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px 8px",
                  borderRadius: 2,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  cursor: "pointer",
                  whiteSpace: "nowrap" as const,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeadline}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px 8px",
                  borderRadius: 2,
                  border: "none",
                  background: "#fff",
                  color: "#000",
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap" as const,
                  fontSize: 14,
                }}
              >
                Couple It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Away-from-home confirmation -- selecting a truck/trailer whose
          home region differs from the driver's own. Checked before the
          commandeer check (confirmAway continues into that same check), so
          a unit that's both away and claimed by someone else surfaces both
          warnings in sequence. ── */}
      {awayConfirmTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div style={{ background: "#151515", border: "1px solid rgba(251,146,60,0.35)", borderRadius: 2, padding: 20, maxWidth: 360 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Couple this {awayConfirmTarget.kind}?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 18 }}>
              This {awayConfirmTarget.kind} is home to {awayConfirmTarget.unitRegion}, not your {driverHomeRegion} area. Couple it anyway?
              It'll show as borrowed to both areas until it's returned.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setAwayConfirmTarget(null)}
                disabled={busy}
                style={{
                  flex: 1,
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
              <button
                type="button"
                onClick={confirmAway}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 2,
                  border: "none",
                  background: "#fff",
                  color: "#000",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Couple It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Commandeer confirmation -- selecting a truck/trailer another
          driver currently has claimed. couple_combo's p_force:true would
          otherwise silently force-decouple it with no warning at all. ── */}
      {commandeerTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 20, maxWidth: 360 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Take this {commandeerTarget.kind}?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 18 }}>
              This {commandeerTarget.kind} is currently {commandeerTarget.ownerName}'s. Take it? They'll keep their{" "}
              {commandeerTarget.kind === "truck" ? "trailer" : "truck"}.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setCommandeerTarget(null)}
                disabled={busy}
                style={{
                  flex: 1,
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
              <button
                type="button"
                onClick={confirmCommandeer}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 2,
                  border: "none",
                  background: "#fff",
                  color: "#000",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Take it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove confirmation ── */}
      {removeTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 20, maxWidth: 360 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Delete this unit?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 18 }}>
              This permanently removes {removeTarget.name} and its full service and wash history. This can't be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={busy}
                style={{
                  flex: 1,
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
              <button
                aria-busy={!!busy}
                type="button"
                onClick={confirmRemove}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 2,
                  border: "1px solid rgba(220,60,60,0.5)",
                  background: "rgba(180,40,40,0.25)",
                  color: "#fca5a5",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New pairing needs a one-time tare weight (no history for this exact truck+trailer pair) ── */}
      {newTareTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
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
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>New Pairing</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 14 }}>
              This truck and trailer haven't been paired before. Enter the tare weight from a certified scale ticket.
            </div>
            <input
              type="number"
              inputMode="numeric"
              placeholder="e.g. 34800"
              autoFocus
              value={newTareInput}
              onChange={(e) => setNewTareInput(e.target.value)}
              style={{
                width: "100%",
                borderRadius: 2,
                padding: "12px 14px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.28)",
                color: "#fff",
                fontSize: 18,
                fontWeight: 700,
                boxSizing: "border-box",
                marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setNewTareTarget(null);
                  setNewTareInput("");
                  // Revert local selection to whatever's actually paired --
                  // otherwise the cards would show connected with no real
                  // combo behind them.
                  const current = combos.find((c) => String(c.combo_id) === String(selectedComboId));
                  setSelectedTruckId(current?.truck_id ?? null);
                  setSelectedTrailerId(current?.trailer_id ?? null);
                }}
                style={{
                  flex: 1,
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
              <button
                aria-busy={!!busy}
                type="button"
                onClick={submitNewTare}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 2,
                  border: "none",
                  background: "#fff",
                  color: "#000",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {busy ? "Pairing…" : "Couple & Select"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
