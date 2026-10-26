"use client";
// app/planner/modals/serviceTypes/helpers.ts
//
// Part of ServiceTypeManager.tsx.

import React from "react";
import { supabase } from "@/lib/supabase/client";

import type { ServiceType } from "./types";

export const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.45)" };

export const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.28)", color: "#fff", fontSize: 15, boxSizing: "border-box",
};

export const saveBtnStyle: React.CSSProperties = {
  width: "100%", padding: "14px 18px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.4)' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 14px center",
  paddingRight: 36,
};

// Fetches fresh from the DB every call rather than relying on caller-held
// state -- a caller that just created/edited a type wants the very next
// read to reflect it, not a stale closure (same reasoning SoloEquipmentModal's
// own loadServiceAndWash comment documents for the sibling due-computation
// fetch).
export async function fetchServiceTypes(companyId: string): Promise<ServiceType[]> {
  const { data } = await supabase
    .from("service_types")
    .select("service_type_id, name, interval_kind, interval_value, applies_to, is_active")
    .eq("company_id", companyId)
    .order("name");
  return (data ?? []) as ServiceType[];
}

// ─── Create/edit a service type (name, interval, which unit it applies to) ──
