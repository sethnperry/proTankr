# Planner architecture

The goal: every Planner window (Plan Builder, Plan Review, load report, terminal
switch, stale-API choice, temperature confirm, supplier picker) can be opened from
any screen by rendering it. None of them is wired by props from one big component.

## Layers

1. **Model** (`app/planner/hooks/`): state and derived values, one hook per concern.
   Each takes explicit inputs and returns results. No hook reaches into another
   hook's locals.
   - `usePlannerEquipment` compartments, truck and trailer names, saddle tank
   - `useTerminalProducts` rack products and readings
   - `usePlanInputs` dial temperature, per-product temperature, CG
   - `usePlanDirty` unsaved-changes check
   - `usePlanMath` density, caps, weight limits, capacity, live weight
   - `usePlanSlots` saved plans A-E, restore, trailer defaults
   - `useTripLoading` how a load attaches to the open trip, Finish Loading prompts
   - `usePlannerSuppliers` supplier picks and switching
   - `useTerminalSwitchDuringLoad` leaving a rack mid-load
   - `useLoadReportLauncher` opening a finished load's report
2. **Pure logic** (`app/planner/utils/`, `lib/trips/`): no React, tested.
   `tuneRows`, `staleApi`, `planMatch`, `apiBasis`, `planMath`.
3. **Flows** (`app/planner/components/`, `app/planner/modals/`): one component per
   window. Target: zero props for the data they need, read from the planner
   context.
4. **Host** (`PlannerHost.tsx`): mounts the flows. Target: under 300 lines.

## Where we are

Layers 1 and 2 are done. Layer 3 is done: every Planner window is a zero-prop
flow in `app/planner/flows/` that reads `usePlanner()`:

- `PlanReviewFlow` (Plan Review and the load report)
- `TerminalSwitchFlow`, `ReportIssueFlow`, `StaleApiFlow`, `RecallEquipmentFlow`,
  `TempConfirmFlow`
- `PlanSlotsFlow`, `CompartmentFlow`, `PlanBuilderFlow`

`PlannerContext.tsx` declares what the flows can read (`PlannerCtx`).

## What is left

`PlannerHost.tsx` is about 620 lines (down from about 4,000). Handlers live in hooks
(`usePlanSlotsView`, `useLoadBegin`, `useLoadPrep`, `usePlanTemperature`,
`useUnavailableProducts`, `usePlannerIntents`, `usePlannerLanding`, `useLeaveTo`,
`useHeaderIconsSlot`); the plan page is `PlanCompartmentsSection` and
`PlanActionsSection`; `PlannerGates` and `PartialEquipmentPanel` are components.
What remains in the host: the state declarations, the `usePlanSlots` and
`useLoadWorkflow` wiring, and the context object. To get under 300:

1. Move the stale-API / tune / modal state declarations into the hooks that use them.
2. Build `plannerCtx` inside a `usePlannerContext` hook.
