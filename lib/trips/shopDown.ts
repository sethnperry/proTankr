// lib/trips/shopDown.ts
//
// A unit the driver reported down (Truck Down) and has not yet cleared. While it is set the driver can plan trips but
// not load; "Back in service" ends the shop time and clears the Deadline. Kept on the phone: the unit's own status
// lives in the database, this is the driver's own "I am sitting in the shop" marker.

export type ShopDown = { unitKind: "truck" | "trailer"; unitId: string; unitName: string; at: string };

const key = (userId: string) => `proTankr:u:${userId}:shopDown`;

export function readShopDown(userId: string): ShopDown | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) ?? "null");
    return v && typeof v.unitId === "string" && (v.unitKind === "truck" || v.unitKind === "trailer") ? v as ShopDown : null;
  } catch { return null; }
}

export function writeShopDown(userId: string, v: ShopDown | null) {
  try {
    if (v) localStorage.setItem(key(userId), JSON.stringify(v));
    else localStorage.removeItem(key(userId));
  } catch { /* private mode: the marker just won't survive a reload */ }
}

export const SHOP_BLOCK = { title: "Truck is down", text: "This unit is at Deadline. You can plan trips, but you can't load until you tap Back in service." };
