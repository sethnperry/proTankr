// lib/equipment/beginEquipment.ts
//
// What Begin Trip does about the driver's equipment. Nothing is pre-selected: a driver who holds nothing gets the
// Select Equipment picker. A trip needs a trailer, so a truck with none ("bobtail") can only run an empty move: the
// driver is offered that. Fuel stops only need a truck. Pure.

export type EquipmentVerdict = "go" | "pick" | "bobtail";

export function beginEquipmentVerdict(o: { hasCombo: boolean; hasTruck: boolean; hasTrailer: boolean; needTrailer: boolean }): EquipmentVerdict {
  if (!o.hasTruck && !o.hasCombo) return "pick";
  if (!o.needTrailer) return "go";
  return o.hasTrailer ? "go" : "bobtail";
}
