# Recon: split loads, split deliveries, retain, multi-driver orders, transfers, non-tank drops

Read-only. No source, schema or migration was changed; this file is the only write.

**Commit read:** `0031725` ("Plan builder: say what happened on save…", 2026-11-25 04:54 UTC). `HEAD` equals `origin/main` (checked with `git fetch` and `git rev-parse`; both are `00317258ebcaa13ae6793532cdb33471ce97a3f5`).

**How the schema facts were gathered.** Per this repo's own rule, the migrations folder is not the source of truth, so table/column names, constraints, indexes, RLS policies, triggers and function bodies below were read from the **live database** with read-only `SELECT`s (Supabase Management API: `information_schema`, `pg_policies`, `pg_constraint`, `pg_indexes`, `pg_get_functiondef`). Code facts come from the files cited. Anything I did not read is marked **not verified**.

Conventions: `file:line` refs are against `0031725`. "Store" = the phone's offline `tripStore` (`lib/trips/tripStore.ts`).

---

## 0. Orientation: the container is the TRIP

The true top-level container is **`trips`** (`trip_id`). An "order" is **not** a container: it is a row (`trip_orders`) hanging off a trip, and a trip can have several (one primary plus extras). Pickups, deliveries, compartment loads, orders, events and tank readings are all children of one `trip_id`. The older `load_log`/`load_lines` pair is one **Planner load** (one terminal visit); it is linked from a trip pickup by `trip_pickups.load_id`.

Rough shape today:

```
trips (1 driver_id, 1 truck_id, 1 trailer_id, status)
 ├─ trip_orders           (order_number, is_primary)      0..n
 ├─ trip_pickups  (seq)   (terminal, rack, load_id→load_log, order_id, supplier_id, planned_comps)  0..n
 ├─ trip_deliveries (seq) (location_id|one_off_name, delivery_type drop|pump_off, delivering_driver_id, planned_comps)  0..n
 ├─ trip_compartment_loads (comp_number, pickup_id, order_id, delivery_id, tank_number, disposition, bol_number, gross/net gallons, loading_driver_id)
 ├─ trip_delivery_tanks   (per delivery: tank_number text, before/after/water, reading_unit)
 └─ trip_events           (append-only log: handoff, parked, resumed, truck_change, delivery_details, …)
load_log (1 per Planner load, user_id = the one driver who began it) ─ load_lines (1 per comp, UNIQUE(load_id, comp_number))
```

So several of the things you want already half-exist at the trip level (multiple pickups, multiple deliveries, retained product, parking and handoff). The obstacles are mostly: single `driver_id`, tanks-only delivery targets, order-vs-trip identity, and the Planner/`load_log`/utilization stack being per-driver and tare-based.

---

## 1. Data model (live columns)

`!` = NOT NULL. Types abbreviated.

### `trips`
`trip_id!`, `company_id!`, `truck_id`, `trailer_id`, **`driver_id!`**, `created_by!`, `status!`, `shipper`, `customer`, `begin_miles`, `end_miles`, `entered_late!`, `notes`, `started_at`, `completed_at`, `created_at!`, `updated_at!`, `client_updated_at`, `parked_at`, `parked_by`, `parked_for`, `parked_where`, `parked_note`, `parked_region`, `start_city`, `start_state`, `cancel_reasons[]`, `cancel_note`, `cancelled_at`, `cancelled_by`, `cancel_returned_to`, `driver_hidden!`, `dispatched_by`, `planned_start_at`, `planned_truck_id`, `planned_trailer_id`, `dispatch_seq`, `planned_end_at`, `planned_drive_min`, `park_requested_at`, `park_requested_by`, **`handoff_at`**, **`handoff_from`**.
- `trips_status_check`: `dispatched | draft | loading | in_transit | delivering | parked | complete | cancelled`.
- `trips_parked_for_check`: `slip_seat | layover`.
- FKs: `driver_id→auth.users`, `truck_id→trucks` (SET NULL), `trailer_id→trailers` (SET NULL), `company_id→companies` (CASCADE).
- Indexes: `trips_driver_idx (driver_id, created_at desc)`, `trips_trailer_open_idx (trailer_id) where status not in (complete, cancelled)`, `trips_company_idx`, `trips_truck_end_miles_idx`, `trips_company_cancelled_idx`.
- **One `driver_id`, one `truck_id`, one `trailer_id` per trip.** There is no driver-assignment table.

### `trip_orders`
`order_id!`, `trip_id!`, `order_number`, `shipper`, `customer`, `is_primary!`, timestamps, `client_updated_at`.
- Unique index `trip_orders_one_primary (trip_id) where is_primary`.
- **No DB uniqueness on `order_number`.** The "one live trip per order number" rule is app-only (`lib/trips/refCheck.ts`: `serverOrderConflicts` selects `trip_orders` joined to `trips!inner(company_id, status)` excluding `cancelled`; plus the local `usedOrderNumbers`). `useHomeDispatched.tsx` (submit, ~line 391-399) calls both and shows "Order X is already on another trip."
- Order-level shipper/customer exist on `trip_orders` but the app mostly reads `trips.shipper/customer` (set in `buildStartLoad`, `lib/trips/tripLogic.ts:122-132`).

### `trip_pickups` (one row per terminal/rack visit)
`pickup_id!`, `trip_id!`, `seq!`, `pickup_type!` (`terminal|railcar|transload|other`), `terminal_id`, `rack_id`, `name`, `city`, `state`, `odometer`, `arrived_at`, `begin_at`, `left_at`, `delay_reason_id`, `delay_note`, **`load_id`** (→`load_log`, SET NULL), `outcome` (`loaded|no_load`), `no_load_reason`, `no_load_note`, `delay_code`, **`planned_comps` jsonb** (`[{comp_number, product_id, order_id?, supplier_id?, splash?}]`), **`order_id`** (→`trip_orders`, SET NULL), `supplier_id`.
- `pickup_type` already allows `railcar/transload/other` but the UI only ever writes `"terminal"` (`addPickup`, `tripFlow.ts:401-422`; `buildStartLoad` line ~167).
- Trigger `trg_touch_long_line_on_hop` (AFTER INSERT/UPDATE) exists on this table (long-line terminal reports).

### `trip_deliveries` (one row per stop)
`delivery_id!`, `trip_id!`, `seq!`, `location_id`→`delivery_locations`, `one_off_name`, `one_off_address`, **`delivery_type!`** (`drop|pump_off` by CHECK), **`status!`** (`planned|complete|cancelled`), `arrived_at`, `begin_at`, `left_at`, `delay_reason_id`, `delay_note`, **`delivering_driver_id`**, `driver_signed_at`, `consignee_name`, `consignee_signature`, `unaccounted_delay_min`, **`planned_comps` jsonb**.
- `trip_deliveries.planned_comps` (migration `20261127000000_delivery_planned_comps.sql`, shape `[{"comp_number":3}]`) is **written by dispatch** (`lib/dispatch/dispatchTrip.ts:81,84`) to say which compartments go to which stop. I found **no reader in the driver delivery flow** (`compartmentsForDelivery`, `tripFlow.ts:788-798`, ignores it). Dispatch plans multi-drop; the driver app does not yet honor it.
- **No `order_id` on a delivery.** The link order↔delivery is indirect via `trip_compartment_loads(order_id, delivery_id)`.

### `trip_compartment_loads` (the product-in-a-compartment record; the heart of everything)
`compartment_load_id!`, `trip_id!`, `pickup_id`, `order_id`, `delivery_id`, `comp_number!` (CHECK `>0`), `product_id`, `supplier` (text), `supplier_id`, `bol_number`, `gross_gallons`, `net_gallons`, `net_calculated_gallons`, `temp_f`, `api`, **`tank_number` (text)**, **`disposition!`** (`loaded|delivered|retained|cancelled`), `winterized`, `additive_amount`, `bio_blend`, **`bio_gallons`**, **`loading_driver_id`**, timestamps.
- No unique constraint on `(trip_id, comp_number)`. Two rows can share a compartment on a trip (this is how a splash blend works: `lib/trips/splash.ts` `mergeBlendRows`, and a retained row plus a later pickup row).
- `tank_number` is **one text value per compartment row**. A compartment poured into several tanks keeps only its first tank here; the full split lives in the `delivery_details` trip event (`details.splits`, `DeliveryDashboard.tsx:~947-952`, `lib/trips/deliveryDetails.ts`).
- Partial drops reduce `gross_gallons`/`net_gallons` in place and log a `partial_drop` event (`finishDelivery`, `tripFlow.ts:~690-710`; `lib/trips/partialDrops.ts`). `lib/trips/ptd.ts:~91-100` adds the dropped part back to show the BOL amounts.

### `trip_delivery_tanks`
`delivery_tank_id!`, `delivery_id!`, `tank_number!` (text), `product_id`, `before_reading`, `after_reading`, `water_reading` (always inches), `receipt_photo_path`, **`reading_unit!`** (`gallons|inches` CHECK), timestamps.
- **No FK to `delivery_location_tanks`.** The link is the text `tank_number` only. `finishDelivery` upserts by `(delivery_id, tank_number)` (`tripFlow.ts:~642-657`).
- Nothing in the schema says what kind of receptacle a "tank" is.

### `trip_events` (append-only; insert-only upserts)
`event_id!`, `trip_id!`, `event_type!`, `occurred_at!`, `actor_id!`, `pickup_id`, `delivery_id`, `payload jsonb!`. This is where handoffs, parks/resumes, truck changes, delivery details (odometer, additives, issues, splits), supplier switches, delays, partial drops, trailer hook/drop and cancellations are recorded. Types include: `trip_started, load_begun, load_completed, load_edited, load_cancelled, pickup_added, delivery_arrived, delivery_split, delivery_rerouted, delivery_finished, signature_accepted, handoff, parked, resumed, truck_change, trailer_hook, trailer_drop, delivery_details, partial_drop, supplier_switch, delay_logged, trip_cancelled, finish_needed, dispatched`.

### Driver assignment (what exists)
- `trips.driver_id`: the **current** driver, overwritten on handoff/resume (§3, §6).
- `trip_compartment_loads.loading_driver_id`: who loaded that compartment (set once in `recordLoadCompleted`, `tripFlow.ts:277`).
- `trip_deliveries.delivering_driver_id`: who finished that stop (`finishDelivery`, `tripFlow.ts:632`).
- `trip_events` of type `handoff` (`payload.from_driver_id / to_driver_id`), `parked`, `resumed`.
- `trips.handoff_at / handoff_from`: set only by `lib/trips/parkHandoff.ts:20` (commandeering a parked trailer), used to show a dashboard alert (`useHomeParkAccess.tsx:185-186`).
- `driver_signatures (user_id, signature_svg)`: one saved signature per user.
- **No** per-order driver, no "second driver" column, no driver-assignment history table. A driver's participation in a trip other than its current owner is only reconstructible from events and the two per-row driver ids.

### Planner-load tables
- **`load_log`**: `load_id!`, **`user_id!`** (the single driver who began it), `combo_id`, `terminal_id`, `rack_id`, `state_code`, `city_id`, `cg_bias`, `ambient_temp_f`, `product_temp_f`, `status!` (CHECK `planned|loaded|voided`), `started_at`, `completed_at`, `loaded_at`, `planned_snapshot` jsonb, `tare_lbs`, `gross_limit_lbs`, `buffer_lbs`, `planned_total_gal/lbs`, `planned_gross_lbs`, `actual_total_gal/lbs`, `diff_lbs`, `trainee_id`, `plan_slot`.
- **`load_lines`**: PK `(load_id, comp_number)` (also `UNIQUE`); `product_id`, `planned_gallons/lbs`, `actual_gallons/lbs`, `temp_f`, `actual_temp_f`, `actual_api`. **One row per compartment per load.**
- **`load_utilization`** (one per load): `load_id!`, `driver_id!`, `company_id!`, `available_gallons`, `effective_available_gallons`, `actual_gallons`, `unused_gallons`, `utilization_pct`, `eligibility`, `exception_reason`, `actual_gallons_source`, `calc_version`. **`load_capacity_snapshot`**: `tare_lbs, target_gross_lbs, legal_gross_lbs, cg_bias, compartments jsonb, available_gallons, …`. Both write-locked by RLS (`USING false`); only `record_load_utilization` writes them.
- **`compartment_readiness`** (per trailer+comp): `status`, `last_product_id`, `compartment_load_id`. Written by `setReadiness` (`tripFlow.ts:194-209`): `residue` after a delivery, `retained` when product is left aboard at trip completion, `cleaned_and_purged` after an interior wash. This is the trailer's own memory of what is in each compartment between trips.
- **`trailer_alerts`**: a note for the next driver about retained product (`addTrailerAlert`, called from `onFinishSubmit` in `useHomeSteps.tsx:~314`).

### PTD
There is no PTD table. The PTD is **computed on read** from the trip rows by `buildPtd` (`lib/trips/ptd.ts:90`), rendered by `app/planner/trips/PtdDocument.tsx`, `lib/trips/ptdPdf.ts`, `lib/trips/ptdTimeline.ts`, and loaded by `app/planner/trips/[id]/page.tsx`.

### Tanks, sites, locations
- **`delivery_locations`**: `location_id!`, `company_id!`, `name!`, `location_number`, `address`, `city`, `state`, `zip`, `county`, `lat`, `lon`, `delivery_type!` (`drop|pump_off`), `notes`, `is_active!`, `region`, `local_area`, `place_kind!` (CHECK `store|yard|maintenance|terminal|fuel|shipper`), `place_kinds[]`, `terminal_id`, `notes_updated_by/at`, `created_by`. Unique indexes: `delivery_locations_one_store (company_id, norm_name, norm_ref(location_number), upper(state)) where is_active and ref<>''`, `delivery_locations_company_terminal_uq (company_id, terminal_id)`.
- **`delivery_location_tanks`**: `tank_id!`, `location_id!` (CASCADE), `tank_number!` (CHECK non-blank), `product_id`, `capacity_gallons`, `is_active!`, `hose_length_ft`, `sort_order`. **Unique `(location_id, tank_number)`.** One product per tank. No tank "kind".
- `site_notes (site_id, state, norm_name, norm_number, norm_city, lat, lon, note, updated_by, updated_company, updated_at)`: cross-company shared drop-site note, read/written through RPCs `get_site_note(p_location_id)` / `set_site_note(p_location_id, p_note)` (`lib/sites/useSites.ts:36-37, 55`). `delivery_locations.notes` is the older per-company column.
- `terminal_notes (terminal_id, note, updated_by, updated_at)`: shared terminal note (`useSites.ts:33, 50`).

---

## 2. The drop/delivery sequence

### Components and files
- **`app/planner/components/trip/DropSiteSheet.tsx`**: the arrival window. Opened by tapping Arrive at a delivery. After "Begin Delivery" it shows the Bio blending card and the "Tank readings before" list. `DropTank = {number, capacity, last}`, `DropProduct = {id, name, color, gallons, tanks[]}` (lines 18-24).
- **`app/planner/components/trip/DeliveryDashboard.tsx`** (1600+ lines): the Finish Delivery sequence. `WStep = "tanks" | "details" | "consignee" | "driver" | "times"` (lines 132-133). Step gating is in `goNextStep` (~846-884); `submit` (~885-958) builds the `FinishDeliverySubmit`.
- **`app/planner/components/trip/TankMap.tsx`**: the tank step's visual (trailer compartments on the left, store tanks on the right). `kind: "dome" | "cap"` at line 49, chosen by `delivery_type` (drop = dome lid, pump_off = fill cap), drawn at lines ~190-215. `MapTank = {tank, code, name, color, productId, capacity}` (line 26).
- `TankPickList.tsx` (fallback picker), `BioBlendSheet.tsx`, `BolPagesSheet.tsx`, `SignaturePad`/`ConsigneeSignSheet.tsx`.
- Pure logic: `lib/trips/tripFlow.ts` (state transitions), `lib/trips/tankReadings.ts` (reading math), `lib/trips/dropSchedule.ts`, `lib/trips/deliveryDetails.ts`, `lib/trips/ullage.ts`, `lib/trips/partialDrops.ts`.
- Glue: `app/planner/home/useHomeSteps.tsx` (`onFinishSubmit`, `mergedHere`), `useHomeDispatched.tsx` / `useHomeBase.tsx` (state), `HomeView.tsx` (renders `DropSiteSheet` ~line 1659 and `DeliveryDashboard` ~1680).

### State machine (trip-level, derived, not stored)
`nextStep(trip, snap)` (`tripFlow.ts:86-128`) is **derived from rows each render**; there is no stored step. In order:
1. trip not in `OPEN_STATUSES` (`draft|loading|in_transit|delivering`, `tripLogic.ts:23`) → `start` ("Begin Trip").
2. `activePickup` (first pickup with no `left_at`): if comp loads were logged → `loaded`; not arrived → `arrive_pickup`; else `planner` ("Return to Load"/"Continue Trip").
3. all pickups left, nothing loaded/delivered/retained → `next_rack`.
4. `plannedDeliveries(...)[0]` (the lowest-`seq` `status='planned'` delivery): none → `add_delivery`; not arrived → `arrive_delivery`; arrived → `finish_delivery` ("Return to Delivery" until `begin_at`).

So **stops are strictly sequential: the "next" delivery is always the lowest-`seq` planned one.** Pickups likewise (first without `left_at`).

### How stops are created / ordered / completed
- Created: `buildStartLoad` (`tripLogic.ts:114-236`) builds the first pickup, the orders and the planned deliveries from the Begin Trip sheet (`seqBase + i + 1`). More pickups: `addPickup` (`tripFlow.ts:401`, `seq = max+1`). More deliveries: `splitToNewDelivery` (`tripFlow.ts:528-551`, new `seq = max+1`, moves the chosen compartment loads to it, logs `delivery_split`) and the Add Delivery step. Dispatch creates multi-drop trips with `trip_deliveries.planned_comps` (see above). Reorder: only a `rerouteDelivery` (`tripFlow.ts:553`) changes where a *planned* stop goes (logged `delivery_rerouted`); `seq` is never reordered after creation.
- Which compartments a stop delivers: `compartmentsForDelivery` (`tripFlow.ts:788-798`) = loaded compartments assigned to this delivery, or assigned to **no** delivery when no other planned delivery claims them. This is what makes "retain the rest for the next leg" work.
- Completed: `finishDelivery` (`tripFlow.ts:592-736`):
  - stamps `status='complete'`, times, `delivering_driver_id = args.userId`, consignee, signature;
  - upserts `trip_delivery_tanks` by `(delivery_id, tank_number)`;
  - each delivered compartment → `disposition='delivered'`, `delivery_id`, `tank_number`, and `setReadiness(...,'residue')`;
  - `retained` compartments keep `disposition='loaded'` with `delivery_id=null` and the trip stays open;
  - `tripComplete = remaining planned deliveries == 0 && retained.length == 0`. If complete: any compartment still `loaded` becomes `retained` (`setReadiness(...,'retained')`) and `trips.status='complete'`, `end_miles` set. Otherwise `trips.status='in_transit'`;
  - logs `delivery_finished`, `delivery_details`, `signature_accepted{role:'delivering_driver'}`.
- **Trip completion is tied to "no planned deliveries left"**, not to "the order's product is all delivered". If a stop is cancelled/removed the trip can close with product aboard; that product is silently marked retained.

### Tank selection and readings
- Tank step: each delivered compartment gets one `choice[compartment_load_id]` = a `tank_number` string or the sentinel `RETAIN = "__retain__"` (`DeliveryDashboard.tsx:128, 304`). `unpicked` blocks "Next". A compartment can be **split across tanks** (`splits`, line 326): typed gallons per tank must total the compartment gross within 1 gal (`goNextStep`, ~852-856). **Partial drop** (`partials`, line 342) drops part of a compartment, keeps the rest aboard.
- Tank universe for the stop: `tanksForProduct(productId, locationTanks, extraTanks, order)` (`lib/trips/tankReadings.ts:63-74`), i.e. `delivery_location_tanks` rows whose `product_id` matches, plus ad-hoc "+ Other tank #" entries (`extraTanks`, line 312, and `newTankFor`). Unknown tanks are remembered afterward by `rememberTanks` (`lib/trips/useTripData.ts:~255-277`, upsert on `(location_id, tank_number)`).
- Readings: per **product**, the before and after reading of **every** store tank of that product (manifold levelling), stored in `trip_delivery_tanks`. `tankDiscrepancy(delivered, tanks, unit)` (`tankReadings.ts:26-36`) compares total rise to delivered gallons (warn >25, bad >100; **only for `gallons`**, `unit !== "gallons"` returns null). `prefillAfter(before, intoTank, unit)` (line 79) prefills the after reading for gallons only.
- **Inches vs gallons**: one `unit` state for the whole delivery (`DeliveryDashboard.tsx:306`, `ReadingUnit = "gallons"|"inches"`), stored per tank row as `reading_unit`. Water is always inches (`water_reading`). Inches readings are stored but never compared (dispatch is expected to use the tank chart).
- **Shared readings component**: the entry window is `ValueEntryOverlay` (`app/planner/components/ValueEntryOverlay.tsx`), used both in the arrival window's "before" pass (`DropSiteSheet.tsx`, one product at a time) and in the Details section's before/after/water passes (`DeliveryDashboard.tsx`, `step` state `{productIdx, phase: "before"|"after"}`). The math is shared in `lib/trips/tankReadings.ts` and `lib/trips/ullage.ts` (room at 100%/90%, `DropSiteSheet.tsx:~96-103`).
- Bio (new): `bio_gallons` per diesel compartment is added to the tank's expected rise (`intoTank`, `DeliveryDashboard.tsx:~543-549`; `discrepancyFor`) and to `loadGallons` in the arrival ullage.

### Everything hardcoded to "tank"
There is no abstraction for "receptacle". Concretely:
- **Schema:** `trip_delivery_tanks`, `delivery_location_tanks`, `trip_compartment_loads.tank_number`, `trip_deliveries.delivery_type` CHECK (`drop|pump_off` only), `delivery_locations.place_kind` CHECK (no generator/marine/equipment kind), `compartment_readiness`. One product per `delivery_location_tanks` row; tanks have only `capacity_gallons`/`hose_length_ft`.
- **Readings semantics:** `before/after` are "tank monitor gallons or inches" (`lib/trips/types.ts` comment on `TripDeliveryTankRow`); water in inches (underground-tank concept); `ullage` assumes tank capacity.
- **UI:** `TankMap` draws dome lids / fill caps; "Tank readings before (optional)", "Dropped into", `TankPickList`, "+ Other tank #", "Pick a tank or Retain for C…" (`goNextStep`); `trip_deliveries.delivery_type` drives only the lid art and the "Drop / Pump Off" wording.
- **PTD:** table columns "Comp / Product / Tank / Gallons / Before / After / Water" (`PtdDocument.tsx:~288-310`, `ptdPdf.ts:~61-65`); `buildPtd.deliveryDrops` (`ptd.ts:~166-205`) keys on `tank_number`.
- **Other readers of tank data:** `recent_deliveries_at_location` RPC (migration `20261014030000`), dispatch Site board (`app/planner/dispatch/SiteBoard.tsx`), `DropSiteSheet` "Before you get out" card, `lib/trips/tankReadings.ts`.
- I did **not** find anything in the code that distinguishes in-ground from above-ground; it is simply "tank". (The "tank" is the only receptacle type that exists.)

### Reuse / change / risk
- **Reuse as-is:** `trip_deliveries` multi-stop plumbing, `splitToNewDelivery`, `rerouteDelivery`, `retained`/partial-drop logic, `compartmentsForDelivery`, `ValueEntryOverlay`, `TankMap` (as the tank renderer), `tankReadings.ts` math, `DropSiteSheet` shell.
- **Must change for non-tank targets:** a receptacle abstraction (kind + unit + optional capacity/product) on `delivery_location_tanks` and a matching `kind` on `trip_delivery_tanks`/`trip_compartment_loads`; `reading_unit` needs more values (or a nullable "no reading"); `place_kind`/site mixing (one site holding tanks + generator + boat) needs several receptacles per site with different kinds (the table already allows many rows per location, so this is additive); readings/discrepancy/ullage must tolerate "no before/after"; PTD columns must stop assuming "Tank"/"Before/After".
- **Risky:** `trip_delivery_tanks`/`trip_compartment_loads.tank_number` are text and joined by string everywhere (typos, renames, "+ Other tank #" free text, location tank renames in the Locations tool silently orphan history). `tank_number` holds only the first target of a split (rest in an event). `delivery_type` CHECK would need widening or a separate column. Offline store rows are typed (`lib/trips/types.ts`); a new column must be optional in the type or old phone rows break type narrowing.

---

## 3. PTD

### Generation
`app/planner/trips/[id]/page.tsx` loads the trip and its children (RLS-readable by any company member, see §6), fetches `get_display_names_full` for driver names (`:121-141`), then calls `buildPtd({...data, shiftEvents, fuelStops}, names)` (~`:210`). `buildPtd` (`lib/trips/ptd.ts:90-261`) is pure. Rendering: `PtdDocument.tsx` (screen and print layouts), `ptdPdf.ts` (PDF), `ptdTimeline.ts` (timeline), email/package: `lib/trips/packageServer.ts`.

### How the "drop driver" is modelled today
- **Delivering driver = `trip_deliveries.delivering_driver_id`** per stop, set at Finish Delivery (`tripFlow.ts:632`) and shown by `names.driver(...)` (`ptd.ts:230-231`). `PtdDocument.tsx:121-142` (`sigRow`) draws "Loading driver | Consignee | Delivering driver" **one row per delivery**.
- **Loading driver = `ptd.loadingSigs[0]` for the whole PTD** (`PtdDocument.tsx:119`: `const loader = ptd.loadingSigs[0] ?? null;`). `loadingSigs` is built from `signature_accepted` events with `role='loading_driver'` and carries `pickupId` (`ptd.ts:~236-238`), but the render picks the first one only, so a multi-pickup/multi-driver PTD shows one loading driver.
- `signature_accepted` events are stamped for the loading driver and the delivering driver (`confirmLoaded`, `tripFlow.ts:312-382`, and `finishDelivery` line ~724-730).
- **Signatures are private per user** (`driver_signatures_own` RLS: `user_id = auth.uid()`), so the PTD can only draw the *viewer's own* drawn signature; every other driver prints as "Signed electronically {time}" (`PtdDocument.tsx:107-111`).

### What the timeline / last page reads
`ptdTimeline.ts` walks `ptd.pickups`, `ptd.deliveries`, `ptd.loadingSigs`, `ptd.parks`, `ptd.truckChanges`, trailer events, delays, off-duty answers and fuel stops. `parkRecords` (`tripFlow.ts:941-968`) shows "parked → taken over by X" (`PtdDocument.tsx:177`). `ptd.truckChanges` drives the "Truck A → B" line and per-truck mileage (`tripMiles`, `lib/trips/truckChange.ts`).

### Everything that assumes one driver or one pickup
- `trips.driver_id` is the only trip-level driver; the PTD page fetches shift events and fuel stops by **`trip.driver_id` only** (`page.tsx:182-208`: `shift_events … .eq("user_id", tripDriverId)`, `fuel_purchases … .eq("driver_id", tripDriverId)`), so after a handoff the first driver's off-duty answers and fuel stops disappear from the PTD.
- `loader = loadingSigs[0]` (above).
- `trip.begin_miles / end_miles` are single values per trip; `tripMiles` only splits by *truck change*, not by *driver change*.
- `trip.shipper/customer` single; per-order shipper/customer in `trip_orders` is mostly unused.
- `buildPtd.billing` rolls net **per order number + product** (`ptd.ts:~125-134`) and skips `retained`; this is the one place the order is already first-class.
- `billingTime` (`lib/trips/billingTime.ts`) is a single trip-wide clock: trip `started_at` → first rack → … The "travel to first rack", "trying to load", "to delivery" buckets assume one first pickup and one loaded pickup.
- Pickups are filtered to ones with `left_at` or loads (`ptd.ts:~147-148`); no-load racks print separately.
- Package server and email (`packageServer.ts:48`) names drivers from `[trip.driver_id, deliveries.delivering_driver_id, events.actor_id…]`.

### Reuse / change / risk
- **Reuse:** the whole `buildPtd` structure (per-stop sections, per-compartment table, billing roll-up, park/handoff/truck-change records). Per-delivery `delivering_driver_id` and per-pickup `signature_accepted.pickup_id` are already the right granularity for multi-driver.
- **Must change:** loading signatures per pickup (not `[0]`); shift/fuel fetch for *all* drivers who touched the trip; mileage/time attribution per driver and per leg; drop-driver row semantics if one stop gets two drivers; non-tank receptacle columns (§2).
- **Risky:** PTD is derived live from current rows, so changing what a row means (e.g. `driver_id` semantics) rewrites old PTDs. The PTD for completed trips is not snapshotted anywhere I found (**not verified** whether the emailed PDF in `trip_packages`/storage is archived; `sendTripPackage` sends once, `packageServer.ts`). Printed signatures only for the viewer is an existing limitation, not new.

---

## 4. Load flow (Planner, weight math)

### The pieces
- Plan state: `compPlan: Record<compNumber, {empty, productId, capOverride?}>` lives in `app/planner/model/usePlanModel.ts:88`; saved/restored by `usePlanSlots` (slot 0 = live, 1-26 = lettered plans, keyed by user + combo). `capOverride` now also follows the driver (`useDriverPrefs.ts`).
- Weight math (`app/planner/hooks/usePlanMath.ts`): `targetWeight = combo.target_weight` (line ~239), **`tare = combo.tare_lbs + onBoardLbs`** (line 242), `allowedLbs = max(0, targetWeight − tare)`, binary search in `usePlanRows` → `planForGallons`/`solveMaxGallons` (`app/planner/utils/planMath.ts:302, 339`), CG bias from `cgSliderToBias(cgSlider)` (line 49). `computeAvailableCapacity` (`lib/capacity/computeAvailableCapacity.ts`) re-solves against the configured safety caps, ignoring `capOverride` (anti-gaming rule), and feeds `record_load_utilization` (line ~302-311).
- Begin: `beginLoadToSupabase` (`app/planner/hooks/loadWorkflow/useLoadStart.ts`) calls RPC `begin_load` (live function). Complete: `useLoadComplete.ts` calls `complete_load` then `recordLoadUtilization` (line 198). Link to trip: `linkLoadToOpenTrip` (`tripLogic.ts:291-315`).

### Where the truck is assumed empty or single-terminal/BOL
1. **Server tare ignores what's aboard.** `begin_load` writes `load_log.tare_lbs = equipment_combos.tare_lbs` (live function body: `v_combo.tare_lbs`), i.e. the empty tare. The client's `tare` (which adds `onBoardLbs` for a second pickup) is only used for `planned_gross_lbs` and the capacity inputs. `record_load_utilization` computes `v_actual_gross := load_log.tare_lbs + sum(load_lines.actual_lbs)` and gates `excluded_safety` on `v_actual_gross > v_legal`. **With retained/aboard product the server's gross is understated** (no column on `load_log` for aboard weight). `load_capacity_snapshot.tare_lbs` is the same empty tare, so a stored snapshot can't reproduce the client's capacity either.
2. **"Retain / second pickup" exists but is a bolt-on, not a model.** `AddPickupSheet.tsx` + `trip_pickups.planned_comps` plan only the empty compartments; `usePlanMath.ts:180-248` (`tripPartial`) reads the open trip's first un-left pickup with `planned_comps`, finds `aboard` = other pickups' `disposition='loaded'` compartment loads, converts them to lbs (`productLbsOnBoard`, `lib/trips/truckChange.ts:25-39`, using `gross_gallons/api/temp_f` and the product's `alpha_per_f`) and adds that to tare; plan compartments not picked are forced empty (the effect at ~194-225). It **breaks silently when `api`/`temp_f` are missing on an aboard row** (`missing++`, weight skipped).
3. **CG/position ignore aboard product.** `solveMaxGallons`/`cgBias` run only over the planned compartments (`capacityCompartments` skips empty comps, `usePlanMath.ts:~276-299`); aboard product contributes weight via tare but not its longitudinal position, so axle/CG effects of a retained front compartment are not modelled.
4. **One active Planner load per driver.** `loadWorkflow.activeLoadId`, `clearActivePlannedLoad`, one `compPlan` per combo; `linkLoadToOpenTrip` attaches to "the first pickup without a load and without `left_at`" (`tripLogic.ts:304`).
5. **One terminal and one BOL per pickup.** BOL/supplier are per `trip_compartment_loads` row and entered in the Finish Loading sequence (`confirmLoaded`, `tripFlow.ts:312-382`, grouped per BOL by `lib/trips/bolGroups.ts`), so several BOLs *at one pickup* are supported (split load at one rack); several *terminals* = several pickups. `load_log.terminal_id` is a single terminal.
6. **Terminal switch mid-load** (`app/planner/hooks/useTerminalSwitchDuringLoad.ts`): `applyTerminalSwitch` (line 167) either closes the old pickup as `no_load` (`closePickupNoLoad`, `tripFlow.ts:477`) and starts a new one (a rack hop; the load is cancelled and the plan kept), or retags the pickup (`retagLoadPickup`, `tripLogic.ts:347`). It assumes nothing has been loaded yet at the first terminal; it has **no concept of a partly-loaded first terminal followed by a second one on the same Planner load.**
7. `recordLoadCompleted` (`tripFlow.ts:246-292`): comp loads are looked up per `pickup_id`; compartments the driver did not fill this time are set `disposition='cancelled'` **only within that pickup's own rows** (so it doesn't cancel retained product from an earlier pickup), good; but `order_id` falls back to `pickup.order_id ?? primary order`.
8. Cancel/abandon: `unlinkCancelledLoad` returns the trip to `draft` if no other pickup has a load (`tripLogic.ts:317-336`): a trip with product already aboard and a *second* pickup cancelled stays `loading`.

### Reuse / change / risk
- **Reuse:** `planForGallons`/`solveMaxGallons`, `usePlanMath`'s `tripPartial`/`onBoardLbs` approach, `productLbsOnBoard`, `computeAvailableCapacity`, `AddPickupSheet`, per-BOL grouping, `pickup.planned_comps`, `linkLoadToOpenTrip`.
- **Must change:** persist the aboard weight at begin time (a column or snapshot on `load_log`/`load_capacity_snapshot`) so `record_load_utilization`'s safety gate and snapshots use the true tare; model aboard compartments in CG/position; make "aboard" a first-class concept rather than "other pickups' `loaded` rows".
- **Risky:** `begin_load`/`complete_load`/`record_load_utilization` are live-only SQL functions (no migration file for the first two in this repo, **verify before editing**); they are `SECURITY DEFINER` with `auth.uid()` ownership checks (§6). Changing tare semantics changes historical `load_utilization` comparability (`calc_version` exists for this).

---

## 5. Recovered gallons / incentive calc ("Payload Utilization")

The old "Recovered Gallons"/`load_points` system was removed (migration `20260906010000_drop_legacy_incentive_system.sql`). Today's equivalent is **Payload Utilization**:

- Per-compartment inputs: `record_load_utilization(p_load_id, p_capacity jsonb)` rebuilds `load_capacity_snapshot.compartments` from `load_lines JOIN trailer_compartments JOIN products` using `ll.actual_api`, `coalesce(ll.actual_temp_f, ll.temp_f)`, `p.api_60`, `p.alpha_per_f`, `tc.cap_gallons` (live function). Actual gallons/lbs = `sum(load_lines.actual_gallons/actual_lbs)`.
- Available capacity comes **from the client** (`p_capacity.available_gallons`), computed by `computeAvailableCapacity` with the combo's `target_weight` ceiling and tare including aboard lbs. The server re-derives inputs and the safety gates, not the capacity solve itself.
- Eligibility: `excluded_incomplete_data` if `available <= 0`; `excluded_safety` if `actual_gross > legal` or any compartment `> cap + 0.5`; `excluded_constraint` for unquantified `load_constraints`; else `utilization = actual_gallons / effective_available`.
- Reads: driver card (`lib/capacity/useUtilization.ts`), Period Report, fleet dashboard; RLS `load_utilization_own_read` and `_staff_read`.

### What would break
- **Retained product in a compartment:** `load_lines` only contains compartments planned for *this* load, so retained compartments are invisible to utilization (good for "this load's gallons"), but (a) `v_actual_gross` omits their weight (the §4.1 gap → safety gate under-reports overweight); (b) available capacity computed client-side excludes their volume but includes their weight in tare, so `utilization_pct` stays internally consistent only if the aboard weight made it into the client tare. If `api`/`temp_f` were missing on the aboard row, `productLbsOnBoard` skips it and capacity is **overstated**.
- **Two BOL contributions to one compartment:** `load_lines UNIQUE (load_id, comp_number)` allows **one** actual row per compartment per load. A splash blend or a top-off on a partly full compartment uses *two* `trip_compartment_loads` rows (merged for display by `mergeBlendRows`) but must collapse to one `load_lines` row with a single `actual_api`/`actual_temp_f`; two different API/temps in one compartment (the case you describe) cannot be represented without a density rule (weighted?). The code that picks "heaviest/coldest" for pooled per-product readings is `useLoadComplete.ts` `product_updates`, not per compartment.
- **Several terminals/loads on one trip:** utilization is **per `load_log` row** (per Planner load), not per trip/order. Each pickup's load is scored separately against the capacity that remained for it; fine for split loads, but aggregates that sum per trip or per order don't exist.
- **A load completed by a different driver than began it:** `record_load_utilization` raises `unauthorized` when `load_log.user_id != auth.uid()` (§6).

### Reuse / change / risk
- **Reuse:** the whole engine and `record_load_utilization` for loads begun and finished by one driver; `calc_version` for versioning.
- **Must change:** tare/aboard handling (above); a rule for a compartment with two BOL lines (per-line vs weighted density); decide whether utilization attaches to the Planner load, the pickup, or the order.
- **Risky:** `load_utilization`/`load_capacity_snapshot` are append-only evidence with a stored `calc_version`; do not recompute history in place. `load_constraints` (the Out-of-Allocation auto-link) joins on the load's terminal and product; a multi-terminal order needs a per-load, not per-order, lookup.

---

## 6. Driver / permission model

### Two different visibility regimes (important)
1. **Planner loads (`load_log`, `load_lines`): own-only for drivers.**
   - `load_log_select_own`: `user_id = auth.uid()`; `load_log_select_trainee`: `trainee_id = auth.uid()`; `"admins can read company member loads"`: role in (`admin`,`dispatch`) of the viewer's active company and `load_log.user_id` in that company (note: **`lead` is not in this policy**; `owner` is not either).
   - `load_log_insert_own`, `load_log_update_own`; `load_lines_*_own` (select/insert/update/delete via `load_log.user_id = auth.uid()`); `"admins can read company member load lines"` for `admin|dispatch`.
   - Functions: `complete_load`, `delete_load`, `record_load_utilization` all raise unless `load_log.user_id = auth.uid()` (live bodies). `begin_load` only checks the combo's company (`_caller_in_company`).
   - This is the "drivers can't see other drivers' loads" rule: it is enforced **in RLS and in the SECURITY DEFINER functions on `load_log`/`load_lines`**, not in app code.
2. **Trips and their children: company-wide, any member, read and write.**
   - `trips_read`: `trip_company_member(company_id)`; `trips_update`: same (USING and CHECK); `trips_insert`: `trip_company_member(company_id) AND (created_by = auth.uid() OR trip_exists(trip_id))`.
   - `trip_orders/pickups/deliveries/compartment_loads/delivery_tanks`: policy `*_member` = `trip_member(trip_id)` for ALL (`trip_member` = the trip's company via `trip_company_member`, which is `is_super_admin() OR a user_companies row`). `trip_events_read`: `trip_member`; `trip_events_insert`: `trip_member AND actor_id = auth.uid()`.
   - **There is no driver/role check on trip tables.** Any company member can read or update any trip in the company; "who may resume" is purely app logic (hydration by `driver_id`, `handoffCandidate`, `takeOverTrip`, `resumeTrip`, `parkedTripOnTrailer`). A second driver or dispatch is **not** blocked from reading/editing trip rows by RLS.
   - The `trip_sync_write` trigger (BEFORE INSERT/UPDATE on all trip tables) keeps the newest `client_updated_at` and ignores stale writes (`return old`), so concurrent offline writes by two drivers are last-writer-by-client-clock per row.

### What actually blocks a second driver today
- **`load_log`/`load_lines` ownership.** If driver 1 began a Planner load (Plan Review) and driver 2 tries to finish/edit/delete it: `complete_load`, `delete_load`, `record_load_utilization` raise `unauthorized`/"not owned by you"; `load_lines` updates are blocked by RLS. In the normal flow this is dodged because parking requires a finished load (`canPark`, `tripFlow.ts:848`) and driver 2's new pickup begins a **new** `load_log` under their own `user_id`; but **editing a finished load** (`updateLoadedCompartments`/Edit Load) and viewing its `load_lines` report from a different driver will fail (`load_lines_select_own`; `admin|dispatch` can read).
- **Signatures** are own-only (`driver_signatures_own`).
- **Local store hydration** (`lib/trips/useTripHydration.ts:38-90`) pulls trips where `driver_id = me` (open/parked/dispatched, plus last 10), **plus any open/parked trip on my current trailer** (`.eq("trailer_id", trailerId).in("status", open)`). A second driver sees someone else's trip only through the *trailer*, or after the driver column is overwritten. Children (`trip_orders/pickups/deliveries/compartment_loads/delivery_tanks`) are fetched only for trips in that set.
- `empty_moves` RLS: owner or staff; `shift_events` select: owner or staff.
- Roles: `is_company_staff` = `owner|admin|lead|dispatch` (+ super admin); `is_company_member` = any `user_companies` row; `trip_company_member` = member or super admin.

### How handoff works now (the only multi-driver mechanism)
- `takeOverTrip` (`tripFlow.ts:821-831`), `resumeTrip` (`:909-934`), and `takeOverParkedTrip` (`parkHandoff.ts:12-32`) **overwrite `trips.driver_id` (and `truck_id`)** with the new driver and log a `handoff` event. The former driver is preserved only in event payloads, `handoff_from`, and the per-row `loading_driver_id`/`delivering_driver_id`.
- After that, driver 1 loses the trip from their `driver_id = me` queries (their phone prunes it via `pruneMissingTrips`, `useTripHydration.ts:~58-66`).

### Reuse / change / risk
- **Reuse:** the permissive trip RLS means **no RLS change is needed for a second driver to see/resume trip rows**; park/resume/handoff events and `parkHandoff.ts`; `shift_events`/staff policies for dispatch.
- **Must change:** a real driver-participation model (so overwriting `driver_id` doesn't erase driver 1); `load_log` ownership for loads that are completed or edited by someone other than the starter (or avoid it by always giving driver 2 a new load); `trip_sync_write` last-write-wins needs a conflict rule if two phones edit one delivery concurrently; signature display for non-viewer drivers.
- **Risky:** because trip-table RLS has no per-driver check, any new per-driver privacy requirement (e.g. hiding driver 1's financial/BOL data from driver 2) has to be added to RLS and every reader at once. `load_log` admin policy omits `lead`/`owner` (existing inconsistency with `is_company_staff`).

---

## 7. "Trip in progress" / dashboard state

- **Active trip = `openTripForDriver(trips, userId)`** (`lib/trips/tripLogic.ts:31-36`): trips with `driver_id === userId` and `status ∈ OPEN_STATUSES = {draft, loading, in_transit, delivering}` (line 23); newest `started_at ?? client_updated_at` wins if two exist. `parked` and `dispatched` are **not open**. Single open trip per driver by construction (the dashboard uses `openTrip`, `useHomeBase.tsx:366`).
- Dashboard step = `nextStep(openTrip, snap)` (derived; §2). Gauges, Terminal/Recent Deliveries cards, access strip, the trailer strip with residue (`useTrailerResidue`) all key off `openTrip`, `snap`, `aboardRows`.
- Server-side open sets: shift auto-end uses `trips.status in OPEN` (`lib/shifts/autoEndServer.ts:45`); fleet board/`useFleetTrips` read open + parked trips company-wide.

### What ending a shift does to a trip
- **Manual end shift** (`finishShift`, `useHomeBase.tsx:324-327`): odometer confirm (`OdometerConfirmSheet`), `shift.end()`, truck-status question, `releaseAfterShift` (release truck/trailer claim, pairing stays coupled and free). I found **no code in that path that changes `trips.status`**; the trip stays open.
- **Auto end** (`autoEndServer.ts:114-165`, run every 5 min by `/api/cron/hos-alerts`): asks "still working?" after 30 min idle (180 min with an open trip, `wrapUp.ts:11-12`), ends after 15 more minutes. `closeShift` then: if a delivery is open and stale → inserts a `finish_needed` trip event (no parking); else if product is aboard (`disposition='loaded'`) → **sets the trip `parked`** (`parked_for='layover'`, `parked_where` = nearest saved place, note "Parked automatically…") and logs `parked`; then closes/ends moves and calls `auto_park_equipment` (release claim; keeps the pair coupled; empty equipment → Readyline).
- A trip in `draft/loading` with **nothing aboard** is untouched by shift end.

### Overnight
- `lib/trips/abandonedServer.ts` `cancelAbandoned`: cancels trips in `draft|loading` **with no product aboard** and no activity for `ABANDON_AFTER_H = 16` hours (`abandoned.ts:7`), reason `AUTO_REASON`; emails a Monday report; deletes cancelled loads older than a week.
- A trip with product aboard becomes `parked` at shift end (or stays open if the driver never ended the shift), and a `parked` trip never auto-cancels. Parked trips stay hydrated on the phone of the driver who holds that trailer (`useTripHydration` `open` set includes `parked`).
- `parkTrip` (`tripFlow.ts:854-896`) resets any delivery arrived-at-but-not-begun to not-arrived and clears tank picks on loaded compartments, so a resuming driver arrives fresh.

### Reuse / change / risk
- **Reuse:** derived `nextStep`, park/resume/handoff, auto-park at shift end, abandon sweep, `canPark` rules.
- **Must change:** "active trip" is per **driver**, not per **truck/order**. Driver 2 resuming means `driver_id` flips and driver 1 has no active trip; there is no way for two drivers to both have the same order "in progress" at once, which fits your rule (one active driver per truck) but means the order needs an identity separate from `driver_id`.
- **Risky:** abandon sweep and `wrapUp` count "open trip" by `trips.driver_id`; any new state (e.g. "order waiting for second driver") must be added to `OPEN_STATUSES`/`CHECK` and every `status` switch (many readers: `lib/dispatch/*`, `useFleetTrips`, `TripsBrowser`, `dashboardCards`, `abandoned.ts`, recap, `eodServer`).

---

## 8. Locations / sites

- **Where stored:** `delivery_locations` + `delivery_location_tanks` (company-scoped; RLS `delivery_locations_read/insert/update` = `trip_company_member(company_id)`; `delivery_location_tanks_all` via the parent location's company). `place_kind(s)` includes `store|yard|maintenance|terminal|fuel|shipper`. Terminals are mirrored as locations (`terminal_id`, unique per company).
- **Edit surface:** `app/planner/locations/page.tsx` → `components/trip/DeliveryLocationsModal.tsx` → `components/trip/LocationEditor.tsx` (469 lines). Tank drafts `TankDraft = {tank_id, tank_number, product_id, capacity, hose}` (line 29); duplicate numbers rejected (line ~217); upserts existing tanks by `tank_id`, new ones by `(location_id,tank_number)`; removed tanks are retired with `is_active=false` (lines ~273-298); a try/retry strips `hose_length_ft` for databases missing the column. Tanks are also auto-remembered after a delivery (`rememberTanks`, `lib/trips/useTripData.ts:~255-277`) and re-ordered via `saveTankOrder` (`sort_order`).
- **Site notes:** `components/site/SiteNotes.tsx` is the one notes component (`mode="edit"|"read"`; kind `terminal|location`), backed by `lib/sites/useSites.ts` (`useSiteNote` → `terminal_notes` or the `get_site_note`/`set_site_note` RPCs over `site_notes`, shared across companies by normalized name/number/city; terminal notes block account-number-looking text via `looksLikeAccountNumber`). `useSiteAverage` computes average time at a site from `trip_pickups`/`trip_deliveries`. Used in the Locations tool, both arrival windows (edit) and the dashboard pop-out (read).
- Site boards/recent drops: `recent_deliveries_at_location` RPC (matches the same store saved by other companies by normalized name/number/city or within ~2 mi), `SiteBoard.tsx`.

### Reuse / change / risk
- **Reuse:** the locations list, `place_kinds` multi-kind column, `delivery_location_tanks` many-rows-per-location, `SiteNotes`, `site_notes` sharing.
- **Must change:** a "receptacle" row kind (tank/generator/boat/equipment/…), possibly per-kind unit and capacity semantics; `LocationEditor` UI is tank-shaped (Tank #, product, gal, hose ft); a one-site-many-kinds mix needs `delivery_location_tanks` generalized (or a sibling table) and the `TankDraft` editor.
- **Risky:** unique `(location_id, tank_number)` and text joins mean renaming/retiring a receptacle affects history matching; `delivery_location_tanks` is read by dispatch, `DropSiteSheet`, `recent_deliveries_at_location`, `rememberTanks`; any column rename breaks those. `delivery_locations_one_store` unique index and the cross-company `site_notes` matching depend on normalized name/number/state/city.

---

## 9. Per-area: reuse / change / risk summary (items 1-8)

| # | Reuse as-is | Must change | Risky / migration hazards |
|---|---|---|---|
| 1 Data model | `trips` as container; `trip_orders`; `trip_pickups`/`trip_deliveries` multi-row; `trip_compartment_loads.disposition` incl. `retained`; `compartment_readiness`; `trip_events` | An **order** with its own identity/status/driver set; a participation table (driver↔trip/pickup/delivery); `order_id` on deliveries; non-tank receptacles; multi-target per compartment (today only first tank in a column) | `trips.driver_id NOT NULL` + dozens of readers (§10 list); `trip_compartment_loads` has no `(trip, comp)` uniqueness (can't add one without a merge); text tank joins; CHECK constraints on `status`, `delivery_type`, `reading_unit`, `place_kind` (widening needs `ALTER TABLE … DROP/ADD CONSTRAINT`); live-only functions |
| 2 Delivery sequence | `finishDelivery`, `splitToNewDelivery`, `retained`/partial logic, `ValueEntryOverlay`, `TankMap`, readings math | Receptacle abstraction; honor `trip_deliveries.planned_comps`; sequencing (strictly lowest `seq`) if an order's stops are split between drivers; trip-complete rule | Offline store typed rows; `tank_number` string coupling to location tanks; one `unit` for the whole delivery |
| 3 PTD | Per-stop sections, billing roll-up by order+product, park/handoff/truck-change blocks | `loadingSigs[0]` → per pickup; shift/fuel/mileage by driver; receptacle columns | PTD is derived live (rewrites history); other drivers' signatures can't be shown (RLS) |
| 4 Load flow | Weight/capacity engine; `tripPartial`/`onBoardLbs`; `AddPickupSheet`; per-BOL grouping | Server tare must include aboard weight; CG over aboard compartments; retained as a first-class input | `begin_load`/`complete_load`/`record_load_utilization` are live-only DB functions; `calc_version` and snapshot comparability |
| 5 Utilization | Engine and gates for single-driver loads | Aboard weight in gross; two-BOL-per-compartment rule; scope (load vs pickup vs order) | `load_lines` UNIQUE(load, comp); write-locked evidence tables; ownership check |
| 6 Permissions | Trip-table RLS is already company-wide: no change needed to *see/resume* | Driver participation; `load_log` ownership for non-starters; conflict rule for concurrent edits | `load_log` admin policy omits `lead`/`owner`; no per-driver privacy on trip tables; `trip_sync_write` last-write-wins |
| 7 Trip in progress | Derived `nextStep`; parking; auto-park at shift end; abandon sweep | "Active" is per driver; need order-level state independent of `driver_id` | New `status` values touch `CHECK`, `OPEN_STATUSES`, ~25 reader files |
| 8 Locations | `delivery_locations`, many tanks per site, `place_kinds`, `SiteNotes` | Receptacle kinds and editor | Unique `(location_id, tank_number)`; dispatch/recent-drops readers; cross-company note matching |

### Migration hazards, consolidated
- **Existing data:** every completed trip has exactly one `driver_id` and tank-only delivery rows. Backfilling a participation table from `handoff` events is possible but lossy (events have `from/to` driver ids but not "who loaded which compartment" except via `loading_driver_id`/`delivering_driver_id`).
- **CHECK constraints** that would need widening: `trips_status_check`, `trip_deliveries_delivery_type_check`, `trip_delivery_tanks_reading_unit_check`, `delivery_locations_place_kind_check`, `trip_compartment_loads_disposition_check`, `trip_pickups_pickup_type_check`.
- **RLS:** trip tables use `trip_member()`; adding a per-driver rule means rewriting all six `*_member` policies plus `trip_events_*`. `load_log`/`load_lines` own-only policies are a hard wall for any "driver 2 completes driver 1's load" design.
- **Triggers:** `trip_sync_write` (BEFORE INSERT/UPDATE on all trip tables, keeps newest client time, returns `old` for stale writes silently); `trg_touch_long_line_on_hop` (trip_pickups); `trg_clear_outage_on_load`, `trg_touch_long_line_on_load` (load_log UPDATE). `trg_clear_outage_on_load` clears rack/outage state when a load flips to `loaded`, so splitting "loaded" semantics across pickups interacts with it (**not read in detail**).
- **Backfills:** none exist for per-order data; `trip_orders` rows have `order_number` free text, no uniqueness; dedupe is app-side only, so two trips already can share an order number if checks were bypassed/offline.
- **Offline store:** phones queue rows keyed by table and column names (`lib/trips/types.ts`, `tripStore.ts`, `supabaseSender.ts`). A renamed or required new column breaks queued writes from older app versions (a PWA can run an old bundle for a long time); new columns must be nullable and tolerated when absent, as `bio_gallons` and `hose_length_ft` already are.
- **Live-only functions** (no migration file in this repo for several): `begin_load`, `complete_load`, `delete_load`, `record_load_utilization` (the last has migrations `20260905*`, but the live body is later), `claim_combo`, `couple_combo`, `set_equipment_status`. Read the live definition (`pg_get_functiondef`) before changing any of them.

---

## 10. Open questions only you can answer

1. **What is an "order" in your model?** Today one trip carries 1..n order numbers and the order number is not unique in the DB (only an app check against *live* trips). For "an order with several BOL pickups and several drops handled by two drivers", is the order the container (one record that outlives driver 1's trip), or does each driver's leg stay its own trip tied to a shared order number? The app's duplicate-order check currently *forbids* two live trips with the same order number, which blocks the second option as built.
2. **Should driver 1's trip row be preserved?** Today `driver_id` is overwritten on resume/handoff. Do you need to query "all trips driver 1 touched" (pay, hours, recaps, utilization credit for the pickups they loaded)? Several reports key off `trips.driver_id` (dispatch board, recap, EOD, package email, PTD shift/fuel fetch).
3. **Who gets credit for a split load's utilization and miles?** Per load (pickup), per order, or per driver-leg? Utilization is per `load_log` row today.
4. **"Retain" semantics:** is retained product (a) a prior load of the **same order** that continues, (b) a different order's product still aboard (so the new load is for a different customer), or (c) either? It changes billing roll-up, the BOL/PTD, and whether `trip_compartment_loads.order_id` must differ across rows in one compartment.
5. **Two products/BOLs in one compartment:** is that allowed (blends, top-offs of a partly full compartment) or must each compartment hold one product? `load_lines` is one row per compartment per load, and the planner assumes one density per compartment.
6. **"Truck-to-truck transfer" meaning:** (a) a loaded **trailer** moving to a different truck (today's `truck_change` event, same trip), (b) product pumped from one **trailer/truck into another** (a transfer between trailers with its own BOL/PTD), or (c) a driver-to-driver swap of the *truck* while the trailer stays? Only (a) and the handoff exist.
7. **Non-tank deliveries:** do generators/boats/equipment need a **gallons-delivered** only, a **meter** reading, or a **before/after** gauge? Do they need their own PTD wording (consignee, "receptacle")? Is the product list per receptacle (one product per site tank) or free (a boat takes whatever you drop)? Should a site's receptacles be **pre-defined** in the Locations tool or ad-hoc at the drop?
8. **One site, mixed receptacles:** if a drop needs both underground tanks (with Veeder-Root readings) and a generator, is that **one delivery** (one arrival/begin/finish, one consignee signature) with several receptacle lines, or **two deliveries** at the same site?
9. **Sequencing across drivers:** may driver 2 deliver stops out of `seq` order (today strictly lowest `seq` planned stop), and may two drivers deliver different stops of the same order on the same day from the same trailer split? Or is it always "park, resume, continue in order"?
10. **Visibility between drivers:** should driver 2 see driver 1's BOL numbers, signatures and notes on a resumed order? Today trip tables are readable by every company member by RLS, but signatures and `load_log` rows are private. Is that gap acceptable, or should it be locked down?
11. **Dispatch's multi-drop plan:** dispatch already writes `trip_deliveries.planned_comps` (which compartments go to which stop). Should the driver app enforce that mapping (pre-assign compartments to the stop) or keep it advisory?
12. **Legacy data:** do completed trips need to be reinterpreted (e.g. backfilled participation/orders) or can the new model apply only to trips created after the migration?
13. **`lead` and `owner` roles:** `is_company_staff` includes both, but the `load_log`/`load_lines` read policy covers only `admin`/`dispatch`. Intentional?

---

## Summary

The container is the **trip**; an "order" is just a row under it with no identity of its own, no uniqueness in the database, and an app rule that forbids the same number on two live trips, which directly blocks "one order, two drivers" if each driver's leg is modelled as its own trip. A trip has exactly one `driver_id`, overwritten on handoff or resume, so driver 1 survives only in event payloads and two per-row driver ids, and most dispatch, recap, EOD and PTD readers key off `trips.driver_id`. The Planner and incentive stack is per-driver, per-`load_log` (`user_id` must equal `auth.uid()` in `complete_load`, `delete_load`, `record_load_utilization` and in the own-only `load_log`/`load_lines` RLS), and **`begin_load` stores the empty combo tare**, so aboard/retained weight never reaches the server's safety gate or snapshot, and CG ignores aboard product. Trip-table RLS is company-wide for every member, so a second driver or dispatch is *not* blocked from seeing or resuming trip rows; the real walls are `load_log` ownership, private signatures, and phone hydration by `driver_id`/trailer. Retain, split pickups, split deliveries (including dispatch's `trip_deliveries.planned_comps`, which the driver flow does not yet read), park/resume and truck change already exist and are the foundation to build on. Deliveries are hard-wired to "tank": `trip_delivery_tanks`, `delivery_location_tanks` and a text `tank_number` joined by string, plus tank-shaped UI, readings, ullage and PTD columns, so generators, boats and mixed sites need a receptacle abstraction (a new kind plus widened CHECKs) added in a way that keeps existing tank rows and the offline queue working.
