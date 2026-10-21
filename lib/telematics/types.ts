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

export interface TelematicsProvider {
  listVehicles(): Promise<ProviderVehicle[]>;
  reading(vehicleId: string): Promise<VehicleReading>;
  /** Position of every vehicle in one call (no odometer), keyed by provider vehicle id. */
  positions(): Promise<Map<string, VehicleReading>>;
}

export class TelematicsAuthError extends Error {}
