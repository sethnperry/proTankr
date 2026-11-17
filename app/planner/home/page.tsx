"use client";
// app/planner/home/page.tsx
//
// Driver dashboard: where the driver's trip stands, one big button for the next step, and the everyday tools
// underneath. The work is split: useHome.tsx holds the state and handlers, HomeView.tsx draws it, homeShared.tsx
// holds the small pieces both use. See docs/trip-workflow-design.md §9 and §14.
import { useHome } from "./useHome";
import { HomeView } from "./HomeView";

export default function HomePage() {
  return <HomeView h={useHome()} />;
}
