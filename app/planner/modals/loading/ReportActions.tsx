"use client";
// app/planner/modals/loading/ReportActions.tsx
//
// Load report: return, edit, delete and arrive buttons.

import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../../cards/cardTheme";
import type { LoadingModel } from "./useLoadingModel";

export function ReportActions({ m }: { m: LoadingModel }) {
  const {
    confirmDelete,
    deleteBusy,
    deleteError,
    editMenuOpen,
    onClose,
    onDeleteLoad,
    onNewLoad,
    report,
    returnLabel,
    setConfirmDelete,
    setEditMenuOpen,
    startEditSequence,
    styles,
    trip,
  } = m;
  if (!report) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      {deleteError ? (
        <div
          style={{
            borderRadius: 2,
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.10)",
            padding: "10px 12px",
            color: "rgba(255,210,210,0.95)",
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {deleteError}
        </div>
      ) : null}

      {trip ? (
        <button type="button" onClick={trip.onArrivedAtDelivery} style={{ ...(styles as any).doneBtn, width: "100%" }}>
          Arrive at Delivery
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            onClose();
            onNewLoad?.();
          }}
          style={{ ...(styles as any).doneBtn, width: "100%" }}
        >
          {returnLabel ?? "Return to Planner"}
        </button>
      )}

      {/* Edit opens a small menu; Delete lives inside it so it can't be
                tapped by accident from the report itself. */}
      {!editMenuOpen ? (
        <button
          type="button"
          onClick={() => {
            setEditMenuOpen(true);
            setConfirmDelete(false);
          }}
          disabled={Boolean(deleteBusy)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 2,
            border: CARD_BORDER,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
            color: "rgba(255,255,255,0.90)",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            opacity: deleteBusy ? 0.55 : 1,
          }}
        >
          Edit Load
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 10,
            borderRadius: 2,
            border: CARD_BORDER,
            background: CARD_BG,
            boxShadow: CARD_SHADOW,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setEditMenuOpen(false);
              startEditSequence();
            }}
            disabled={Boolean(deleteBusy)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.92)",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Edit Details
          </button>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                aria-busy={!!deleteBusy}
                type="button"
                onClick={() => onDeleteLoad?.()}
                disabled={Boolean(deleteBusy)}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 2,
                  border: "1px solid rgba(239,68,68,0.4)",
                  background: "rgba(239,68,68,0.15)",
                  color: "#fca5a5",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: deleteBusy ? 0.6 : 1,
                }}
              >
                {deleteBusy ? "Deleting…" : "Confirm Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={Boolean(deleteBusy)}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 2,
                  border: CARD_BORDER,
                  background: "transparent",
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={Boolean(deleteBusy)}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 2,
                border: "1px solid rgba(239,68,68,0.25)",
                background: "transparent",
                color: "#f87171",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Delete Load
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditMenuOpen(false);
              setConfirmDelete(false);
            }}
            disabled={Boolean(deleteBusy)}
            style={{
              width: "100%",
              padding: "6px 0",
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.45)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}

      {trip && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onNewLoad?.();
            trip.onBackToDashboard?.();
          }}
          style={{
            width: "100%",
            padding: "10px 0",
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.40)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
      )}
    </div>
  );
}
