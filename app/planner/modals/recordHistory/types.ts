"use client";
// app/planner/modals/recordHistory/types.ts
//
// Part of RecordHistoryModal.tsx.




export type RecordHistoryKind = "service" | "wash";

export type ServiceRecordRaw = {
  service_record_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  service_type_id: string;
  date: string;
  shop_name: string | null;
  location: string | null;
  reading_value: number | null;
  notes: string | null;
  created_by: string | null;
};

export type WashRecordRaw = {
  wash_record_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  location: string | null;
  washed_at: string;
  notes: string | null;
  created_by: string | null;
};

export type ServiceTypeRaw = {
  service_type_id: string;
  name: string;
  interval_kind: "miles" | "hours" | "duration" | "none";
  interval_value: number | null;
  applies_to: "truck" | "trailer" | "both";
  is_active: boolean;
};

export type UnitRef = { id: string; label: "Truck" | "Trailer"; name: string };

export type ServiceRow = {
  id: string;
  date: string;
  unit: UnitRef;
  serviceTypeId: string;
  typeName: string;
  companion: UnitRef | null; // set when this record only exists because it tagged along with the other unit
  readingValue: number | null;
  shopName: string | null;
  location: string | null;
  notes: string | null;
  createdBy: string | null;
};

export type WashRow = {
  id: string;
  date: string; // washed_at
  unit: UnitRef;
  location: string | null;
  notes: string | null;
  createdBy: string | null;
};

export type Props = {
  open: boolean;
  onClose: () => void;
  kind: RecordHistoryKind;
  title: string;
  companyId: string;
  truckId: string | null;
  trailerId: string | null;
  trucks: { truck_id: string; truck_name: string }[];
  trailers: { trailer_id: string; trailer_name: string }[];
  onChanged?: () => void; // fired after an edit/delete so the parent can refresh its report lines
};
