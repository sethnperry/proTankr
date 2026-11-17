"use client";
// app/planner/home/useHome.tsx
//
// All of the Driver Dashboard's state, effects and handlers, in slices that run in this order. Each slice takes
// everything the earlier ones produced and returns it plus its own. HomeView draws the result.
import { useHomeBase } from "./useHomeBase";
import { useHomeDelays } from "./useHomeDelays";
import { useHomeDispatched } from "./useHomeDispatched";
import { useHomeSteps } from "./useHomeSteps";
import { useHomeStamp } from "./useHomeStamp";
import { useHomeRacks } from "./useHomeRacks";
import { useHomeParkAccess } from "./useHomeParkAccess";
import { useHomeSquawk } from "./useHomeSquawk";

export function useHome() {
  const s0 = useHomeBase();
  const s1 = useHomeDelays(s0);
  const s2 = useHomeDispatched(s1);
  const s3 = useHomeSteps(s2);
  const s4 = useHomeStamp(s3);
  const s5 = useHomeRacks(s4);
  const s6 = useHomeParkAccess(s5);
  const s7 = useHomeSquawk(s6);
  return s7;
}
