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

Layers 1 and 2 are done for everything above. The host is still 2,100 lines
because the remaining model hooks (plan slots wiring, load workflow glue, the
LOAD to stale-API to begin sequence) are composed in the host, and the flows
(`LoadingModal` with 44 props, `ProductTempModal` 17, `TerminalCatalogModal` 18)
still take their data as props.

## Next steps

1. `PlannerProvider` and `usePlanner()`: compose the model hooks once, in order,
   and expose the result through context.
2. Flows read from `usePlanner()` instead of props. Start with `LoadingModal`
   (44 props), then `ProductTempModal`, `StaleApiOverlay`, `CancelLoadSheet`,
   `TerminalSwitchDuringLoadSheet`.
3. Host becomes a list of mounted flows.

Each step ships on its own and is checked in a browser before the next.
