"use client";
// app/planner/modals/scaleHistory/types.ts
//
// Part of ScaleHistoryModal.tsx.




export type WeightRecordRaw = {
  weight_record_id: string;
  combo_id: string;
  load_id: string | null;
  heavy_weight_lbs: number;
  light_weight_lbs: number;
  net_weight_lbs: number;
  planner_weight_lbs: number | null;
  prior_tare_lbs: number | null;
  tare_updated: boolean;
  notes: string | null;
  recorded_at: string;
  created_by: string | null;
};

export type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  comboId: string | null;
  onChanged?: () => void;
  truckName?: string | null;
  trailerName?: string | null;
};
