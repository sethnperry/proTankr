// lib/recap/types.ts
//
// The Weekly Recap: how well each driver used last week's on-duty time, and where the delays came from.
// Everything here is plain data in and out (no database, no clock), so the whole report can be tested.

import type { Shift } from "../shifts/shiftLogic.ts";
import type { LoggedDelay } from "../trips/delays.ts";

export type SegType = "rack" | "loaded_leg" | "drop" | "empty_leg" | "fuel" | "gray";
export type GrayKind = "start" | "between" | "end";

/** The admin-set numbers the whole report follows (Company dashboard, Time allowances). */
export type RecapSettings = {
  startAllowanceMin: number;       // shift start to the first event: assumed pre-trip, credited
  betweenAllowanceMin: number;     // gap between trips
  endAllowanceMin: number;         // last event to the end tap
  shiftGrayCapMin: number;         // most gray-zone time credited in one shift
  endTailCapMin: number;           // a shift left running past its last event: only this much counts as on duty, the rest is a late end tap
  lateAnswerCredit: number;        // credit for a delay reason entered after the fact (0-1)
  corroborationDrivers: number;    // peers over standard at the same place and hour that verify a wait
  evidenceLow: number;             // evidence factor when required steps are missing
  learningMultiplier: number;      // standard x this for a driver's first visits to a place
  learningVisits: number;
  minDrivers: number;              // distinct drivers a standard needs
  maxShare: number;                // most one driver may supply of a standard's samples
  avgMph: number;                  // fallback speed for a leg with no standard
  circuity: number;                // road miles per air mile
  defaultRackMin: number;
  defaultDropMin: number;
  defaultLegMin: number;
  softFlagShifts: number;          // a soft pattern shows when it holds on this many of the last 5 shifts
};

export const DEFAULT_RECAP_SETTINGS: RecapSettings = {
  startAllowanceMin: 20, betweenAllowanceMin: 20, endAllowanceMin: 20, shiftGrayCapMin: 90, endTailCapMin: 180,
  lateAnswerCredit: 0.5, corroborationDrivers: 3, evidenceLow: 0.5, learningMultiplier: 1.2, learningVisits: 10,
  minDrivers: 5, maxShare: 0.25, avgMph: 45, circuity: 1.25,
  defaultRackMin: 45, defaultDropMin: 45, defaultLegMin: 60, softFlagShifts: 3,
};

export type LatLon = { lat: number; lon: number };

export type RecapDriver = { userId: string; name: string; region: string | null; area: string | null };

export type RecapPickup = {
  pickupId: string; terminalId: string | null; name: string | null;
  arrivedAt: string | null; beginAt: string | null; leftAt: string | null;
  outcome: "loaded" | "no_load" | null; noLoadReason: string | null; hasDelayNote: boolean;
  odometer?: number | null;
};
export type RecapDelivery = {
  deliveryId: string; locationId: string | null; name: string | null;
  arrivedAt: string | null; beginAt: string | null; leftAt: string | null;
  signed: boolean; hasDelayNote: boolean;
  odometer?: number | null;
};
export type RecapTrip = {
  tripId: string; userId: string; startedAt: string | null; completedAt: string | null;
  gallons: number;
  pickups: RecapPickup[];      // in order
  deliveries: RecapDelivery[]; // in order
  delays: LoggedDelay[];
};

export type RecapSpan = { userId: string; from: string; to: string; kind: "empty_move" | "fuel"; place?: string | null };

export type Segment = {
  userId: string;
  shiftStart: string;
  type: SegType;
  startMs: number;
  endMs: number;
  minutes: number;
  /** The place a rack or drop happens at ("t:<id>" / "l:<id>"), or the lane for a leg ("a>b"). */
  key: string | null;
  fromKey: string | null;
  toKey: string | null;
  label: string;          // "Marathon", "Love's 495", "Marathon > Love's 495"
  hour: number;           // local hour it started
  dow: number;            // 0 = Monday
  grayKind?: GrayKind;
  tripId?: string;
  liveDelayMin: number;   // logged with the Delay button while it happened
  delayLabels: string[];
  afterNote: boolean;     // a reason was entered afterward (drop sequence / pickup)
  evidence: boolean;      // the steps that prove it are present
};

export type Scored = Segment & {
  standardMin: number | null;
  basis: "history" | "history_any_hour" | "network" | "distance" | "default" | "actual" | "allowance" | null;
  credit: number;         // minutes credited
  excessMin: number;      // actual over standard (before waits)
  waitCredited: number;
  corroborated: boolean;
  unaccounted: number;    // minutes with no credit
  cause: string | null;   // why the excess happened, when known
};

export type ShiftScore = {
  shift: Shift;
  userId: string;
  onDutyMin: number;
  creditMin: number;
  segments: Scored[];
  estimate: boolean;      // no Geotab link: on-duty time is the app shift
  trimmedMin: number;     // minutes of a shift left running that are not counted (a late end tap)
};
