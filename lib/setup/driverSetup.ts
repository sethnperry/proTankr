// lib/setup/driverSetup.ts
//
// The driver setup checklist: which steps exist, which count for this driver, and how far along they are.
// Pure: it takes a snapshot of facts (already loaded from the database) and the driver's confirmations, and
// returns the steps with a status each plus the counter ("6 of 12"). The same function feeds the driver's own
// Setup screen and the admin's roster, so the two can never disagree.
//
// Statuses
//   needs    required data is missing; the driver has to enter it (cannot be skipped)
//   confirm  fleet only: the data is there (an admin set it) but the driver has not said "looks right" yet
//   open     optional and not done yet (can be skipped, stays visible)
//   done     complete (data present and, where a confirmation applies, confirmed)
//   na       does not apply to this driver or company; left out of the counter

export type StepId =
  | "you" | "license" | "schedule" | "equipment" | "plans" | "terminals"
  | "locations" | "fuel_pin" | "alerts" | "hours" | "per_diem" | "vault";

export type StepStatus = "needs" | "confirm" | "open" | "done" | "na";

export type StepDef = { id: StepId; label: string; sub: string; required: boolean; confirmable: boolean };

// Order is the order the driver walks them. Only what the app cannot run without is `required` (who you are, and
// your truck); license, plans and the rest are optional. `required` steps can't be skipped. `confirmable` steps are ones
// an admin can preset on a fleet; the driver then only confirms them.
export const STEPS: StepDef[] = [
  { id: "you", label: "You", sub: "Name, employee number, region and local area", required: true, confirmable: true },
  { id: "license", label: "License and medical", sub: "Numbers and expiry dates, so the alerts work", required: false, confirmable: true },
  { id: "schedule", label: "Work schedule", sub: "The days and shift you usually work", required: false, confirmable: true },
  { id: "equipment", label: "Equipment", sub: "Your truck and trailer", required: true, confirmable: true },
  { id: "plans", label: "Load plans", sub: "At least one plan in Plan A to Z", required: false, confirmable: false },
  { id: "terminals", label: "Terminals", sub: "Star the terminals you use and add your cards", required: false, confirmable: false },
  { id: "locations", label: "Delivery locations", sub: "Star the stores you deliver to most", required: false, confirmable: false },
  { id: "fuel_pin", label: "Fuel PIN", sub: "Your PIN for the company fuel program", required: false, confirmable: false },
  { id: "alerts", label: "Alerts", sub: "Turn on notifications for hours and call-outs", required: false, confirmable: false },
  { id: "hours", label: "Hours", sub: "Connect your own login for your hours", required: false, confirmable: false },
  { id: "per_diem", label: "Per diem", sub: "Your home location", required: false, confirmable: false },
  { id: "vault", label: "Vault", sub: "Set your pattern lock", required: false, confirmable: false },
];

export type SetupFacts = {
  /** Solo drivers set everything up themselves; fleet drivers confirm what the admin preset. */
  tier: "solo" | "fleet";
  profile: { displayName?: string | null; employeeNumber?: string | null; region?: string | null; localArea?: string | null };
  /** Fleet companies with no regions or local areas defined can't require them. */
  regionsDefined: boolean;
  license: { number?: string | null; expiry?: string | null };
  medical: { expiry?: string | null };
  /** Number of weekdays marked as worked on the driver's schedule. */
  scheduleDays: number;
  hasTruck: boolean;
  hasTrailer: boolean;
  plansSaved: number;
  terminalsStarred: number;
  locationsStarred: number;
  /** The company has a fuel program that uses a PIN (RFID or company account). */
  fuelProgram: boolean;
  hasFuelPin: boolean;
  pushSupported: boolean;
  pushOn: boolean;
  /** The company is connected to a telematics provider. */
  telematicsConnected: boolean;
  hoursLinked: boolean;
  hasPerDiemHome: boolean;
  vaultSet: boolean;
};

/** step id -> ISO time the driver confirmed (or saved) it. Missing or null = not confirmed. */
export type Confirmations = Partial<Record<StepId, string | null>>;

export type SetupStep = StepDef & { status: StepStatus; detail: string; confirmedAt: string | null };

export type SetupSummary = {
  steps: SetupStep[];
  /** Steps that count for this driver (everything that is not "na"). */
  total: number;
  done: number;
  /** Required steps still not done (needs or confirm). The guided walk can't finish until this is 0. */
  requiredLeft: number;
  /** First step that still needs the driver, required ones first. */
  next: StepId | null;
  complete: boolean;
};

const has = (v: string | null | undefined) => !!(v ?? "").trim();

/** Does the step's data exist, and what is missing? Returns [present, what's missing]. */
function dataState(id: StepId, f: SetupFacts): { present: boolean; missing: string } {
  switch (id) {
    case "you": {
      const miss: string[] = [];
      if (!has(f.profile.displayName)) miss.push("name");
      // Payroll and dispatch use the employee number; a solo driver has neither.
      if (f.tier === "fleet" && !has(f.profile.employeeNumber)) miss.push("employee number");
      if (f.regionsDefined || f.tier === "fleet") {
        if (!has(f.profile.region)) miss.push("region");
        if (!has(f.profile.localArea)) miss.push("local area");
      }
      return { present: miss.length === 0, missing: miss.join(", ") };
    }
    case "license": {
      const miss: string[] = [];
      if (!has(f.license.number)) miss.push("license number");
      if (!has(f.license.expiry)) miss.push("license expiry");
      if (!has(f.medical.expiry)) miss.push("medical expiry");
      return { present: miss.length === 0, missing: miss.join(", ") };
    }
    case "schedule": return { present: f.scheduleDays > 0, missing: "no days set" };
    case "equipment": return { present: f.hasTruck, missing: "no truck selected" };
    case "plans": return { present: f.plansSaved > 0, missing: "no plan saved" };
    case "terminals": return { present: f.terminalsStarred > 0, missing: "none starred" };
    case "locations": return { present: f.locationsStarred > 0, missing: "none starred" };
    case "fuel_pin": return { present: f.hasFuelPin, missing: "no PIN saved" };
    case "alerts": return { present: f.pushOn, missing: "notifications off" };
    case "hours": return { present: f.hoursLinked, missing: "not connected" };
    case "per_diem": return { present: f.hasPerDiemHome, missing: "no home set" };
    case "vault": return { present: f.vaultSet, missing: "no pattern set" };
  }
}

function applies(id: StepId, f: SetupFacts): boolean {
  switch (id) {
    case "schedule": return f.tier === "fleet"; // a solo driver has no one to schedule them
    case "fuel_pin": return f.fuelProgram;
    case "alerts": return f.pushSupported;
    case "hours": return f.telematicsConnected;
    default: return true;
  }
}

export function computeSetup(f: SetupFacts, confirmations: Confirmations = {}): SetupSummary {
  const steps: SetupStep[] = STEPS.map((def) => {
    const confirmedAt = confirmations[def.id] ?? null;
    if (!applies(def.id, f)) return { ...def, status: "na", detail: "Not used by your company", confirmedAt };
    const d = dataState(def.id, f);
    // A fleet driver has to say "looks right" to anything an admin may have preset, even when it is complete.
    const needsConfirm = f.tier === "fleet" && def.confirmable;
    let status: StepStatus;
    let detail: string;
    if (!d.present) {
      status = def.required ? "needs" : "open";
      detail = def.required ? `Needed: ${d.missing}` : d.missing[0].toUpperCase() + d.missing.slice(1);
    } else if (needsConfirm && !confirmedAt) {
      status = "confirm";
      detail = "Set for you. Check it and confirm";
    } else {
      status = "done";
      detail = needsConfirm ? "Confirmed" : "Done";
    }
    return { ...def, status, detail, confirmedAt };
  });

  const counted = steps.filter((s) => s.status !== "na");
  const done = counted.filter((s) => s.status === "done").length;
  const requiredLeft = counted.filter((s) => s.required && s.status !== "done").length;
  // Required first, then the rest, each in walking order.
  const open = (s: SetupStep) => s.status !== "done" && s.status !== "na";
  const next = steps.find((s) => s.required && open(s))?.id ?? steps.find(open)?.id ?? null;
  return { steps, total: counted.length, done, requiredLeft, next, complete: counted.length > 0 && done === counted.length };
}

/** "6 of 12" for the dashboard row and the admin roster. */
export function counterText(s: Pick<SetupSummary, "done" | "total">): string {
  return `${s.done} of ${s.total}`;
}

/** What the admin sees for one driver: the counter plus what is blocking them. */
export function adminLine(s: SetupSummary): { text: string; tone: "ok" | "warn" | "bad" } {
  if (s.complete) return { text: `${counterText(s)} complete`, tone: "ok" };
  if (s.requiredLeft > 0) return { text: `${counterText(s)} · ${s.requiredLeft} required left`, tone: "bad" };
  return { text: `${counterText(s)} · only optional steps left`, tone: "warn" };
}

/** A saved plan is one with at least one product in it (slots 1 to 5; slot 0 is the live draft). */
export function planHasProduct(payload: unknown): boolean {
  const cp = (payload as { compPlan?: Record<string, { productId?: string | null; empty?: boolean }> } | null)?.compPlan;
  return !!cp && Object.values(cp).some((c) => !!c?.productId && !c?.empty);
}
