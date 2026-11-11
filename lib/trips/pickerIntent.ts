// lib/trips/pickerIntent.ts
//
// The terminal picker normally means "I'm headed somewhere else": a pickup not yet arrived at follows the pick
// (useTerminalSwitchDuringLoad). When the picker is opened to ADD a pickup (a splash ethanol terminal, another
// pickup), the pick is a new stop and must not move the one already waiting. The flag clears itself after a moment,
// long enough for the picker's close to be seen by everything watching it.

let until = 0;

export function markAddingPickup(ms = 120_000): void { until = Date.now() + ms; }
export function releaseAddingPickup(afterMs = 800): void { until = Math.min(until, Date.now() + afterMs); }
export function isAddingPickup(): boolean { return Date.now() < until; }
