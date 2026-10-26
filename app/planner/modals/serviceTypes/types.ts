"use client";
// app/planner/modals/serviceTypes/types.ts
//
// Part of ServiceTypeManager.tsx.




export type ServiceType = {
  service_type_id: string;
  name: string;
  interval_kind: "miles" | "hours" | "duration" | "none";
  interval_value: number | null;
  applies_to: "truck" | "trailer" | "both";
  is_active: boolean;
};
