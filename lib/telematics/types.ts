// lib/telematics/types.ts
//
// A telematics provider (Geotab first) behind one small interface, so adding
// Samsara or Motive later doesn't touch the rest of the app.

export type ProviderVehicle = { id: string; name: string; vin: string | null; plate?: string | null; plateState?: string | null; groupIds?: string[]; activeFrom?: string | null; activeTo?: string | null };

export type VehicleReading = {
  odometerMi: number | null;
  fuelLevelPct?: number | null; // combined tank level, 0-100
  engineHours?: number | null;  // total engine hours (an hour meter)
  lat: number | null;
  lon: number | null;
  speedMph: number | null;
  at: string | null; // ISO time of the position fix
  driverId?: string | null; // provider id of the driver signed in to the vehicle, if known
  lastDriverId?: string | null; // when nobody is signed in: the last driver the provider recorded for it
  bearingDeg?: number | null; // direction of travel, degrees clockwise from north
  isDriving?: boolean | null;
};

export type ProviderDriver = { id: string; name: string; firstName: string | null; lastName: string | null; employeeNo: string | null };

/** What a driver has left on the clock, as of `at`. Minutes. Null = not reported. */
export type HosAvailability = {
  driveLeftMin: number | null; // driving time left before a required break / limit
  dutyLeftMin: number | null;  // on-duty window left (the 14-hour clock)
  cycleLeftMin: number | null; // 60/70-hour cycle left
  status: string | null;       // current duty status: D, ON, OFF, SB, PC, YM
  statusSince?: string | null; // ISO time the current status began
  offSince?: string | null;    // ISO time the current unbroken off-duty stretch began (null when not off duty)
  at: string;                  // ISO time this was read
};

/** A shipping document (BOL) entered on the vehicle's in-cab Drive app under Assets > Shipments. */
export type ProviderShipment = { documentNumber: string; shipperName: string | null; commodity: string | null; activeFrom: string | null };

export type ProviderTrailer = { id: string; name: string; comment?: string | null; groupIds?: string[] };

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
  /** Every trailer attached to each vehicle right now: provider vehicle id -> provider trailer ids. */
  attachedAll(): Promise<Map<string, string[]>>;
  /** The shipping documents (BOL numbers) currently on a vehicle, newest first. */
  activeShipments(vehicleId: string): Promise<ProviderShipment[]>;
  /** The driver who most recently signed in to a vehicle (last 7 days), if the provider says. */
  lastDriverOf(vehicleId: string): Promise<{ driverId: string; at: string } | null>;
  /** The driver signed in to each vehicle right now: provider vehicle id -> provider driver id. */
  currentDrivers(): Promise<Map<string, string>>;
  /** The last driver recorded for each vehicle that has nobody signed in now. */
  historicDrivers(): Promise<Map<string, string>>;
  /** Plain-language lines about why a vehicle has no position (troubleshooting). */
  positionDebug(vehicleId: string): Promise<string[]>;
  /** Plain-language lines about what the provider returns for one driver (troubleshooting). */
  driverDebug(driverId: string): Promise<string[]>;
  /** Positions, signed-in drivers and last drivers for every vehicle from ONE provider call. */
  fleetStatus(): Promise<{ positions: Map<string, VehicleReading>; current: Map<string, string>; historic: Map<string, string> }>;
  /** The vehicle a driver most recently signed in to (last 30 days), if the provider says. */
  lastVehicleOf(driverId: string): Promise<{ vehicleId: string; at: string } | null>;
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
