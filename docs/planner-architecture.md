# Planner architecture

The Planner (`app/planner/`) has one shape. Build new Planner work in it. A test
(`app/planner/architecture.test.ts`, run by `npm test`) enforces the parts that can be checked.

## The shape

```
PlannerHost.tsx            36 lines. usePlannerModel() -> <PlannerProvider> -> page + flows. No logic.
model/                     The composition. Four layers plus the file that stitches them.
  usePlannerModel.ts         calls the layers in order and merges their results
  usePlannerView.ts          where we are: route, orientation, landing, leave-navigation
  usePlanModel.ts            the live plan, its inputs, saved plans, density and weight math
  useLoadModel.ts            beginning a load, Plan Review, suppliers, trip, terminal switch, reports
  usePlanPageModel.ts        plan-slot view, plan builder, unsaved-changes state
hooks/                     One concern each. Explicit inputs, explicit results. No JSX in .ts files.
utils/, lib/               Pure logic, no React, tested.
flows/                     One window each. Zero props. Read usePlanner(), render a modal component.
components/                Presentational pieces. PlanPage and a few others read usePlanner() for layout.
modals/                    Presentational windows: props in, events out. No data fetching of their own
                           beyond what they already do; new ones should not fetch.
PlannerContext.tsx         PlannerCtx = the type of what usePlannerModel() returns. Nothing declared twice.
```

Data flows one way: shell -> view -> plan -> load -> page -> context -> flows and PlanPage.
A layer may read earlier layers, never later ones.

## Rules

1. **The host stays under 60 lines and has no state.** If it needs state, the state belongs in a hook.
2. **A layer in `model/` stays under 300 lines.** Over that, split the layer by concern.
3. **No JSX in `model/`.** Layers return values and actions. Elements are built by components.
4. **`model/` imports only types from components and flows.**
5. **A flow is a zero-prop component** that reads `usePlanner()` and renders a presentational modal.
   Mount it in the host; it can then open from any screen.
6. **A new hook does one thing**, takes its inputs as a typed object, and returns what callers need.
   It does not reach into another hook's locals.
7. **Do not add a field to the context by hand.** Return it from the layer that owns it.
8. **Comments say why, briefly.** No history of how the code got here; that is in git.

## Adding something

- A new window: write the modal (props in, events out), write a zero-prop flow, mount it in the host.
- New plan state or math: add to the layer it belongs to, or a new hook that layer calls.
- New page layout: a component that reads `usePlanner()`.
- A new layer only when an existing one would pass 300 lines.

## Known leftovers

Several older hooks still import from `components/` (`useLoadBegin`, `usePlannerSuppliers`,
`useTripEquipment`). Rule 4 applies to `model/` only for now. Large modals
(`SoloEquipmentModal`, `LoadingModal`, `BinderModal`) are not yet split.
