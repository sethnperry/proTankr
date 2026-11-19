# Telematics (Geotab) connectors: what uses it, what we lose without it

Written 2026-11-26 from a code audit (161 files mention telematics, Geotab, or a hook that reads it). Goal: ProTankr's
own records are the source of truth everywhere, the phone's GPS replaces the tracker for equipment position, and the
telematics link becomes a switch we can turn off while knowing exactly what stops working.

**The switch already exists in one place:** server side, `providerFor(companyId)` returns null for a company with no
active `telematics_connections` row, and the demo companies and every solo company run that way today. Anything that
breaks for them breaks when telematics is off. So "flip the switch" = disconnect; what is left is making each row
below degrade quietly and, where it matters, get a ProTankr-native source.

Legend. Loss = what a driver or dispatcher loses with telematics off today. Native = what replaces it.

## 1. Things that fight the app (fix first)

| # | What | Conflict | Fix |
|---|------|----------|-----|
| 1 | `lib/equipment/geotabHolds.ts` (5-min cron) | Holds a pair for a driver the tracker shows signed in and on duty. After End shift releases the pair, the tracker still shows the driver driving home, so the cron **re-claims it**. This is the likely cause of "ending my shift did not unlink me". | Guard added 2026-11-26: no hold for a driver whose latest shift event is an end. Longer term: delete the cron (see section 3). |
| 2 | `lib/shifts/autoEndServer.ts` and `lib/shifts/autoStart.ts` | Shift start/end is partly decided by tracker duty status, so two systems can disagree about whether a shift is open. | Keep the app's shift as the truth. Tracker may only *offer* a start or end time. |
| 3 | `GeotabEquipmentHost` / `useGeotabEquipment` | Offers to link the driver to the truck the tracker says they are in, polled every 3 minutes. | Remove with the hold cron. Equipment is what the driver picks. |
| 4 | `lib/trips/syncTrailerEvents.ts` (+ `trailer-events` route) | Files hook/drop events from the tracker onto the trip, next to the driver's own hook/drop and Left-behind flows. | Drivers confirm hooks and drops in the app. Remove. |
| 5 | `useArrivalSuggestion`, `useDepartureWatch`, `useGeofenceWatch` | Tracker position decides arrive/depart suggestions and dispatch geofence alerts, beside the Arrive tap. | Use the phone's GPS (the same geofence math in `lib/telematics/geofence.ts` works on any lat/lon). |
| 6 | `lib/telematics/server.ts` exports `callerId` and `companyRole` | Generic auth helpers live in the telematics module, so squawk, terminal reports, push, SLF and dispatch notify routes all import "telematics" for plain sign-in checks. | Move to `lib/auth/server.ts`. Pure refactor; removes 6 false dependencies. |
| 7 | `app/api/admin/invite`, `JoinFleetView`, profile save, roster load | Auto-link a new member to a tracker driver by name/email/employee number. | Harmless when off (no-op), but part of the coupling. Keep only inside the import tool. |

## 2. Every connector, by capability

Rated by what is lost with telematics off today: **None**, **Convenience** (driver types it), **Feature** (a feature
stops), **Compliance** (a legal/IFTA/HOS feature stops).

| Capability | Where it is used | Loss if off | Native replacement |
|------------|------------------|-------------|--------------------|
| Truck odometer | Prefills odometer in the stamp pop-out, fuel, cancel, End shift, Begin Trip miles; Service due by miles | Convenience (typed; the stamp rules already require a number) | Driver types it. Last typed odometer is the default guess (`truckLastKnownPlace` already does this for the place). |
| Truck position (live) | Dispatch live dots, Track, parked-truck fix, arrival/departure, find-unit | Feature | Phone GPS while the driver holds the unit and the app is open. See section 4. |
| Truck position (history/trail) | Track detail map, end-of-shift catch-up, IFTA miles by state | Feature / Compliance | Phone trail is only as good as the app being open. IFTA is the real loss, see below. |
| Driver HOS clocks | Hours card, break chip, HOS alerts push, HOS-vs-stops warning, standby calculator, dispatch hours | Feature (card, alerts); the calculator needs recap days | ProTankr shift log gives on-duty time but not legal drive/duty clocks. Do not pretend it does. |
| Duty logs (on-duty time) | Work log PDF, weekly recap time base, per diem | Feature (accuracy) | ProTankr shifts and stamps. The recap already prefers app evidence. |
| Auto shift start/end | `autoStart`, `autoEndServer` | Convenience | Driver taps Start and End shift (they already do). |
| Fuel level | Load Report fuel-burn credit | Convenience | The overlay already has Gallons mode and a remembered tank size. |
| Engine hours | Service due by hours | None | Hours service types were removed from the pickers. |
| Trailer hook/drop events | Trip trailer log, left-behind detection | Feature | In-app hook/drop and Left-behind flows. |
| Who is signed in to which truck | Equipment holds, handoffs, "driver not in ProTankr" rows | Feature | Equipment picker. Slip-seat handoff is the picker plus Take over. |
| Shipments (dispatch system via Geotab) | Shipper/customer/commodity suggestions on trips | Convenience | Typed, remembered per driver. |
| IFTA miles by state, quarterly CSV | `cron/ifta`, `IftaModal` | **Compliance** | Needs a GPS trail per truck. Phone GPS cannot do this reliably (app must be open). Either keep Geotab for IFTA only, or accept an odometer-by-state entry on fuel stops. |
| Driver and vehicle import | Add trucks from Geotab, VIN decode, group to Region | None (one-time) | Keep, as asked. |
| Link driver to tracker driver | `link-me`, `verify-name`, `matchDrivers` | None | Not needed without the features above. |
| Per diem suggestion | `per-diem/suggest` | Convenience | Home location vs. shift days already there. |

**Net:** with telematics off we lose the hours card and alerts, auto shift start/end, live positions of equipment (until
phone GPS replaces them), and IFTA state miles. Everything else is typed or already has an in-app flow.

## 3. Proposed order

1. **Done 2026-11-26:** End shift ends a running delay and always releases the equipment (parked-preloaded included);
   the hold cron no longer re-holds a driver who ended their shift.
2. **Stop the fighting:** ~~delete `geotabHolds`, `GeotabEquipmentHost`/`useGeotabEquipment` and `syncTrailerEvents`~~ **done 2026-11-26**
   (also removed `GeotabEquipmentSheet`, `geotabMatch`, the `my-equipment` and `trailer-events` routes; the hold cron call is gone from
   `hos-alerts`; `useSecondSeat` moved to `hooks/useSecondSeat.ts`; "behind the wheel" on the dashboard is no longer inferred).
   **Shift start/end done 2026-11-27**: a trip always starts the shift (Begin Trip opens the start-time window; Start now skips it;
   telematics only prefills the time); the Geotab silent auto-start and the Geotab off-duty auto-end are gone. Shift end is
   `lib/shifts/wrapUp.ts`: 30 min quiet after the last load (3 h with a trip open) asks "Are you still working?" on screen and by
   push; 15 min with no answer ends it at the last activity. Still to do: move `callerId`/`companyRole` out of the telematics module.
3. **Phone GPS for equipment position** (section 4), then rebuild Track, the dispatch dots and arrival/departure on it.
4. **One company setting**, `telematics_enabled`, read by `providerFor` and every client hook, with a test pass over a
   company that has it off. Keep Hours, Odometer prefill and IFTA behind it as "supplements".
5. **Track in Geotab** button in the Track modal (deep link to the unit), the only Geotab surface left there.

## 4. Phone GPS for equipment (sketch, not built)

- While a driver holds a unit and the app is open, write the phone's position to an `equipment_positions` row
  (unit, lat, lon, at, by), at most once a minute and only on movement. Parked pins (`equipment_parks`) stay as they are.
- Limitation to say out loud: a PWA cannot track in the background. A truck's position is "last time its driver's app was
  open", not live. The native Capacitor app can track in the background; that is the real fix and belongs to the native
  build.
- Track, dispatch dots, find-unit, arrival/departure and the geofence alerts read this table instead of Geotab.

## 5. Other issues noticed while auditing

- `callerId` in the telematics module (section 1, row 6).
- `lib/recap/_dbg.ts` is a stray debug script with a hard-coded company id; delete it.
- Many hooks poll Geotab on a timer (`useMyHos`, `useFleetHos`, `useFleetPositions`, `useFleetEngineHours`, truck reading,
  geotab equipment). The shared `telematics_cache` softens it, but turning the company switch off should stop all of them
  at the source, not per hook.
- `telematics_driver_credentials` stores per-driver Geotab logins; with the connection off these should not be readable.
- Departure watch and arrival suggestion store a derived time on the phone (`geoDepartures`) that becomes the default
  Depart time. With phone GPS it needs the same "driver can always edit" guarantee it has today.
