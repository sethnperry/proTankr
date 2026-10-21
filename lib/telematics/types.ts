// lib/telematics/types.ts
//
// A telematics provider (Geotab first) behind one small interface, so adding
// Samsara or Motive later doesn't touch the rest of the app.

export type ProviderVehicle = { id: string; name: string; vin: string | null; plate?: string | null; plateState?: string | null; groupIds?: string[] };

export type VehicleReading = {
  odometerMi: number | null;
  fuelLevelPct?: number | null; // combined tank level, 0-100
  engineHours?: number | null;  // total engine hours (an hour meter)
  lat: number | null;
  lon: number | null;
  speedMph: number | null;
  at: string | null; // ISO time of the position fix
};

export type ProviderDriver = { id: string; name: string; firstName: string | null; lastName: string | null; employeeNo: string | null };

/** What a driver has left on the clock, as of `at`. Minutes. Null = not reported. */
export type HosAvailability = {
  driveLeftMin: number | null; // driving time left before a required break / limit
  dutyLeftMin: number | null;  // on-duty window left (the 14-hour clock)
  cycleLeftMin: number | null; // 60/70-hour cycle left
  status: string | null;       // current duty status: D, ON, OFF, SB, PC, YM
  at: string;                  // ISO time this was read
};

export type ProviderTrailer = { id: string; name: string; groupIds?: string[] };

export type ProviderGroup = { id: string; name: string; parentId: string | null };

/** A trailer hooked to or dropped from a vehicle, with where the truck was. */
export type TrailerEvent = { type: "hook" | "drop"; at: string; trailerProviderId: string; lat: number | null; lon: number | null };

export interface TelematicsProvider {
  listTrailers(): Promise<ProviderTrailer[]>;
  /** The provider's group tree (Geotab Groups), flat with parent ids. */
  listGroups(): Promise<ProviderGroup[]>;
  /** Hooks and drops for one vehicle inside a window, oldest first. */
  trailerEvents(vehicleId: string, fromIso: string, toIso: string): Promise<TrailerEvent[]>;
  /** The trailer each vehicle is hooked to right now: provider vehicle id -> provider trailer id. Empty without trailer tracking. */
  attachedTrailers(): Promise<Map<string, string>>;
  listDrivers(): Promise<ProviderDriver[]>;
  hos(driverId: string): Promise<HosAvailability | null>;
  listVehicles(): Promise<ProviderVehicle[]>;
  reading(vehicleId: string): Promise<VehicleReading>;
  /** GPS trail for one vehicle inside a window, oldest first (paged). */
  trail(vehicleId: string, fromIso: string, toIso: string): Promise<{ lat: number; lon: number; at: string }[]>;
  /** First and last odometer reading (miles) inside a window, if any. */
  odometerSpan(vehicleId: string, fromIso: string, toIso: string): Promise<{ firstMi: number; lastMi: number } | null>;
  /** Just the hour meter, for one vehicle. */
  engineHours(vehicleId: string): Promise<number | null>;
  /** Position of every vehicle in one call (no odometer), keyed by provider vehicle id. */
  positions(): Promise<Map<string, VehicleReading>>;
}

export class TelematicsAuthError extends Error {}
