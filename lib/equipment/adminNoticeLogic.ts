// lib/equipment/adminNoticeLogic.ts — the pure half of adminNotice (tested without a database).

export type HolderInfo = { holderId: string | null; holderName: string | null; openTrip: boolean };
export type HeldUnit = { kind: "truck" | "trailer"; id: string; name: string; info: HolderInfo };

/** The sentence the warning shows. */
export function heldWarning(held: HeldUnit[], what: string): string {
  const parts = held.map((h) => `${h.kind === "truck" ? "Truck" : "Trailer"} ${h.name} is being used by ${h.info.holderName ?? "a driver"}${h.info.openTrip ? " on a trip in progress" : ""}`);
  return `${parts.join(". ")}. ${what} They'll get a message in Squawk and a banner on their dashboard saying an admin changed it.`;
}
