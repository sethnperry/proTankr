"use client";
// app/planner/modals/binder/UnitSection.tsx
//
// Part of the Binder (equipment file) dialog.

import TruckFuelTankField from "@/lib/ui/driver/TruckFuelTankField";
import { useMemo, useState } from "react";
import { ServiceTypeListModal } from "../ServiceTypeManager";
import { AddDocumentSheet, CameraButton } from "../../components/equipment/AddDocumentSheet";
import { usePermitAttachments } from "@/lib/ui/driver/DocHub";

import type { PermitType, PermitRecord, UnitDetail, UnitKind, Row } from "./types";
import { daysUntil } from "./helpers";
import { saveBtnStyle, cancelBtnStyle, navBtnStyle } from "./styles";
import { RequiredFieldsBlock } from "./RequiredFieldsBlock";
import { UnitInfoRow } from "./UnitInfoRow";
import { CompartmentsSection } from "./CompartmentsSection";
import { PermitRow } from "./PermitRow";

// 2026-08-29 follow-up: restructured to match the Add/Edit Truck/Trailer
// modal's own shape exactly, per explicit direction ("match the edit
// truck modal to the add truck modal... same thing with service
// Schedule etc. just a different name") -- front page (Required Fields,
// unchanged from the prior pass) + Service Schedule / Details →/ Save &
// Close, with everything else (VIN/Plate/Notes, Compartments, the permit
// + attachment list) behind Details, same "front page vs. Details"
// pattern EquipmentDetails.tsx's TruckModal/TrailerModal already
// established.
//
// Service Schedule opens ServiceTypeListModal (types + intervals only,
// same as the Add/Edit modal's own button) per the same-day clarification
// this codebase's other Service Schedule buttons already got fixed to
// match: "this is where we determine service types and the intervals...
// we record the service from the main modal service button." Recording
// an actual service stays exactly where it already was -- the main
// equipment picker's own "Service" button -- untouched by this file.
export function UnitSection({
  unitKind,
  unitId,
  unitName,
  companyId,
  types,
  records,
  detail,
  expandedId,
  onToggleExpand,
  onEditType,
  onAddType,
  onSaved,
  onClose,
  myRole,
}: {
  unitKind: UnitKind;
  unitId: string;
  unitName: string;
  companyId: string;
  types: PermitType[];
  records: PermitRecord[];
  detail: UnitDetail | null;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEditType: (t: PermitType) => void;
  onAddType: () => void;
  onSaved: () => void;
  onClose: () => void;
  myRole?: string | null;
}) {
  const { pagesFor, hasDoc, reload: reloadDocs } = usePermitAttachments(unitKind, unitId, companyId);
  const [screen, setScreen] = useState<"front" | "details">("front");
  const [serviceOpen, setServiceOpen] = useState(false);
  const [docFiles, setDocFiles] = useState<File[] | null>(null);

  const rows: Row[] = useMemo(() => {
    const applicable = types.filter((t) => {
      const usable = t.applies_to === unitKind || t.applies_to === "both";
      if (!usable) return false;
      if (t.is_active) return true;
      // Inactive types still show if this unit already has a recorded date --
      // deactivating only stops future selection, doesn't hide history.
      return records.some(
        (r) => r.permit_type_id === t.permit_type_id && (unitKind === "truck" ? r.truck_id === unitId : r.trailer_id === unitId),
      );
    });
    return applicable
      .map((t) => {
        // Registration/Annual Inspection share one permit_type_id across both
        // unit types (applies_to='both'), so matching by permit_type_id alone
        // would grab whichever unit's record happens to come first in the
        // combined list -- must also check the record actually belongs to
        // *this* unit.
        const record =
          records.find(
            (r) => r.permit_type_id === t.permit_type_id && (unitKind === "truck" ? r.truck_id === unitId : r.trailer_id === unitId),
          ) ?? null;
        const daysLeft = record?.expiration_date ? daysUntil(record.expiration_date) : null;
        return { id: `${unitKind}-${t.permit_type_id}`, type: t, record, daysLeft, expired: daysLeft != null && daysLeft < 0 };
      })
      .sort((a, b) => {
        const aNone = a.daysLeft == null,
          bNone = b.daysLeft == null;
        if (aNone !== bNone) return aNone ? 1 : -1;
        if (aNone && bNone) return a.type.name.localeCompare(b.type.name);
        return (a.daysLeft as number) - (b.daysLeft as number);
      });
  }, [types, records, unitKind, unitId]);

  return (
    <div style={{ marginBottom: 18 }}>
      {screen === "front" ? (
        <>
          <RequiredFieldsBlock
            unitKind={unitKind}
            unitId={unitId}
            unitName={unitName}
            companyId={companyId}
            detail={detail}
            onSaved={onSaved}
            myRole={myRole}
          />
          {unitKind === "truck" && <TruckFuelTankField truckId={unitId} />}
          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={() => setServiceOpen(true)} style={navBtnStyle}>
              Service Schedule
            </button>
            <button type="button" onClick={() => setScreen("details")} style={navBtnStyle}>
              Details →
            </button>
          </div>
          {/* Everything below Required Fields already autosaves per field
              (RequiredFieldsBlock's own Save, each permit row's own Save,
              etc.) -- there's nothing left pending to batch-commit, so
              "Save & Close" here is really just Close, styled the same as
              the Add/Edit Truck/Trailer modal's own button for visual
              consistency. No separate Cancel either, for the same reason
              -- there's nothing uncommitted to discard. */}
          <button type="button" onClick={onClose} style={{ ...saveBtnStyle, marginTop: 8 }}>
            Save & Close
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setScreen("front")}
            style={{ ...cancelBtnStyle, width: "auto", padding: "6px 12px", fontSize: 11, marginBottom: 14 }}
          >
            ← Back
          </button>

          <UnitInfoRow
            unitKind={unitKind}
            unitId={unitId}
            detail={detail}
            isExpanded={expandedId === `${unitKind}-info`}
            onToggleExpand={() => onToggleExpand(`${unitKind}-info`)}
            onSaved={onSaved}
          />
          {unitKind === "trailer" && <CompartmentsSection trailerId={unitId} expandedId={expandedId} onToggleExpand={onToggleExpand} />}
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
              margin: "18px 0 8px",
            }}
          >
            Documents · {rows.length}
          </div>
          {rows.map((row) => (
            <PermitRow
              key={row.id}
              row={row}
              unitKind={unitKind}
              unitId={unitId}
              companyId={companyId}
              isExpanded={expandedId === row.id}
              onToggleExpand={() => onToggleExpand(row.id)}
              onEditType={() => onEditType(row.type)}
              hasDoc={hasDoc(row.type.permit_type_id)}
              pages={pagesFor(row.type.permit_type_id)}
              onDocsChanged={reloadDocs}
              onSaved={onSaved}
            />
          ))}
          <CameraButton
            onFile={(files) => setDocFiles(files)}
            style={{
              display: "block",
              borderRadius: 2,
              border: "1px dashed rgba(255,255,255,0.3)",
              padding: "14px 12px",
              textAlign: "center" as const,
              fontSize: 14,
              fontWeight: 800,
              color: "rgba(255,255,255,0.7)",
              marginTop: 4,
            }}
          >
            + Document
          </CameraButton>
          {docFiles && (
            <AddDocumentSheet
              open
              onClose={() => setDocFiles(null)}
              companyId={companyId}
              unitKind={unitKind}
              unitId={unitId}
              unitName={unitName}
              initialFiles={docFiles}
              onSaved={() => {
                reloadDocs();
                onSaved();
              }}
            />
          )}
        </>
      )}

      <ServiceTypeListModal open={serviceOpen} onClose={() => setServiceOpen(false)} companyId={companyId} unit={unitKind} />
    </div>
  );
}

// ─── Document thumbnail (replaces the paperclip) ────────────────────────────
// The first page as a small preview, with a page count when there are several.
// Tapping it opens the viewer. No document yet shows a dashed placeholder.
