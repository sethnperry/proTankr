// lib/telematics/types.ts
//
// A telematics provider (Geotab first) behind one small interface, so adding
// Samsara or Motive later doesn't touch the rest of the app.

export type ProviderVehicle = { id: string; name: string; vin: string | null };

export type VehicleReading = {
  odometerMi: number | null;
  fuelLevelPct?: number | null; // combined tank level, 0-100
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

export interface TelematicsProvider {
  listDrivers(): Promise<ProviderDriver[]>;
  hos(driverId: string): Promise<HosAvailability | null>;
  listVehicles(): Promise<ProviderVehicle[]>;
  reading(vehicleId: string): Promise<VehicleReading>;
  /** Position of every vehicle in one call (no odometer), keyed by provider vehicle id. */
  positions(): Promise<Map<string, VehicleReading>>;
}

export class TelematicsAuthError extends Error {}
