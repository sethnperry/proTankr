"use client";
// lib/ui/equipmentTools.ts — the Driver Dashboard registers what Inspect and Truck down do; the shared Equipment
// modal (mounted in the layout, opened from several screens) shows those two buttons only while a page has
// registered them.
import { useSyncExternalStore } from "react";

export type EquipmentTools = { onInspect?: () => void; onTruckDown?: () => void };
let current: EquipmentTools | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setEquipmentTools(t: EquipmentTools | null) { current = t; emit(); }
export function useEquipmentTools(): EquipmentTools | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => null);
}
