"use client";
// app/planner/modals/binder/types.ts
//
// Part of the Binder (equipment file) dialog.

export type PermitType = {
  permit_type_id: string;
  name: string;
  applies_to: "truck" | "trailer" | "both";
  is_active: boolean;
  // Set for a certification that only matters at one terminal (dispatch checks it).
  terminal_id?: string | null;
};

export type PermitRecord = {
  equipment_permit_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  permit_type_id: string;
  expiration_date: string | null;
  enforcement_date: string | null;
  notes: string | null;
};

export type UnitDetail = {
  year: number | null;
  make: string | null;
  model: string | null;
  vin_number: string | null;
  plate_number: string | null;
  notes: string | null;
  region: string | null;
  local_area: string | null;
};

export type UnitKind = "truck" | "trailer";

export type Row = {
  id: string; // `${unitKind}-${permit_type_id}`
  type: PermitType;
  record: PermitRecord | null;
  daysLeft: number | null;
  expired: boolean;
};

export type CompartmentRow = {
  trailer_id: string;
  comp_number: number;
  max_gallons: number;
  cap_gallons: number | null;
};
