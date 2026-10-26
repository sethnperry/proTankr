"use client";
// app/planner/modals/ServiceTypeManager.tsx
//
// Service type creation/editing (name + interval + which unit it applies
// to) and the "log a service" form that uses it -- shared by
// SoloEquipmentModal.tsx (solo-tier picker) and EquipmentDetails.tsx
// (fleet-tier TruckModal/TrailerModal). Originally only lived inline inside
// SoloEquipmentModal.tsx, so a fleet (non-solo) company had no way at all
// to create a service type or set its interval -- extracted here 2026-08-07
// per explicit user direction ("make it the same for all... everyone
// should be able to edit") rather than building a second, independently-
// drifting copy for the fleet modal -- exactly the class of bug this
// codebase has hit before whenever a shared UI piece got duplicated
// per-tier (see lib/ui/CustomSelect.tsx's own header comment).
//
// Deliberately NOT role-gated -- unlike the fleet equipment cap/Unit#
// fields (canEditRestricted, admin/lead/dispatch only in EquipmentDetails.tsx),
// service type management has never been role-gated in the solo flow this
// was extracted from, and the user explicitly asked that stay true
// everywhere it's used.



export type { ServiceType } from "./serviceTypes/types";
export { fetchServiceTypes } from "./serviceTypes/helpers";
export { ServiceTypeEditorModal } from "./serviceTypes/ServiceTypeEditorModal";
export { ServiceTypeListModal } from "./serviceTypes/ServiceTypeListModal";
export { ServiceTypeSelect } from "./serviceTypes/ServiceTypeSelect";
export { SimpleServiceModal } from "./serviceTypes/SimpleServiceModal";

