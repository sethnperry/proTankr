"use client";
// app/planner/modals/solo/useSoloEquipment.ts
//
// The Equipment modal model: five layers composed in dependency order.

import { useSoloState } from "./useSoloState";
import { useSoloData } from "./useSoloData";
import { useSoloCoupling } from "./useSoloCoupling";
import { useSoloActions } from "./useSoloActions";
import { useSoloDerived } from "./useSoloDerived";
import type { Props } from "./types";

export function useSoloEquipment(props: Props) {
  const s = useSoloState(props);
  const d = useSoloData(props, s);
  const c = useSoloCoupling(props, s, d);
  const a = useSoloActions(props, s, d, c);
  const v = useSoloDerived(props, s, d, c, a);
  return { ...s, ...d, ...c, ...a, ...v };
}

export type SoloModel = ReturnType<typeof useSoloEquipment>;
