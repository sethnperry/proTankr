// lib/telematics/vinDecode.ts
//
// Year / make / model from a VIN, using the free NHTSA vPIC batch decoder. Used when adding
// trucks from Geotab so the equipment card isn't blank. Soft fail: no result just means blank fields.

export type VinInfo = { year: number | null; make: string | null; model: string | null };

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Pure: one row of the vPIC reply -> our fields. */
export function parseVinRow(r: any): VinInfo {
  const year = parseInt(String(r?.ModelYear ?? ""), 10);
  const make = String(r?.Make ?? "").trim();
  const model = String(r?.Model ?? "").trim();
  return { year: Number.isFinite(year) && year > 1980 ? year : null, make: make ? title(make) : null, model: model || null };
}

export async function decodeVins(vins: string[]): Promise<Map<string, VinInfo>> {
  const out = new Map<string, VinInfo>();
  const list = [...new Set(vins.filter((v) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v)))];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    try {
      const res = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ format: "json", data: chunk.join(";") }).toString(),
      });
      if (!res.ok) continue;
      const j: any = await res.json();
      for (const r of j?.Results ?? []) if (r?.VIN) out.set(String(r.VIN).toUpperCase(), parseVinRow(r));
    } catch { /* blank fields */ }
  }
  return out;
}
