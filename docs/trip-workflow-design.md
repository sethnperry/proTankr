# Trip Workflow — Design

The in-cab workflow from "dispatch gave me an order" to "every compartment is
delivered," replacing the paper Product Transfer Document (PTD). Worked out in
conversation 2026-10-10. **Nothing here is built yet.** Gemini's PTD was used as
an example of what fleets fill out today; it is not the target customer, and the
PTD this app produces is our own layout.

Replacing Transflo (or whatever document system a fleet uses) is a later goal.
This design moves toward it (complete digital record, printable PTD, exports)
without depending on it.

---

## 1. Principles

1. **The normal load is the main path.** One order number, one BOL number, one
   driver, one pickup, one delivery. Every deviation (second order number,
   different BOL on a product, second delivery, split, handoff, rack hop) is an
   add-on the driver taps only when it applies. Nothing on the main path asks
   about edge cases.
2. **Prefill everything, type almost nothing.** The driver confirms or edits.
   On a normal load the only things typed are the order number, the BOL number,
   and odometer readings when they are actually needed.
3. **One flow for everyone.** No feature toggle. Solo drivers and fleets use the
   same screens; company settings decide what is *required* (consignee
   signature, tank readings, delay thresholds). Two code paths is what makes
   things fragile.
4. **Works offline.** Every step saves to the phone first and syncs when there is
   signal. The driver never waits on the network.
5. **Our math has to be right.** Net gallons are calculated with the industry
   standard method and proven against real BOLs before anything is flagged.
6. **Can't touch the phone while delivering.** Delivery is captured in one tap on
   arrival, then one combined screen after the delivery is done.

---

## 2. Structure

The compartment is the real unit, because each compartment can carry its own
order number, supplier, pickup terminal and lot, and compartments can be loaded
and delivered at different times.

- **Trip** — truck + trailer, the driver holding it, beginning/ending miles,
  signatures. A container.
- **Compartment load** — one per compartment filled: pickup, supplier, order
  number, BOL number, product, gross, net, temp, API, loading driver, loading
  times and delay.
- **Delivery** — a location, delivering driver, its own times and delay, tank
  readings before/after, and which compartments went into which tanks.
- **Event log** — timestamped events (arrived, began, left) for every pickup and
  delivery. Travel time and delays are calculated from these, never typed.

On a normal load this is one trip, one set of compartment loads that all share
the same order/BOL/pickup, and one delivery. The structure only shows itself
when the driver adds a deviation.

**Billing rollup**: net gallons per product per order number, calculated by the
app.

**How it relates to what exists**: the existing `load_log` / `load_lines`
(plan, planned gallons, API/temp, `complete_load`) becomes the compartment-load
part of a trip. Everything already built for loading (Plan Review, tune, stale
API handling, mid-load terminal switch, outage reports, utilization recording)
keeps working as is. A mid-load terminal switch updates the compartment loads'
pickup as well as `load_log`.

---

## 3. Compartment readiness

Per compartment, separate from the trailer's maintenance/wash statuses:

| Status | Set when | Can load? |
|---|---|---|
| Cleaned & Purged | Every compartment starts here; an **Interior** wash record sets it | Yes |
| Pre-Loaded | Compartment is loaded | No |
| Residue | Compartment fully delivered (always) | Yes |
| Retained | Not delivered, or only partly delivered | No |

- Locking is per compartment, never the whole trailer. Rack hopping and
  "deliver two compartments, reload them elsewhere, deliver the full load
  somewhere else" work naturally.
- The existing wash record gains a type: **Exterior** or **Interior**. Interior
  sets the chosen compartments to Cleaned & Purged.
- **Switch-loading warning**: because Residue remembers the last product, the app
  warns when a **diesel-family product** (diesel/ULSD, dyed diesel, biodiesel
  blends, kerosene, jet, heating oil) is planned into a compartment whose
  residue is **gasoline** (any grade or ethanol blend). That's the one rule; it
  is a warning, not a block. Shown on the plan before loading, not after.

---

## 4. Locations

Two kinds: **Pickup** and **Delivery**. Each has a type, so nothing assumes
terminal-and-store.

- Pickup types: terminal/rack (the existing terminal catalog), railcar,
  transload, other.
- Delivery types: **Drop** (gravity into below-ground tanks) or **Pump-off**
  (truck pump into above-ground tanks).

**Delivery locations** are a new company-wide list (shared by every driver in
the company, unlike personal favorites):

- Name, number (store number etc.), address, coordinates (geocoded on save),
  delivery type, notes (hose length, gate code, etc.), and its tanks (tank
  number, product, size).
- Tanks are remembered, so matching compartments to tanks is prefilled after the
  first visit.
- Picker opens on **Near Me**: everything within 150 air miles of the current
  pickup terminal. Starred locations always show regardless of distance.
  Search by number, name or city.
- **One-off delivery**: free text, not saved to the list.
- Pump-off shows on the location card for dispatch and drivers.

---

## 5. Times and delays

Same pattern at pickups and deliveries:

1. Driver taps **Arrived** (at a delivery: while still parked, before getting out).
2. When the driver finishes that step, the app fills in **begin = 10 minutes
   before now** and **leave = now**. Either can be edited.

- **Loading delay** = arrival → begin loading.
- **Delivery delay** = arrival → begin delivery.
- **Travel time** = leave pickup → arrive at delivery.
- The 10 minutes is a company setting, default 10.
- On a Pump-off delivery the delivery-time row is labeled **Pump Time**
  (that's what billing reads), no extra field.
- Over the company threshold → a reason is required: a company-managed dropdown
  (separate lists for loading and delivery delays) plus "Other" with free text.

### Standards and monitoring (later phase)

The timestamps give companies real data with no extra driver input:

- Expected loading/delivery times per location, location type and equipment.
- Slow locations, by hour and day of week.
- Drivers regularly over the expected time — measured against what that same
  location normally takes, never ranked on raw totals (same rule as the
  utilization dashboard: no blame charts).
- Delay reasons over time, separating location problems from driver problems.
- Network bonus: pooled rack wait times across companies, by hour, the same way
  API readings are pooled ("this rack is running 40 minutes right now").

---

## 6. Miles

- **Beginning miles** = the **truck's** last ending miles (per truck, not per
  combo or driver), prefilled. The first trip ever for a truck asks.
- **Ending miles** asked once, when the trip is fully delivered.
- In between, odometer is asked only when a pickup is in a different city from
  the previous one (rack hop across cities). Same-city hops don't ask.

---

## 7. Net gallons

- Gross is prefilled from the planned gallons per compartment; editable.
- Net is calculated from gross, temp and API, corrected to 60°F; changing gross
  or temp/API recalculates it.
- The temp and API used should be the BOL's values (the terminal's meter temp
  and gravity), so the confirm step prefills from our numbers but the driver
  corrects them to the BOL when they differ.
- If the driver edits **net** directly and it differs from our calculation by
  more than **±2 gallons per compartment**, the PTD shows a flag:
  "net edited from calculated (X → Y)". No review workflow, just the flag. The
  wording never claims the terminal is wrong.

### Making sure the math is right

Today's planner uses a simplified expansion model that's fine for weight but is
**not** the terminal method. For net we implement the standard volume
correction:

**Decision**: one method to start — API MPMS Ch. 11.1 / ASTM D1250
**Table 6B** (generalized refined products) — for every product except neat
ethanol and B100. That covers gasoline (all grades, including finished E10/E15),
diesel, dyed diesel, biodiesel blends (B5/B20), kerosene, jet. Rounding per the
standard (temp and API to 0.1, correction factor to the standard's decimals,
net to whole gallons), confirmed by the BOL test set.

- **Neat ethanol and B100**: no net prefill; the driver enters net from the BOL.
  They use different correction methods and are rare loads; not worth adding
  until there's demand.
- **Each product is marked validated or not.** A product is validated once the
  BOL test set shows our net matching to the gallon. All covered products
  prefill net, but the ±2 gallon edited-net flag only appears on the PTD for
  validated products, so an unproven calculation can never produce a flag.
- Known risk the test set will settle: some terminals compute ethanol-blended
  gasoline net per component (base gasoline + ethanol separately) instead of on
  the blend. If BOLs show that, E10/E15 get the component method; until then
  they stay unvalidated (prefilled, never flagged).

**Gate before release**: collect 20–50 real BOLs across products and terminals,
run our calculation on each BOL's own gross/temp/API, and ship only when ours
matches the BOL net to the gallon. These become permanent unit tests.

---

## 8. Signatures

- Loading driver and delivering driver: required. Consignee: optional (company
  setting can require it).
- A driver's signature is drawn once and saved. Every load after that is a tap to
  accept. Each acceptance is logged with the time and the trip.

---

## 9. Screens, normal load

### Driver dashboard (new home screen)

- Top: current trip status and the next step, equipment, terminal, open issues,
  expirations.
- One big button whose label follows the trip state: **Start Load → Arrived →
  Loaded → Arrived → Finish Delivery**.
- Below: Plans/presets (the current planner), Equipment, Cards, Reports.
  The planner becomes a step and a tool, not the home screen.

### Start Load (one review card)

All prefilled; tap a row to change it:

- **Order number** — the only field normally typed. Prints once at the top of
  the PTD.
- **Shipper / customer** — from the last trip.
- **Pickup** — the planner's current terminal.
- **Delivery** — nearest starred or recent location.
- **Beginning miles** — the truck's last ending miles.
- **Plan** — current preset.

Add-ons at the bottom: + Order number, + Delivery.

### At the pickup

- **Arrived** (one tap).
- Loading flow as it exists today (Plan Review, tune, etc.).
- **Loaded**: enter the BOL number once (copied to every product unless one
  differs, entered by the product), confirm gross/net per compartment
  (prefilled), confirm begin/leave times (prefilled), delay reason if over
  threshold. Compartments become Pre-Loaded.

Plan Review's current options change: "Log the Load" becomes **Loaded**;
"Back to Planner" becomes **Didn't Load / Cancel** (trip goes back to not
started, not deleted). Report Terminal Issue stays.

### At the delivery

- **Arrived** (one tap, while parked).
- Driver delivers; no phone.
- **Finish Delivery**, one screen: tank readings before/after (optional photo of
  the receipt), compartment → tank match (prefilled from the location's saved
  tanks), begin/leave times (prefilled), delay reason if needed, ending miles,
  tap to accept signature. Compartments become Residue.

Add-on here: **Split** — choose compartments that go somewhere else; they become
a new delivery with its own location, times and readings, still in the same trip.

---

## 10. Deviations

- **Shipper / customer per order number**: possible but very abnormal. Not shown
  anywhere on the normal screens; reachable only from an order number's own
  edit view. Defaults to the trip's shipper/customer.
- **Extra order numbers**: up to one per compartment. Set per compartment only
  when added.
- **Different BOL / supplier / pickup per product or compartment**: edited on
  that row only.
- **Rack hop**: add a pickup; odometer asked if different city.
- **Reroute** (dispatch changes the delivery before or after loading, or it
  doesn't fit): a delivery's location can be changed until that delivery is
  finished; every change logged (who, old, new, when).
- **Partial / retained**: compartments not delivered become Retained and stay
  locked until delivered or reloaded/cleaned per §3.
- **Driver handoff**: the trip belongs to the trailer. When another driver picks
  a trailer with Pre-Loaded or Retained compartments: "Trailer 3151 has order
  #X in progress from Seth. Take over?" Accepting moves the trip and logs the
  handoff. Each delivery records its own delivering driver and signature; each
  compartment load keeps its loading driver. Partial handoffs need nothing extra.
- **Winterizing additive, bio blending**: per compartment/product fields, shown
  only when added.

---

## 11. Issues (later phase)

One issue system for everything: subject is a truck, trailer, delivery location
or terminal; photos, notes, status (open → assigned → done). Examples: vapor
problems, worn drop hoses, gaskets, leaks, a site left messy. Companies get a
task list. Existing terminal outage reports can fold in later.

---

## 12. Offline, late entry, paper

1. **Offline first**: the current trip lives on the phone (local storage) and
   syncs in the background. Writes are queued; conflicts resolved per record
   with the server as the final copy. Easier and more reliable in the native app.
2. **Late entry**: a trip can be entered after the fact with hand-entered times,
   marked as entered later. Covers a dead phone.
3. **Paper, last resort**: a blank printable version of our PTD for the truck,
   entered later through late entry.

---

## 13. PTD

Generated from the trip at completion. Our own layout:

- Order number(s) at the top; shipper, customer, pickup, delivery, date, miles.
- Body: per product — BOL number, supplier, gross, net (+ edited-net flag when
  applicable).
- Per compartment gallons; tank readings before/after per tank.
- Loading and delivery times with delays and reasons; Pump Time label for
  pump-off.
- Signatures.
- A barcode (our own scheme; matching a document system's indexing barcode is
  for the later Transflo-replacement/integration work).

Delivered as a PDF the driver can share or print; stored with the trip.

---

## 14. Build phases

1. **Data model + offline store**: trips, compartment loads, deliveries, events,
   readiness, delivery locations; local-first save and sync.
2. **Dashboard + Start Load card**, wired to the existing planner.
3. **Pickup**: Arrived / Loaded, BOL entry, times, loading delays + reasons.
4. **Net gallons**: standard correction + BOL test set (release gate).
5. **Delivery**: locations list + Near Me, Arrived / Finish Delivery, tank
   readings, compartment→tank, signatures, ending miles, readiness updates,
   interior wash type.
6. **Deviations**: split, extra order/BOL, rack hop, reroute, handoff.
7. **PTD PDF** + printable blank.
8. **Later**: switch-loading warning, standards/monitoring, issues task list,
   additive/bio fields, document-system replacement and exports.

---

## 15. Open items

- Exact rounding of Table 6B and whether E10/E15 BOLs use per-component net
  (both settled by the BOL test set).
- PTD barcode scheme.
