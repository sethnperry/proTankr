# ProTankr — Project Context

Next.js/TypeScript/Supabase PWA for bulk liquid transport drivers, being converted
to a native app (iOS + Android via Capacitor) with a subscription model
(RevenueCat for IAP), sold in both app stores.

Dark #111111 theme, inline React styles. Prefer complete replacement files over
diffs when editing — VS Code edits sometimes don't write to disk, causing git to
miss changes, so always confirm a change actually landed rather than assuming it did.

## Operating posture (stated 2026-09-06)

**There are no real users yet — the app has exactly one operator.** Per
explicit direction: "I am the only user at this point so we don't need to be
overly cautious. I will let you know when we have users." So merging to `main`
(which auto-deploys to production via Vercel), applying migrations, and testing
against live data do **not** need a confirmation round each time. Ship, then
verify.

This is a standing grant with a stated expiry — **it lapses the moment the user
says real users exist.** Until then it covers deploys and schema changes; it is
not a licence to skip verification, and destructive operations against real data
(bulk DELETEs, dropping columns) still get flagged first, because "one user"
means their data is the only copy that exists.

## Product direction

Splitting into two tiers:
- **Basic (solo, tier 1):** individual driver tracks their own equipment/spares,
  no sharing.
- **Fleet (add-on, tier 2):** multi-driver sharing, status visibility across
  drivers, admin-managed. Full build spec below (§ Fleet Tier — Build Spec).

## Fleet Tier — Build Spec (recorded 2026-07-29, not yet scoped into sprint work)

Full spec pasted by user 2026-07-29. Nothing below is built yet — this is the
reference doc for when Fleet tier work actually starts. Cross-check against
"Architecture reality" above before touching schema, as always.

### Equipment sharing
- Service/wash/scale history, inspections, attachments travel with the
  **equipment**, not the driver — visible to all drivers + lead drivers
  (with attribution), so slip-seat drivers see prior condition notes. Leads
  oversee.
- Sensitive equipment data (purchase price, lease terms, insurance claims)
  needs an **admin-only field**, separate from the shared log.

#### Shipped 2026-07-31

Turned out most of "visible to all drivers/leads" was **already true** before
this pass — `service_records`/`wash_records`/`weight_records` RLS has always
been plain company-wide (`company_id = get_active_company_id()`, no role
check at all, matches how `trucks`/`trailers` themselves already work per
"Key existing infrastructure" above), so any company member could already
read any equipment's logs. The only actual gap was **attribution**: all
three tables already had a `created_by` column populated on every insert
(confirmed via `SoloEquipmentModal.tsx`/`WeightRecordModal.tsx`'s own insert
calls), but `RecordHistoryModal.tsx`/`ScaleHistoryModal.tsx` never selected
or displayed it. Fixed by adding `created_by` to each modal's select +
resolving it via the existing `get_display_names_full` RPC (same one
`app/admin/page.tsx` already uses) — shows as "Logged by {name}" under each
expanded row.

`equipment_attachments` (Binder/DocHub permit documents) uploader attribution
was **attempted, then reverted** this same pass — its insert call sites in
`DocHub.tsx`/`BinderModal.tsx` never captured an uploader at all, so I wrote
`uploaded_by` into both selects/inserts plus a tooltip, but a direct
PostgREST check (`select id,uploaded_by from equipment_attachments`) came
back `42703 column does not exist` — this table has no migration file at all
(confirmed via repo search, another migrations-lag instance) and its live
shape doesn't have this column yet. Since that would have 400'd every doc
list/upload silently (neither hook checks the Supabase response's `error`),
**all of it was reverted back to the pre-pass state** rather than shipping
broken reads/writes on a working feature overnight. `DocHub.tsx`'s
`AttachmentRecord` type has a comment marking exactly what to re-add (both
selects, both inserts, the `BinderModal.tsx` tooltip) once the migration
below has actually run — don't rebuild from scratch, the code already
existed and was verified compiling, just re-apply the same diff.

Sensitive equipment data is new (not a revert): `equipment_sensitive_data`
table (same migration file below), `truck_id`/`trailer_id` XOR pattern
matching `service_records`, RLS **strictly `role = 'admin'`** (not
admin+lead, unlike everything else equipment-related — this is the one
piece of equipment data the spec calls out as not belonging in the shared
log). UI is a collapsed "Sensitive Info (admin only)" section inside
`TruckModal`/`TrailerModal` (`lib/ui/driver/EquipmentDetails.tsx`, new
`SensitiveInfoSection` component), gated on a newly-threaded `myRole` prop,
visible only for `myRole === "admin"` and only for existing (non-new)
equipment. Also confirmed via direct PostgREST query not to exist live yet
(`404 PGRST205`) — but unlike attachments, this is a **brand-new,
collapsed-by-default section with no prior working behavior to regress**,
and its save path does check/surface the Supabase error via `Banner`, so an
admin who opens it before the migration runs gets an honest error message,
not silent data loss. Left shipped as-is.

**Migration applied 2026-07-31** (user ran it in the Supabase SQL editor):
`supabase/migrations/20260731000000_equipment_sharing_attribution.sql`
(adds `equipment_attachments.uploaded_by` + creates `equipment_sensitive_data`).
The attachment-attribution diff (`DocHub.tsx`/`BinderModal.tsx`) was re-applied
the same day and live-verified — the Docs modal's `uploaded_by` select renders
with no error. `equipment_sensitive_data` also live-verified end-to-end: the
admin-only "Sensitive Info" section on a truck accepts a Purchase Price save
and reads it back correctly after reopening the modal.

**Explicitly NOT done, flagged for later**:
- **Inspections** — confirmed via repo-wide search that this doesn't exist
  as a feature *at all* (no table, no UI, only an unrelated string match).
  Unlike service/wash/scale, this needs to be designed from scratch, not
  just shared — a real net-new feature, deliberately out of scope for this
  "share what already exists" pass.
- Edit/delete permission gating on equipment logs. `RecordHistoryModal.tsx`'s
  own header comment already flags this as an unresolved fleet-tier
  follow-up ("driver has full read/write/delete control here... gating this
  to admin-only is a fleet-tier follow-up, not implemented yet") — the
  matrix only specifies who can *view* logs, not the edit/delete
  granularity, and that's a real product decision (can any driver edit/
  delete *any other* driver's service record?), not something to guess.
  Left exactly as-is.
- `weight_records` also has no migration file (same lag pattern), but its
  `created_by` column was confirmed live via a direct PostgREST query
  (200, not 42703) before relying on it — unlike `equipment_attachments`,
  this one checked out.

### Fleet-wide underloading dashboard

**Shipped 2026-08-09.** Scope decisions made (asked, not guessed) before
building, since the original spec was a single line:
- **Metric**: reuses the already-computed Incentive System
  `load_points.recovered_gallons` directly — not an independent
  legal-max-vs-actual calculation. Cheap (pure aggregation UI, no new
  calc engine) but means this dashboard only shows real numbers for
  companies that have turned Incentives on and set at least one product
  benchmark; otherwise it shows an explicit "not enabled" message rather
  than a misleading zero.
- **Audience**: admin + lead + dispatch — wider than Incentives/Payroll's
  admin-only gating, matching the "fleet-wide cross-driver visibility"
  precedent already used for Fleet Cards/Credentials. This needed a new
  additive `load_points` SELECT policy
  (`supabase/migrations/20260809000000_load_points_staff_read.sql`,
  applied) since the existing `load_points_admin_read` policy (from the
  original Incentive System migration) is admin-only, confirmed via
  reading that migration directly — lead/dispatch would otherwise get
  zero rows under RLS.
- **Placement**: new "Underloading" button in `app/admin/page.tsx`'s
  header, same row/pattern as Fleet Cards/Credentials/Incentives/Payroll.

`app/admin/UnderloadingDashboardModal.tsx` (new) — deliberately simpler
than `PayrollReportModal.tsx`: no CSV export, no per-load edit/
recalculate, no per-load drill-down (that's what Payroll Report is for;
this is the fleet-level pitch/health-check view, not a payroll audit
tool). Date range is a simple lookback-days chip row (7d/30d/90d/All —
the same pattern already duplicated in `MyLoadsModal.tsx`/
`ScaleHistoryModal.tsx`/`RecordHistoryModal.tsx`, no shared component
existed to import) rather than the Payroll Report's pay-period picker,
since this shouldn't require pay-period settings to be configured just
to show a number. Headline stats (total recovered gallons, loads, avg/
load) above a per-driver leaderboard table (sorted by gallons desc, not
alphabetical like Payroll's driver list — a leaderboard framing fits "the
number that justifies the subscription" better than an alphabetical
roster).

**Live-verified 2026-08-09**: typecheck clean. Button renders correctly
in `/admin`. Opened the modal against the same demo company's real
Incentive System test data from earlier this session (edited/recalculated
multiple times that same pass) — headline shows 1,800.0 recovered
gallons / 1 load / avg 1800.0, per-driver row matches ("Test Testerson,
1 loads, 1800.0 gal"). Confirms the new `load_points_staff_read` RLS
policy change didn't need a role switch to verify reads (this session's
signed-in user is already company admin, which already had read access
before this policy — the *incremental* lead/dispatch grant itself
wasn't separately re-verified with a non-admin role, same category of
gap as this session's other role-matrix checks that could only be
proven architecturally sound, not empirically, without a second live
non-admin account). No console errors. Date-range chips (7d/30d/90d/All)
all functional — didn't change the figures for this dataset since the
test load falls within all four ranges.

**Not built** (out of scope for this pass, no spec existed beyond the
one-line description): no trend-over-time chart, no per-terminal or
per-product breakdown, no export. If the dashboard needs more than a
snapshot + leaderboard later, that's a separate scoping conversation.

### Terminal card / credential management (fleet-wide)
- Fleet-wide view of who's carded where, filterable by terminal (so dispatch
  doesn't send an uncarded driver).
- ~~**Priority terminal flagging**~~ — **removed 2026-08-05, see below.**

#### Shipped 2026-08-01 (fleet card visibility only)

`app/admin/FleetCardsModal.tsx` (new) — "Fleet Cards" button in the admin
page header, visible to `admin`+`dispatch` (mirrors the Loads button's
gating). Pick a terminal (search over `terminals`), see every company
driver's card status there — name + computed expiry state (via the same
`cardStateFor` used by the Cards tab), color-adjusted for a dark background
(`cardTheme.ts`'s `EXP_COLOR` assumes the light pearl card-wallet
background; reusing it here directly would have made "valid" render as
near-black-on-near-black — caught before it shipped, see `DARK_EXP_COLOR`
in that file). Deliberately status-only — doesn't read/show
`card_number`/`pin` (those stay in `user_terminal_cards`, untouched).

Migration applied 2026-07-31: `supabase/migrations/20260801000000_fleet_terminal_card_visibility.sql`
adds one new, purely additive SELECT policy on `terminal_access` for
admin+dispatch across the company — doesn't drop/replace whatever policy
already exists there (unknown exact shape, no DB access to check). Live-
verified post-apply: terminal search + per-terminal driver card list both
render real data with no errors. Still only verified for the *same-user*
case (the one test company available has a single member, so cross-driver
visibility itself is architecturally sound but not empirically confirmed
the way the dispatch role's load-visibility swap was) — worth a real check
with a second driver in the company.

#### Removed 2026-08-05

Priority terminal flagging was designed (2026-08-01) and built (2026-08-03)
as a customizable per-terminal training checklist — `terminal_checklist_items`/
`terminal_checklist_progress` tables, `toggle_terminal_checklist_item`/
`record_terminal_checklist_load` RPCs, `TerminalChecklistEditorModal.tsx`
(admin), `TerminalChecklistModal.tsx` (driver-facing overlay on terminal
select), and a `FleetCardsModal.tsx` progress readout. All of it removed
per user direction during the fleet-tier spec reconciliation pass — terminal
card management moved to simple active/inactive/expiring status sorting
(already how Cards tab / `FleetCardsModal` work) rather than a
star/flag-based workflow, making the whole checklist concept vestigial
before it ever reached the live database (the migration was still queued,
never applied). Confirmed via repo-wide search that no references remain.
If a driver-training/carding-progress feature is wanted again later, don't
resurrect this design uncritically — it was never validated against real
usage.

### Onboarding
- Replace/rework the existing guided tour with short video clips. **Blocked
  on content** — needs actual video assets supplied/recorded before this
  can be scoped or built; not started.
- ~~Fleet training mode: new drivers inherit the fleet's terminal
  history/presets instead of starting cold.~~ — **resolved 2026-08-09, no
  build needed.** Confirmed with the user: terminals were never
  company-specific to begin with — the star/"frequent" mechanism is
  purely a personal convenience for a driver to avoid searching the full
  city/terminal catalog, and every driver already has access to the
  complete terminal catalog regardless of company or tenure. There's
  nothing for a new fleet driver to be missing that "inheriting" would
  fix — the existing architecture already covers this.

### Cross-company reading network
- No new UI — temp/API readings already update silently across companies;
  keep it invisible/passive, not a per-driver alert. (This is the existing
  network-effect feature described at the top of this doc, not something new.)

### Incentive system ("Recovered Gallons")

**Concept**: drivers earn points for loading closer to true legal capacity
instead of conservatively. Points cap at the legal weight limit — overloading
has no upside, only risk. Normalizes fairness between long-haul (fewer
loads/day) and short-haul (more loads/day) drivers.

**Setup**: off by default, company admin toggles on in company profile.
Company sets a benchmark **gallons** figure per product, company-wide (not
per equipment class — assumes all equipment handles up to the legal limit).
Manual entry only in v1, no benchmark versioning/history. Benchmark gallons
convert to a reference weight via a **standard industry density table per
product** (not company historical average — avoids chicken-and-egg data
problem). Company-specific density override is a possible later addition,
not v1.

**Single-product calc**:
1. Convert benchmark gallons → weight using *today's* actual API/temp-derived
   lbs/gal (not the static reference density — this is the point of tying it
   to the existing temp/API system).
2. Actual weight = actual gallons × today's lbs/gal.
3. Recovered weight = actual weight − benchmark weight (at today's density).
4. Recovered gallons = recovered weight ÷ today's lbs/gal.
5. Cap: stops accruing at 80,000 lbs GVW (configurable per company).
6. Floor: negative recovered gallons → 0, never negative points.

**Split-load calc (finalized)** — per compartment:
1. Compartment's % share of total load gallons.
2. That product's benchmark gallons → weight at today's density.
3. Prorated benchmark weight = that % of the benchmark weight.
4. Prorated actual weight = that % of total actual load weight (all comps
   summed).
5. Recovered weight = prorated actual − prorated benchmark.
6. Convert to gallons via that product's today's lbs/gal.
7. **Floor each compartment at 0 individually** — never net one compartment's
   shortfall against another's surplus.
8. Sum all compartments' recovered gallons = load total.

Worked example is in the original spec message if the math needs re-deriving
later (regular 8,500gal/diesel 7,600gal benchmarks → ~470 total points on a
1,200gal regular / 7,000gal diesel load).

**Data model** (not yet migrated):
- `product_benchmarks`: `company_id, product_id, benchmark_gallons, reference_density, updated_at`
- `incentive_settings`: `company_id, enabled bool, weight_cap_lbs default 80000 editable`
- `load_points`: `load_id, driver_id, company_id, product_id, compartment_index, benchmark_gallons_used, actual_gallons, density_at_load (snapshot -- store, never recompute later), recovered_gallons, recovered_points, created_at`

**UI behavior**: points calculate silently after submit (not live per-keystroke
— avoids turning loading into a real-time optimization game, which cuts
against the safety-first design intent). Simple "You earned X points on this
load" confirmation after submit.

**Payroll / payout**:
- Points→dollars conversion is entirely company-side, at whatever rate they
  pick. App has no payout calculator.
- Payroll report: pay periods are **company-defined** (settings: period type
  — weekly/biweekly/semi-monthly/monthly — + anchor day); admin picks from a
  dropdown of generated periods, not manual date entry.
- Table: driver, loads in period, total recovered gallons, total points, avg
  per load — expandable to per-load detail. Employee/payroll ID pulls from
  existing driver profile field.
- CSV export: driver name/ID, period, total points, blank "$ amount" column
  for admin's own rate.
- **Edit & recalculate**: loads editable after the fact (typo fixes, wrong
  compartment, etc). Recalc uses the *original* `density_at_load` snapshot
  unless the edit specifically corrects a bad density reading. Track edit
  history (who, old→new, timestamp) on the load. If points change after a
  report was already exported, flag that report **"stale"** (not invalid) —
  don't block or auto-regenerate.
- Overload disputes not handled by the app — the weight cap is the entire
  mitigation; company policy governs from there.

**Status (2026-08-02): core calc engine done, payroll report deferred.**
Built and queued (migration `20260802000000_incentive_system.sql`, not yet
applied — no live DB write access this session):
- `incentive_settings`, `product_benchmarks`, `load_points` tables + RLS
  (company-read, admin-write on settings/benchmarks; load_points has no
  direct client write at all — only `calculate_load_points` touches it).
- `calculate_load_points(p_load_id)` RPC — implements the finalized
  split-load formula verbatim (a single-compartment load is just the n=1
  case, no separate code path). Called fire-and-forget/non-fatal from
  `useLoadWorkflow.ts` right after `complete_load` succeeds, same pattern as
  `update_terminal_temp_bias`. No-ops silently if the company hasn't
  enabled incentives.
- `products.api_60` + `alpha_per_f` (already existing columns) turned out to
  **be** the "standard industry density table per product" the spec called
  for — no new density table was needed. `product_benchmarks.reference_density`
  is a snapshot of that computed at benchmark-set time, but is
  **informational only** (shown to the admin for context); the live calc
  always uses that load's actual observed density, never this snapshot.
  This also resolves the open question below about a company-specific
  density override — since the static reference isn't used in the math,
  there's nothing to override.
- `IncentiveSettingsModal.tsx` (admin-only, entry point next to Fleet Cards
  in `app/admin/page.tsx`): enable toggle, weight cap input, search-and-add
  per-product benchmark gallons (not a picker over the full granular
  catalog — most companies only ever benchmark a handful of products).
- Driver-facing confirmation: "You earned X points on this load" line in
  the planner's Load Summary card (`app/calculator/page.tsx`), populated
  from `LoadReport.recovered_points` — null/hidden whenever incentives
  aren't enabled for the company.

**Status (2026-08-04): payroll report shipped — Incentive System now
fully complete.** Migrations `20260802000000_incentive_system.sql` and
`20260804000000_payroll_report.sql` both applied 2026-07-31 (in that
order — the second requires the first since it adds a trigger on
`load_points` and reuses `calculate_load_points`):
- `payroll_reports` table — purely a "this period was exported" marker, not
  a stored report. The report itself (table + CSV) is always computed live
  from `load_points` for whatever period is selected. Admin-only RLS.
- `load_edit_history` table — one row per `edit_load_line()` call, logging
  who/when/old→new for whatever fields changed. Admin-read only (via the
  load's company), no direct client write.
- `flag_stale_payroll_reports` trigger (AFTER UPDATE on `load_points`) —
  whenever points get recalculated, any already-exported
  `payroll_reports` row whose period covers that load's date flips
  `is_stale = true`. Generic and automatic — doesn't care what caused the
  recalc.
- `recalculate_load_points(p_load_id, p_preserve_density)` — admin-gated
  (checked inside the function, not left to RLS, since this affects pay).
  `p_preserve_density = true` (default): re-prorates using each
  compartment's *existing* `density_at_load` snapshot and the edited
  `actual_gallons` — density itself never moves, per spec ("uses the
  original density_at_load snapshot unless the edit specifically corrects
  a bad density reading"). `p_preserve_density = false`: the edit did
  correct a bad density reading, so this just calls the existing
  `calculate_load_points` again for a full from-scratch recompute (it
  already derives density fresh from current `load_lines`).
- `edit_load_line(p_load_id, p_comp_number, p_actual_gallons, p_actual_lbs,
  p_density_correction)` — admin-only, updates `load_lines`, logs to
  `load_edit_history`, then calls `recalculate_load_points` with the
  correct preserve/correct flag.
- `app/admin/payPeriods.ts` (new, pure date math, no DB calls) —
  `generatePayPeriods()` generates weekly/biweekly/semi-monthly/monthly
  period boundaries from `pay_period_type` + `pay_period_anchor_date`, so
  the admin picks from a dropdown rather than typing dates manually, per
  spec. Semi-monthly's split day is clamped to 1–15 (the "A" half is
  always exactly 15 days; the "B" half absorbs whatever's left in the
  actual calendar month) — matches the standard 1–15/16-EOM convention
  when anchor day = 1, generalizes reasonably for other split days.
  Manually verified against several anchor/period-type combinations
  (including a semi-monthly year-boundary rollover) before wiring into the
  UI.
- `IncentiveSettingsModal.tsx` extended with pay period type + anchor date
  fields (the columns already existed on `incentive_settings` from the
  original migration; this is the first UI that actually writes them).
- `PayrollReportModal.tsx` (new, admin-only, entry point next to
  Incentives in `app/admin/page.tsx`): period dropdown, driver table
  (name, employee ID from the existing `profiles.employee_number` field,
  loads count, total recovered gallons, total points, avg per load),
  expandable to per-load and then per-compartment detail, inline
  edit-and-recalculate (gallons/lbs inputs + a "this corrects a bad
  density/API reading" checkbox controlling the preserve-vs-recompute
  path), CSV export (driver name/ID, period, total points, blank "$
  amount" column) which also inserts the `payroll_reports` marker row and
  clears any stale flag shown for that period.

**Full live verification pass, 2026-07-31** (all 5 queued migrations had
been applied via the Supabase SQL editor by this point; this is the
end-to-end check against real data, not just typecheck):
- Enabled incentives + saved two live product benchmarks (B100, ULSD) via
  `IncentiveSettingsModal.tsx` — save succeeded, no error, values persisted
  on reopen.
- Completed a real load with no matching benchmark: `calculate_load_points`
  ran with no error and no points banner (correct no-op, not a crash).
  Completed a second real load against the new ULSD benchmark: "You earned
  1785.4 points on this load" banner appeared with the exact expected math
  (actual gallons − benchmark gallons).
- `PayrollReportModal.tsx` picked up the real load correctly (1785.4 pts,
  1 load, matching avg), expandable to per-load and per-compartment detail.
- Edit-and-recalculate live-verified twice (`edit_load_line` →
  `recalculate_load_points` with `p_preserve_density = true`): each gallons
  edit correctly shifted total points by the expected delta.
- `flag_stale_payroll_reports` trigger live-verified: exported CSV once,
  then edited a load line again — the "this period was exported before,
  but points have changed since" banner correctly appeared on next open.
- Fleet Cards (`terminal_access` admin+dispatch policy) live-verified:
  terminal search + per-driver card status list both render real data, no
  errors.
- Equipment sharing attribution (`equipment_attachments.uploaded_by`) and
  the new `equipment_sensitive_data` table both live-verified: the Docs
  modal renders with no `42703`/`PGRST205` errors, and a Purchase Price
  saved via the admin-only Sensitive Info section read back correctly
  after reopening the modal.
- Net result: all 5 migrations (`20260730000000_dispatch_role_load_visibility`,
  `20260731000000_equipment_sharing_attribution`,
  `20260801000000_fleet_terminal_card_visibility`,
  `20260802000000_incentive_system`, `20260804000000_payroll_report`) are
  confirmed working end-to-end against live data, not just applied cleanly.
  Test artifacts left in the demo company from this pass (enabled
  incentives, B100/ULSD benchmarks, one edited load, a test Purchase Price
  value) were left in place rather than cleaned up, since this is the
  persistent demo/QA company, not customer data.

### Roles & permissions

**Pricing**: Base tier $100/mo = 1 admin seat + 4 seats of any non-admin
role. Additional non-admin seats $25/mo each. Additional admin seats priced
standalone, higher than $25/seat (e.g. $40-50 range) and **not** bundled with
4 more generic seats — avoids penalizing large multi-region companies needing
multiple admins but not more driver/dispatch seats. Role reassignment is a
simple dropdown on the admin page (promote driver → lead driver → dispatch).

**Permission matrix**:

| Area | Driver | Lead Driver | Dispatch | Admin |
|---|---|---|---|---|
| Own loads/planner | ✓ | ✓ | — | ✓ |
| Other drivers' loads | — | — | ✓ | ✓ |
| Own cards | ✓ | ✓ | — | ✓ |
| Other drivers' cards | — | — | ✓ | ✓ |
| Flag priority terminal cards | — | — | ✓ | ✓ |
| All company equipment (view/edit) | ✓ | ✓ | — | ✓ |
| Equipment logs incl. attribution | ✓ | ✓ | — | ✓ |
| Incentive benchmark settings | — | — | — | ✓ |
| Payroll report | — | — | — | ✓ |
| Own password vault | ✓ | ✓ | ✓ | ✓ |
| Others' password vaults | — | — | — | — |
| Role assignment | — | — | — | ✓ |

Key principle: **equipment is shared fleet property** (all drivers/leads see
it), **loads and cards are personal data** (only the individual + dispatch +
admin see them), **password vault is personal to every role including
admin** (nobody sees another user's vault, ever — no exceptions for role).

Note this permission matrix does NOT match the "Key existing infrastructure"
section's currently-hardcoded `role === "admin" || role === "lead"` checks
scattered across the app (see call-site list above) — those only distinguish
admin/lead from everyone else today; dispatch as a distinct role with its
own cross-driver-but-not-equipment-edit visibility is new and will need
those call sites (and RLS) actually reworked, not just a new role string
added to the enum.

#### Dispatch role — shipped 2026-07-30 (mechanics only, no billing)

Scoped down from the full spec above to just the role mechanics, per an
explicit decision to defer seat-based billing enforcement to a separate
Stripe/RevenueCat pass. Live-DB verification (4 queries the user ran)
confirmed `user_companies.role` is plain unconstrained `text` (default
`'driver'`) — adding `'dispatch'` needed zero column migration, just app-code
+ two RLS policy updates.

**New**: `lib/ui/driver/role.ts` — the first-ever shared `Role` type
(`"driver" | "lead" | "admin" | "dispatch"`) + `ROLE_LABELS` + `isRole()`
guard. Previously `role` was bare `string` (or `as any`-cast) everywhere,
which is exactly how the two invite-role dropdowns had already drifted out
of sync with each other (`app/admin/page.tsx`'s had driver/lead/admin;
`lib/ui/driver/EquipmentDetails.tsx`'s separate, second `InviteModal` had
only driver/admin, missing `lead`) — both now consistently offer all four.
`/api/admin/invite/route.ts` also gained real validation via `isRole()`
(previously accepted literally any string for `role`, no allow-list at all).

**Who gets what, concretely**: dispatch can now enter `/admin` and see the
Users/roster list (read-only — `MemberCard`'s existing `hideRoleDropdown`/
`hideRemove` props suppress the role-reassignment dropdown and Remove button
for non-admin viewers) and the per-member **"Loads"** button (opens the
existing, already-built `AdminLoadsModal` — read-only, reuses
`useLoadHistory(targetUserId)` unchanged). Dispatch does **not** get: the
Equipment/Terminals sections (now explicitly gated to
`admin || lead`, since they previously had NO section-level gate at all and
would have silently opened to anyone who passed the page-level entry check
once dispatch was added there), the "Set up planner →" full-impersonation
button, the invite button, or role reassignment. All of those stay
admin-only (or admin/lead-only for equipment), unchanged.

**Migration applied 2026-07-31**: `supabase/migrations/20260730000000_dispatch_role_load_visibility.sql`
swaps the `load_log`/`load_lines` "admins can read company member loads"
policies from `role IN ('admin','lead')` to `role IN ('admin','dispatch')` —
this is what actually makes the new "Loads" button return data for a
dispatch user; the app-code gate alone isn't sufficient. Also worth
noting: this is a real behavior change, not additive — leads lose the
cross-driver load visibility they currently have, since the matrix scopes
that to Dispatch + Admin only. Both policies existed live already but were
never in a migration file until this one (confirmed via a live query
2026-07-29 — see "Architecture reality" for why that's unsurprising here).

**Explicitly NOT done, flagged for whenever each area is actually built**:
- ~~Fleet-wide terminal card / credential visibility for dispatch~~ —
  **shipped 2026-08-06.** Scope decision made (asked, not guessed): dispatch
  gets **read-only** view of license/medical/TWIC expiry status, not the
  admin-only tables' full `ALL`/CRUD access — matches "view who's carded
  where," not "edit any driver's record."

  Live `pg_policies` query (2026-08-06) confirmed the actual shape before
  writing anything: `driver_licenses`/`driver_medical_cards`/
  `driver_port_ids`/`driver_twic_cards` each have an admin-only `ALL` policy
  plus a self-row-only SELECT — so dispatch (and even admin, for other
  drivers) genuinely couldn't see anyone else's row before this. `attachments`
  turned out to **already** have a company-wide SELECT policy (no role
  restriction at all) — confirmed via the same query — so it needed no
  change; only the four credential tables had the gap.

  `supabase/migrations/20260806000000_dispatch_credential_visibility.sql`
  (applied) adds one new additive SELECT policy per credential table
  (`dl_admin_dispatch_read`, `dmc_admin_dispatch_read`,
  `dpid_admin_dispatch_read`, `dtc_admin_dispatch_read`), admin+dispatch,
  company-scoped — mirrors `terminal_access_admin_dispatch_read`'s own
  shape from the terminal-card migration. Existing `xx_admin` (ALL) and
  `xx_own` (SELECT) policies untouched; permissive policies OR together, so
  this only extends read reach, never reduces access. Live-confirmed via
  `pg_policies` post-apply: all four exist with the intended `qual`.

  New UI: `app/admin/FleetCredentialsModal.tsx` (new) + a "Credentials"
  button in `app/admin/page.tsx`'s header, gated `admin || dispatch` exactly
  like Fleet Cards — same fetch pattern (`user_companies` + this session's
  new `is_company_staff` roster-visibility fix + `get_display_names_full`),
  status-only display (expiry + computed color state via `cardStateFor`/a
  local `DARK_EXP_COLOR` override, same as `FleetCardsModal.tsx`'s own dark-
  background palette fix) — no underlying license/card field data (number,
  class, examiner) shown, matching the read-only decision. Deliberately
  excludes `driver_port_ids` — that table is the freeform, multi-row
  "Badges" list (Cards tab), a different shape from singular license/
  medical/TWIC; the existing single-driver `CredentialsReportModal.tsx` (the
  only prior "Credentials" UI in the app) already scopes out port IDs for
  the same reason, so this isn't a new omission.

  Live-verified against the same two-member company from the roster-
  visibility fix: both "Seth Perry" and "Test Testerson" render in the new
  modal, each correctly showing "Not on file" for License/Medical/TWIC
  (accurate — this demo company has never had credential data entered, same
  empty state the self-view Credentials report already shows). No console
  errors.
- ~~The "priority terminal flagging" feature — brand new table/UI, not built.~~
  Since superseded: it *was* built later this session, then removed entirely
  per explicit user direction — see "Removed 2026-08-05" further down. Not
  coming back in this form; terminal card management uses simple status
  sorting instead. This bullet is stale, kept only so the history reads
  coherently.
- ~~**Security flag, not yet verified**~~ — **resolved 2026-08-05.** Live
  `pg_policies` query confirmed `user_companies_update_admin_or_super`
  (UPDATE) has both `qual` and `with_check` set to `is_company_admin(company_id)`
  — so `MemberCard.tsx`'s bare client-side `changeRole()` `.update()` really
  is safe: RLS silently blocks the write (0 rows affected) for anyone who
  isn't a company admin (or super admin, per `is_company_admin()`'s own
  `is_super_admin()` short-circuit). `admin_set_user_company` is still
  confirmed dead code, unrelated to this enforcement path.

  **But confirming this surfaced a real, separate, more serious bug**: the
  live SELECT policy on the same table (`user_companies_select_own_or_super`)
  is `is_super_admin() OR user_id = auth.uid()` — **no admin/lead/dispatch
  carve-out at all**. Three client call sites did a raw
  `.select(...).eq("company_id", cid)` assuming they'd get the whole
  company's rows back: `app/admin/page.tsx` (member roster), `FleetCardsModal.tsx`
  (per-terminal driver list), `app/calculator/lead/DriverAssignmentModal.tsx`
  (driver picker). For any non-super-admin, all three silently collapsed to
  "just my own row" the moment a company had more than one member — which
  is exactly why every one of those features carried an "only verified
  same-user, worth checking with a second driver" caveat all session. The
  single-member demo company never exposed it because `user_id = auth.uid()`
  alone already returned the complete (1-row) result set.

  Fixed via `supabase/migrations/20260805000000_user_companies_staff_roster_visibility.sql`
  (applied): a new `is_company_staff(p_company_id)` function, mirroring
  `is_company_admin()`'s own `SECURITY DEFINER` + `is_super_admin()`
  short-circuit shape but checking `role in ('owner','admin','lead','dispatch')`
  instead of admin-only, plus a purely additive SELECT policy using it —
  the existing self-row policy is untouched, this just OR's in a second
  permissive policy. Deliberately excludes plain drivers (they keep exactly
  the self-row access they already had).

  **Live-verified against a genuine second company member** (the demo
  account gained a real second user, `Test Testerson`, mid-session — the
  first time this session multi-member visibility could be tested for
  real, not just architecturally reasoned about): `/admin` roster now shows
  "USERS (2)" with both members' names/emails/Loads buttons rendering
  correctly, and Fleet Cards' Chevron/Fort Lauderdale lookup shows both
  drivers' real, distinct card expiry dates. No console errors either
  place. `DriverAssignmentModal.tsx` (Lead tab) wasn't re-tested live this
  pass but shares the identical query shape, so the same fix applies.
- ~~A likely pre-existing bug, found in passing, not fixed~~ — **fixed
  2026-08-05.** `app/calculator/reports/page.tsx`'s `useLoadHistory(authUserId)`
  call (line 85) was the one fetch on that page not using `effectiveUserId`
  like everything else there — swapped to `useLoadHistory(effectiveUserId)`,
  removed the now-unused `authUserId` destructure. Confirmed via `tsc
  --noEmit` and a live reload of `/calculator/reports` (My Loads still shows
  "2" for the current non-impersonated user, as expected — impersonation
  itself wasn't re-tested this pass, but the fetch now matches every other
  query on the page).

  **Second, unrelated bug found while trying to verify the above**:
  `/calculator/reports` was unconditionally redirecting back to `/calculator`
  on every load, both via direct navigation and via the nav-menu link.
  Root cause: `CalculatorLayoutClient.tsx`'s `activeTabFor()` deliberately
  returns `"none"` for the Reports route (so no tab bar entry falsely shows
  as active — Reports is a nav-menu destination, not a tab-bar peer), but
  the tab bar's scroll-snap handler (`onScroll`, ~line 99) didn't know about
  that sentinel: it always compares "closest tab to viewport center" against
  `active`, and since `"none"` can never equal a real tab id, the handler
  treated Reports as if the user had scrolled the tab strip and immediately
  `router.push()`'d to whichever tab happened to be centered (`planner`).
  This fired on mount because the scroll-snap container's initial layout
  settle is itself a scroll event. Fixed with a one-line early return
  (`if (active === "none") return;`) at the top of `onScroll` — the tab bar
  now simply never auto-navigates while on a non-tab route. Live-verified:
  `/calculator/reports` now loads and stays put, full content renders
  (My Loads, Scale/Service/Wash History, Expiring Items, Terminal Cards,
  Credentials), no console errors. This bug predates this session's changes
  entirely (unrelated to the `authUserId` fix above) and would have affected
  the Reports hub from the day it shipped — the fact that it was never
  caught suggests Reports hadn't been click-tested end-to-end since.

### ~~Role-based tabs (new UI direction, 2026-07-30, not in the original Fleet Tier spec)~~ — superseded 2026-08-03

Entirely superseded by the Terminal Tier spec below (see "## Terminal Tier —
Build Spec"). Per explicit user direction during a 2026-08-03 mockup
walkthrough ("we pumped the brakes... this was scope creep"), the dedicated
Lead/Dispatch/Admin tabs shipped here — including `EquipmentScheduleChart.tsx`
and `DriverAssignmentModal.tsx` — are being **shelved entirely**, not moved
into the nav menu or preserved elsewhere. Left below as a historical record
only; don't build on top of any of it.

Every role gets Planner/Cards/Vault for themselves; each non-driver role
additionally gets exactly one extra tab to the **left** of Planner —
Lead/Dispatch/Admin. Each role tab is its own fresh, focused page (subtabs +
a role-relevant chart/content area) — explicitly **not** a literal copy of
the Planner page's load-planning shell (equipment/location cards, temp
dial, Load button); those don't have an obvious meaning for a
fleet-monitoring dashboard and would mean inventing behavior for controls
that don't do anything real. Confirmed with user 2026-07-30 before
building.

**Shipped so far — Lead tab only** (Dispatch/Admin follow the same shape
later, not started):
- `role`/`companyId` hoisted into `CalculatorShellContext.tsx` (same
  query shape as `NavMenu.tsx`'s own role fetch, but scoped to
  `effectiveUserId` so admin impersonation reflects the impersonated
  user's role — matches every other piece of shared shell state).
  `NavMenu.tsx` itself was left alone (own independent fetch) since it's
  also rendered outside the shell provider (e.g. `/admin`).
- `CalculatorLayoutClient.tsx`'s tab bar is now role-aware: `ROLE_TABS`
  maps `role -> {id,label,href}`, prepended to the always-present
  Planner/Cards/Vault base tabs. A driver (or unresolved role) sees no
  extra tab. Only `lead -> "Lead" (/calculator/lead)` is wired so far.
- `app/calculator/components/CenteredSubTabs.tsx` (new, generic) —
  extracts the "selected item scrolls to center" scroll-snap mechanic that
  the tab bar and `PresetDial.tsx` (the Planner's A-E preset row) each
  already implemented independently; this was the third copy, so it's now
  shared. Reusable for Dispatch/Admin subtabs later.
- `app/calculator/lead/page.tsx` — Dashboard / Tasks / Ledger subtabs via
  `CenteredSubTabs`. Only Dashboard has real content; Tasks and Ledger are
  honest "coming soon" placeholders, not a guess at unspecified
  functionality (only Dashboard was actually specified).
- `app/calculator/lead/EquipmentScheduleChart.tsx` — "who has the
  equipment and when." **Illustrative mock data only** — confirmed with
  user before building that no driver-shift-schedule table exists anywhere
  in the app; a real schedule feature is a separate, later piece once this
  chart's shape is validated. Went through three iterations same-day
  (2026-07-30), converging on the current shape:
  1. First cut: a weekly roster grid (driver rows × day-of-week columns).
  2. Redesigned into a 24-hour timeline per a user reference image
     (12am-noon-12am number line) — real clock axis, one row per driver,
     per-day on/off state, a legend.
  3. Fixed-50/50-axis pass, per explicit follow-up feedback: day shift
     always fills the left half, night shift always the right half,
     regardless of actual duration. Hour tick labels underneath are
     *derived from each shift's own start/end hours* rather than a static
     midnight-anchored axis — with this data (3a-3p / 3p-3a) that puts "3"
     at both far edges instead of "12". No per-driver name/shift-hour
     labels on the bar and no legend — the header boxes and bar colors
     already say what's what. The per-day-of-week on/off concept from
     iteration 2 was dropped here (not requested for this shape).
  4. **Current shape**: title line uses a real flex gap between "Truck ·
     25184" and "Trailer · 3151" (still hardcoded — no real equipment
     binding on this page yet) instead of literal spaces in one string,
     which HTML collapses to a single space — a real gap needs actual
     layout, not whitespace characters. The bar's two halves now have the
     same small gap as the header boxes (previously seamless). Below the
     card, outside it, a vertical list of the full week (full day names,
     not abbreviated) reappears — the per-day-of-week on/off concept from
     iteration 2 is back, but rendered differently: a line spans from each
     day name to the card's left edge when Pedro works that day, another
     spans to the right edge when Seth works it, nothing on a day either
     is off. Two follow-up tweaks landed on this: (a) the lines are a
     neutral `rgba(255,255,255,0.08)` — same color as the chart card's own
     border — rather than the day/night yellow/blue, since side + presence
     already say who works that day and the color was reserved for the
     header boxes/bar; (b) the day-name grid column is a **fixed width**
     (`DAY_LIST_LABEL_WIDTH = 86`, sized to fit "Wednesday" without
     wrapping) instead of `auto`, so every row's line length is identical
     — with `auto` each line's length varied with that day's own name
     width (e.g. "Sunday" vs "Wednesday"), which read as visually
     staggered/misaligned. The current day's name is still colored to
     whichever shift currently holds the equipment (yellow before 3pm,
     blue from 3pm on) instead of the default gray — driven by the same
     `useNow()` clock, comparing the live hour against
     `DAY_SHIFT.startHour`/`endHour`.
  5. **Equipment button + driver assignment**, per explicit follow-up: the
     Lead Dashboard now has a real Equipment button — not a fresh
     Lead-specific control, but the *exact same* Equipment sheet the
     Planner uses (`shell.equipOpen`/`setEquipOpen`, already mounted once
     in `CalculatorLayoutClient`'s `ShellChrome` and shared via
     `CalculatorShellContext` — the same instance Cards/Vault already
     reuse). `app/calculator/lead/page.tsx` replicates the Planner's own
     `equipmentDetails` fetch (truck/trailer name + make, keyed off
     `shell.equipment.selectedCombo`) and button styling verbatim. Only the
     *result* of picking equipment differs from Planner: instead of
     revealing compartment/load-planning UI, it reveals
     `EquipmentScheduleChart` with a real `equipmentLabel` (or a "No
     equipment selected" placeholder when `hasEquipment` is false) instead
     of the old hardcoded "Truck · 25184 / Trailer · 3151". A second new
     button, "Driver Assignment," opens `DriverAssignmentModal.tsx` (new)
     — day/night driver name pickers sourced from the real company roster
     (`user_companies` + `get_display_names_full`, same pattern as
     `FleetCardsModal.tsx`). `EquipmentScheduleChart` gained
     `dayDriverName`/`nightDriverName` props (falling back to the mock
     "Pedro Guzman"/"Seth Perry" defaults) so an assignment immediately
     updates the bar and the day-list's today-highlight. **No backing
     table for the assignment itself** — same "mock data first" call
     already made for the rest of this chart; the picked names live in
     `LeadPage`'s own React state and are lost on reload. Shift
     times/colors/workday patterns are still the pre-existing mock data;
     only the *names* are now real/assignable. Buttons were initially
     placed above the chart; moved below it per explicit follow-up to
     match the Planner's own layout order (compartment display on top,
     info cards/buttons underneath).
  - **Hydration-mismatch fix** (still applies): the live clock calculation
    (`useNow()`) must never call `new Date()` directly in a `useState`
    initializer or in the render body — the server-rendered snapshot and
    the client's first hydration pass land at different instants, which
    Next.js flags as a hydration error and force-remounts the tree. Fixed
    by starting state at `null` (identical server/first-client render)
    and only resolving the real clock in a client-only `useEffect` after
    mount. Any future "current time"-style widget in this codebase should
    follow the same pattern.
  - **Dev-server stale-content trap, cost significant time this session —
    root cause found and fixed at the source.** Iterating on this file,
    the dev server kept appearing to serve an old version no matter how
    many times the page reloaded — even surviving a full `.next` wipe +
    process restart + brand-new browser tab, with a stuck Next.js parse-
    error overlay quoting old file content. Diagnosis, in order: (1) `tsc
    --noEmit` passed clean the whole time — the source was never actually
    broken; (2) direct disk `grep` of the compiled `.next/dev/static`
    chunk showed the correct new content; (3) `curl` of that exact chunk
    URL also returned the correct content byte-for-byte — proving the
    Next.js dev server itself was always correct; (4) only the *browser
    tab's own* `fetch()` of that same URL returned stale bytes. Actual
    cause: `components/ServiceWorkerRegistration.tsx` registers
    `public/sw.js` (cache-first for build assets) unconditionally on
    every mount, in every environment — so each reload during dev
    re-registers the SW and re-caches whatever bundle happened to be
    current *at that reload*, meaning a single clear-and-check wasn't
    durable against the *next* reload silently re-poisoning it again.
    **Fixed at the source**: `ServiceWorkerRegistration.tsx` now skips
    registration entirely when `process.env.NODE_ENV !== "production"` —
    the standard guard for exactly this class of PWA dev-mode pain. Verified
    post-fix: `navigator.serviceWorker.getRegistrations()` returns empty
    after a reload in dev. This should prevent the whole class of "my
    change isn't taking effect" confusion from recurring on this project —
    if it ever does again, suspect something other than the SW now.

**Verification note:** live-verified the Lead page's own content (subtabs
centering + swapping, chart rendering) via direct navigation to
`/calculator/lead`, and confirmed no regression to the existing
Planner/Cards/Vault tab bar. Did **not** verify the tab actually appearing
in the tab bar for a real lead-role user end-to-end — the only test
company available is single-member (admin-only), and reassigning that
sole admin's own role to `lead` to test would risk losing the ability to
reassign it back (role dropdown is admin-only-visible) with no easy live-DB
undo. Worth a real check once a second (non-admin) test member exists.

#### Shipped 2026-07-30: Dispatch + Admin tabs, super-admin sees all

- `app/calculator/dispatch/page.tsx` and `app/calculator/admin/page.tsx` —
  same shell as Lead (`CenteredSubTabs`, Dashboard/Tasks/Ledger). Neither
  had specific Dashboard content requested the way Lead's equipment
  schedule was, so **all three subtabs on both are honest placeholders**
  naming likely future content (dispatch: fleet-wide loads/cards overview;
  admin: a lighter company-status glance, explicitly not a replacement for
  the full `/admin` console) rather than guessed-at functionality.
  `/calculator/admin` is deliberately a distinct route from the existing
  top-level `/admin` page — same tab-shell pattern as Lead/Dispatch, not
  the full management console.
- `CalculatorShellContext.tsx` gained `isSuperAdmin` (via the same
  `is_super_admin()` RPC `NavMenu.tsx` already calls, but keyed on
  `authUserId` not `effectiveUserId` — super-admin status is about the
  real signed-in account, not whoever they're impersonating).
- `CalculatorLayoutClient.tsx`'s `ROLE_TABS` is now an ordered list
  (Lead, Dispatch, Admin — also the left-to-right order super admins see
  all three in). `tabsFor(role, isSuperAdmin)`: a super admin sees **all
  three** role tabs regardless of their own company role, specifically so
  one account can verify/QA every role tab without reassigning roles.
  `activeTabFor` generalized from "find the one extra tab" to "find
  whichever role tab's href prefix-matches the current path," since there
  can now be more than one.
- **Verification gap, same shape as Lead's:** the demo test account isn't
  in the `super_admins` table and there's no live DB write access this
  session to add it temporarily, so the actual "super admin sees all six
  tabs" render couldn't be exercised end-to-end. Mitigated two ways
  instead: (1) direct navigation to `/calculator/dispatch` and
  `/calculator/admin` confirms both pages render correctly standalone; (2)
  `tabsFor`/`activeTabFor` were run standalone in Node against every
  role × `isSuperAdmin` combination (driver/lead/dispatch/admin, both
  `isSuperAdmin` states) — all produced the correct tab set and correct
  active-tab detection. Worth a real click-through once a genuine
  super-admin test session is available.

### Website / landing page rework
- `protankr.com` currently redirects straight into the calculator tool —
  needs a real marketing site.
- **Rename "calculator" → "Planner"** throughout (route + UI copy). Planner
  redirects unauthenticated users to `/login`.
- New site structure: `/` marketing landing, `/planner` (renamed calculator,
  auth-gated), `/pricing` (solo + fleet pricing from above), `/about`,
  `/login`, `/signup`.
- Styling: keep the existing dark `#111111` app theme (continuity between
  marketing site and product, not a separate palette). Industrial/utilitarian
  visual language (sharp edges, gauge/data-driven visuals using real app
  metrics) over generic SaaS-template look. Hero copy leads with the actual
  problem (off-spec fuel → conservative loading → lost gallons), not vague
  taglines.

#### Shipped 2026-08-07: `/calculator` → `/planner` rename + auth gate

Scoped to the route and copy only, per explicit user direction picking
this as the starting slice of the website rework (marketing landing page
and the other new routes are separate, not-yet-started pieces). UI copy
already said "Planner" everywhere (tab bar, NavMenu's "Back to Planner",
admin's "Set up planner →") -- a repo-wide grep for user-facing
`"Calculator"` text turned up nothing, so this pass was purely the URL
path. Internal identifiers (`CalculatorShellContext`, `CalculatorLayoutClient`,
`useCalculatorShell`, the shelved `app/planner/admin/page.tsx`'s
`CalculatorAdminPage`) were deliberately left unrenamed -- "route + UI
copy" reads as explicitly scoping out internal file/symbol names, and
renaming those too would touch dozens of files for zero user-visible
benefit.

`git mv app/calculator app/planner` (had to stop the dev server first --
`git mv` failed with a Windows file-lock "Permission denied" while
Turbopack's watcher held the directory open). Then every `"/calculator...”`
string literal (~16 files: tab hrefs in `CalculatorLayoutClient.tsx`/
`CardsSubTabs.tsx`, every `router.push`/`router.replace`/
`window.location.href` redirect target, `NavMenu.tsx`'s active-tab path
checks, `lib/authz.ts`/`lib/setupSession.ts`) and every `@/app/calculator/...`
import alias (6 files outside the moved directory, e.g.
`lib/ui/driver/EquipmentDetails.tsx`'s import of the new
`ServiceTypeManager.tsx`) → `/planner` / `@/app/planner/...`. One
functional miss from the first sed pass: `app/learn/page.tsx`'s guided-
tour link used a template literal (`` `/calculator?tour=${t.id}` ``), which
a plain `"/calculator` string-literal grep doesn't match -- caught on a
follow-up full-text sweep before it could ship broken. Also swept every
moved file's own stale `// app/calculator/...` header-comment path (~30
files, cosmetic only, no functional risk) for accuracy.

**Auth gate -- real architecture finding, not just a route swap.** First
attempt added `await getSessionUserOrRedirect()` (the existing
cookie-based `lib/authz.ts` helper, also used by `requireSuperAdmin`/
`requireMembershipOrJoin`) directly in `app/planner/layout.tsx` as a
server component. Live-tested and it redirected an **already-authenticated**
session straight to `/login` -- traced to `lib/supabase/client.ts`: the
browser Supabase client uses plain `createClient` from `@supabase/supabase-js`
with `storage: window.localStorage`, not `@supabase/ssr`'s cookie-syncing
`createBrowserClient`. Sessions never get written to a cookie at all, so
`next/headers`'s `cookies()` (what `createSupabaseServer()` reads) can
never see a session regardless of whether the browser is logged in --
confirmed `requireSuperAdmin`/`requireMembershipOrJoin`/
`getSessionUserOrRedirect` were **called from literally nowhere in the app
before this pass** (this repo's own prior note flagged `requireMembershipOrJoin`
as "dead code... don't assume that stays true if someone wires it in
later" -- wiring it in is exactly what surfaced this). `/admin` and every
other auth-gated screen in this app enforces auth client-side (its own
`supabase.auth.getUser()` check), which is why they all work fine despite
this gap.

Reverted the server-side gate; the real fix lives in
`CalculatorShellContext.tsx`'s existing mount-time `supabase.auth.getUser()`
effect -- if no user comes back, `router.replace("/login")`. Matches how
the rest of the app already does this, no architecture change. **Properly
fixing this** (migrating `lib/supabase/client.ts` to `createBrowserClient`
so server-side gates work everywhere) is a real, worthwhile follow-up --
`requireSuperAdmin`/`requireMembershipOrJoin` are both silently inert
right now -- but it's a foundational change touching the one Supabase
client every authenticated call in the app goes through, well outside a
route-rename's scope. Flagged here, not fixed.

**Live-verified**: unauthenticated `/planner` → `/login` (via the new
client-side gate); authenticated bare `/` → `/planner` → real Planner
content; all five tabs (Terminal/Dispatch/Planner/Cards/Vault) resolve
under `/planner/*` with real data (Terminal's rack map, Dispatch's driver
picker, Cards' city-grouped terminal list, Vault); NavMenu's Reports link
→ `/planner/reports` renders the full Reports hub; `/admin`'s "Set up
planner for X" (Kyle Tatro) → lands on `/planner` with the "Setting up
planner for Kyle Tatro" banner and his own (empty) equipment state, not
the admin's; "← Return to Admin" clears the setup session
(`sessionStorage` confirmed empty after) and hard-navigates back to
`/admin`. `tsc --noEmit` clean throughout; no new console errors beyond
routine dev-server HMR websocket noise from the mid-task server restart.

#### Shipped 2026-08-13: `/pricing` and `/get-the-app` (placeholder pricing + early-access form)

Next slice of the marketing site, per explicit direction: a real (if
price-less) `/pricing` page, and `/get-the-app` repurposed from "just
links to the app" into a "Request Early Access" contact form -- the same
URL is meant to become the real subscription-enrollment page later, so it
was built at that permanent path rather than a throwaway `/early-access`
one.

`app/marketing/SiteHeader.tsx` (new) -- the landing page's original header
(logo, About/Pricing/"Get the App") was inline JSX+CSS inside
`app/page.tsx`; extracted into a shared component so the nav can't drift
across the three pages that now need it, and so the two nav changes below
land everywhere at once. Two real changes from the original: a new
**Login** link (plain text, next to the CTA pill) and the **Get the App**
CTA now points to `/get-the-app` instead of `/planner` -- previously
"Get the App" *was* the only way to reach `/login` from the landing page
(via `/planner`'s own client-side redirect-when-signed-out), so once its
destination became the early-access form instead, an explicit Login link
was the direct fix for existing users losing their way in.

**Real bug hit and fixed while building `SiteHeader`**: its first version
used a normal scoped `<style jsx>` block (matching how every other page in
this app writes component CSS) and rendered completely unstyled live --
logo stacked above wordmark instead of inline, "Get the App" showing black
text with no pill background. Confirmed via `getComputedStyle` and reading
the actual `<style>` tag content: the scoped CSS was correctly generated
(rules like `.brand.jsx-<hash>{...}`), but the DOM elements only ever
carried their plain `className` (`"brand"`), never the matching
`jsx-<hash>` class needed for the rule to apply at all -- so every rule
silently matched nothing. Root cause not chased further (plausibly a
Turbopack/styled-jsx scoping gap), but the fix was straightforward once
diagnosed: switched to `<style jsx global>` with specific, collision-safe
class names (`.site-header .nav-cta`, etc.) -- the exact pattern
`app/page.tsx`'s own original inline header already used successfully,
which is presumably why this bug was never hit before now.

`app/pricing/page.tsx` (new) -- two tiers, **Solo** and **Fleet**, sourced
directly from "Product direction" and "Roles & permissions" → Pricing
above (not invented): Solo for an individual owner-operator, Fleet
described with its real shape (1 admin + 4 team seats included,
additional team/admin seats priced separately) but with every dollar
figure replaced by a literal **TBD** rather than a guessed number, per
explicit direction -- pricing itself isn't finalized yet, only the tier
structure is. Both tiers' CTA goes to `/get-the-app`.

`app/get-the-app/page.tsx` (new) -- Name/Email (required) + Company/Fleet
size/Message (optional) → posts to `app/api/early-access/route.ts` (new),
which sends a plain notification email via the same Resend setup
`app/api/admin/invite/route.ts` already uses (`RESEND_API_KEY`/
`INVITE_FROM_EMAIL`, confirmed live via `vercel env ls` to already exist
in Production, not configured in this session's local `.env.local` or in
Preview) -- to `sethnperry@gmail.com`, with `reply_to` set to the
submitter's own address so a reply goes straight to them. No DB write, no
auth -- this is a public contact form, not an app feature, so there's
nothing to persist beyond the email itself. A "Log in" note above the form
covers existing users who land here by habit.

**Live-verified**: header renders correctly (logo inline, nav links
correct, CTA pill styled) on both desktop and mobile widths, on all three
pages (`/`, `/pricing`, `/get-the-app`), with the active nav item dimmed
correctly per page. Pricing page's two cards, feature lists, and TBD
pricing render as designed. Get-the-app form: submitted with a real name/
email locally and confirmed the expected, graceful failure path -- server
log showed `RESEND_API_KEY not set` (correct, since that key only exists
in Production) and the form surfaced a clean "Something went wrong" error
rather than crashing. **Since resolved**: after deploying, submitted a
real request against production and got the "Request received"
confirmation — the actual Resend send path is now confirmed working
end-to-end, not just architecturally sound. `tsc --noEmit` clean
throughout.

**Copy fix, same day**: the Solo card's "Cross-company temperature
network" line was factually wrong on two counts, caught by the user, not
guessed at — confirmed against the live schema before touching anything
(`terminal_products`/`terminal_temp_bias` both keyed by `terminal_id`
only, no `company_id` at all, matching "Cross-company reading network"
above): it's **API gravity readings** that get crowdsourced (temperature
is predicted, with manual override — a separate mechanism), and the
pooling is **global** across every company, not scoped to one. Reworded
to "Crowdsourced API data, shared industry-wide". Also dropped "&
payroll reporting" from the Fleet card's incentive-tracking line per
explicit direction — the app tracks incentive points, it doesn't run
payroll, and the original wording overstated that.

#### Shipped 2026-08-13: `/about` — card grid + per-topic deep dives, content shared with the in-app Learn page

Per explicit direction: reuse the in-app `/learn` page's existing
technical content rather than writing new copy from scratch, since editing
it twice (once for the app, once for marketing) is exactly the kind of
drift this project has hit before with duplicated logic (see
`CustomSelect.tsx`'s and `ServiceTypeManager.tsx`'s own header comments on
the same lesson). Each of `/learn`'s four content-heavy accordions
(equipment setup, temperature prediction, weight plan, over/under) is now
sourced from one place and rendered two different ways.

`lib/content/learnTopics.tsx` (new) — the single source of truth. Each
topic carries the exact detailed body content `/learn`'s accordions
already had (ported verbatim, not rewritten) *plus* new marketing-only
fields (`shortName`, `tagline`, `marketing`) that only the About pages
use. The detail content is deliberately **theme-agnostic**: emphasis uses
a bare `<Em>` (`<strong className="lt-em">`) instead of a hardcoded color,
because the exact same JSX now has to render legibly on both the in-app
Learn page's dark background and the marketing site's light one — each
consumer defines its own `.lt-em` color rather than the shared content
picking one. "Guided tours" (the tour-launcher block) stayed inline in
`app/learn/page.tsx`, not moved into the shared module — it's an app
mechanic, not a marketable "why this matters" story, so it isn't an About
topic.

`app/learn/page.tsx` — its `Section`/`Divider`/`Accordion` components are
unchanged; only the CONTENT source changed, mapping over
`LEARN_TOPICS[].blocks` instead of the content being hand-written inline.
Live-verified pixel-for-pixel against the pre-refactor version (same 5
accordion titles, same body text, same emphasis rendering) — this was a
refactor, not a content change, and had to look identical.

`app/about/page.tsx` (new) — card grid, one card per topic: emoji,
`shortName`, `tagline`, the full `marketing` pitch (a real paragraph, not
a one-liner, per explicit direction), and a "Learn more →" link to
`app/about/[slug]/page.tsx` (new, dynamic route) — which shows the same
marketing intro up top, then renders the topic's `blocks` in full on a
dedicated page instead of a collapsed accordion, ending in a "Request
Early Access" CTA back to `/get-the-app`. 404s cleanly for an unknown
slug via `notFound()`.

**Real bug, same root cause as `SiteHeader`'s earlier one, hit and fixed
proactively this time**: nothing new to diagnose — already knew from that
earlier incident that scoped `<style jsx>` silently fails to attach its
`jsx-<hash>` class to elements in this dev setup, so both new About pages
were written with `<style jsx global>` and specific class names
(`.topic-card`, `.lt-section`, etc.) from the start, not scoped mode.

**Live-verified**: `/about` renders all 4 topic cards with real marketing
copy; `/about/temperature-prediction` renders the full detail (all 7
sections + the amber callout box + CTA) correctly on a light background,
including `<Em>` emphasis in dark text; `/learn` re-checked afterward and
still renders identically to before the refactor, including the same
callout box on a dark background. Checked on both desktop and mobile
widths. Invalid slug (`/about/not-a-real-topic`) 404s cleanly. No console
errors anywhere. `tsc --noEmit` clean throughout.

#### Shipped 2026-08-13: homepage closing CTA + shared site footer

Per explicit direction, after flagging it as the landing page's biggest
gap: the homepage previously just ended after the feature grid, with no
closing CTA and no footer at all -- `/pricing`, `/about`, and
`/get-the-app` all existed by this point but nothing on the homepage
itself funneled a visitor toward them beyond the header nav.

`app/marketing/SiteFooter.tsx` (new) -- same reasoning as `SiteHeader.tsx`,
a shared component so a future footer edit lands everywhere at once, not
three copies. Deliberately minimal (brand + tagline, a single nav row,
copyright) -- this is a pre-launch site with no blog/careers/social
accounts to link to yet, so a sparse footer here is honest, not
under-built. Uses `<style jsx global>` from the start, per the scoping bug
already found in `SiteHeader`.

`app/page.tsx` gained a `.closing` section between the feature grid and
the new footer: "Stop Guessing. Start Loading." + a line about the
early-access rollout, a primary CTA to `/get-the-app` and a secondary
link to `/pricing` -- both real routes this session already shipped, not
placeholders.

**Verification note**: this session's screenshot tool got stuck returning
a stale cached frame for this page specifically, across multiple fresh
tabs, viewport sizes, and scroll methods (JS `scrollTo`, `scrollIntoView`,
mouse-wheel `scroll` actions) -- confirmed independently via
`getBoundingClientRect`/`getComputedStyle`/`scrollY`/`scrollWidth`
JS checks that the actual live page has zero horizontal overflow, the
closing section and footer are correctly positioned in-flow, and the
mobile media query's smaller heading size is genuinely applied -- but a
real pixel screenshot to visually confirm final layout was never
obtained this session. Worth a real look next session before considering
this fully closed.

### Open questions (Fleet spec)
- Tie-break rule if a split load has two compartments with exactly equal
  gallons of different products.

## Billing & Subscriptions — Build Spec (sketched 2026-08-14, no payment processor wired up yet)

Recorded from a design conversation, not yet integrated with Stripe or
RevenueCat -- what's below is the app-side scaffold that a real payment
integration will write into and read from, built now so the seat-usage
UX exists and is testable before billing itself is live.

**Decided architecture**: checkout happens on whatever processor is
appropriate for the surface (Stripe Checkout for web/PWA signup, since
`/get-the-app` is meant to become the real enrollment page -- RevenueCat
once the native iOS/Android apps exist, since Apple/Google both require
their own in-app-purchase system for subscriptions bought inside a native
app, not a third-party processor like Stripe). Neither is wired up yet --
no Stripe/RevenueCat keys exist in this project's env vars as of this
pass. **Activation is webhook-driven, never client-redirect-driven** --
the payment success redirect page only shows a "setting up" state; the
thing that actually flips a company to active is a server-to-server
webhook from the processor, signature-verified, landing in a not-yet-built
`/api/stripe/webhook` route.

**Trials**: Stripe supports `trial_period_days` natively at the
subscription level -- card collected up front, not charged until the
trial ends, `status` is `trialing` the whole time. The app's own
activation check should treat `trialing` the same as `active` (has
access), so no separate trial-tracking logic is needed on this side.

**Discount codes**: Stripe's built-in Coupons/Promotion Codes, no custom
code needed -- its hosted Checkout page has a promo-code field already.

**Seat model (shipped this pass, schema + UI only)**: two independent
paid-capacity pools, matching the pricing already decided above --
`paid_admin_seats` (base plan includes 1) and `paid_other_seats` (base
plan includes 4), tracked in a new `company_subscriptions` table
(migration `20260814000000_company_subscriptions.sql`, **written but not
applied** -- no direct DB write access this session, same as other
schema work this pass; needs to be run in the Supabase SQL editor before
any of this activates). Actual seat *usage* is deliberately never stored
-- it's computed live from `user_companies` role counts each time, so it
can't drift from reality the way a cached counter could. RLS: any staff
member (admin/lead/dispatch) can read their own company's row via
`is_company_staff()`; no insert/update/delete policy at all, since the
only writer is meant to be a service-role webhook handler, same
no-direct-client-write shape as `load_points`.

`lib/billing/useCompanySubscription.ts` (new) -- `useCompanySubscription(companyId)`
hook + two pure functions (`computeSeatCapacity`, `wouldExceedCapacity`)
kept outside the hook so they're trivially reusable/testable. Deliberately
**fails open**: any error reading the table (migration not applied yet,
RLS denial, no row for this company) resolves to `hasSubscription: false`,
which every consumer treats as "render nothing, gate nothing." This is
what makes it safe to ship into production today, before the migration
is even applied -- confirmed live: `/admin` for the real, non-billed demo
company renders identically to before (no seat pill, no invite warning),
with the only visible trace being a single expected 404 in the console
for the not-yet-existing table (matches this project's own established
"confirmed via direct PostgREST query not to exist live yet" pattern for
other pre-migration tables).

`app/admin/page.tsx` -- two UI pieces wired to the hook, both invisible
whenever `hasSubscription` is false (i.e. always, today):
- A small pill next to "Users (N)" showing "{used} of {paid} seats",
  turning amber when either pool is full.
- `InviteModal` shows an inline amber warning + relabels its submit
  button to "Add Seat & Invite" when the selected role would push usage
  over paid capacity. **This is informational only** -- there's no real
  billing integration to actually add a seat or block anything yet, so
  the invite always proceeds regardless. It exists so the UX pattern is
  built and reviewable now, ready to gate for real the moment a genuine
  processor integration exists.

**Explicitly not built this pass**: the Stripe/RevenueCat integration
itself (checkout session creation, `/api/stripe/webhook`, a
`webhook_events` dedup table Stripe's own docs recommend for safe retry
handling), the bulk "set seats to N" billing-settings control for a
company onboarding many drivers at once (vs. the incremental per-invite
warning built here), and the actual product decision of whether going
over capacity **hard-blocks** the invite or **auto-scales** the Stripe
subscription quantity with proration -- flagged as a real open question,
not guessed at.

## Terminal Tier — Build Spec (recorded 2026-08-03, not yet scoped into sprint work)

Mockups walked through screen-by-screen with the user 2026-08-03 (Dispatch/
Lead/Driver role screens, built in Inkscape). Nothing below is built yet.
This directly supersedes the "Role-based tabs" work above — see that
section's strikethrough note. Cross-check against "Architecture reality"
below before touching schema, as always.

### Tab structure
- Base tab set for **every** role: Terminal | [contextual middle tab] | Cards
  | Vault. No dedicated Lead/Dispatch/Admin tab anymore — that whole concept
  is shelved (see "Role-based tabs" above).
- Middle tab is contextual: Planner for driver/lead roles; **Dispatch** for
  dispatch and admin roles by default.
- ~~**Admin toggle (maybe, if feasible)**: admin can flip themselves between
  "admin mode" (Dispatch middle tab) and "lead driver mode" (Planner middle
  tab)...~~ — **superseded 2026-08-04, see "Tab bar fix" below.** Built as a
  toggle first (`adminActingAsLead`), then explicitly replaced per user
  direction: admin/super-admin get **both** Dispatch and Planner as
  permanent, separate tabs (not a toggle) — "dispatchers never get in a
  truck" but admins routinely need both views without a mode switch.
- **Cards tab is contextual for admin/dispatch**: instead of their own cards
  (neither role logs their own loads/cards in the field), it reflects
  whichever driver is currently selected — same driver selected for the
  Dispatch tab. Driver/lead roles keep their own Cards tab as today.
- Vault tab: unchanged, every role keeps their own personal vault, no
  changes needed.

### Tab bar fix — Planner access for admin/super-admin (shipped 2026-08-04)

Bug reported live: "the app loads to the dispatch tab but shows the
planner. if I change tabs and go back to dispatch it shows the actual
dispatch tab." **Root cause**: the original toggle-based design had
Dispatch and Planner sharing one tab id (`"planner"`, swapped between the
two hrefs based on `adminActingAsLead`) — for bare `/calculator`,
`activeTabFor` returned `"planner"`, which highlighted whichever tab
currently held that shared id (Dispatch, by default for admin), while the
actually-rendered route (`/calculator` itself) was the real Planner page.
Highlight and content disagreed by construction, not a rendering bug.

**Fix, per explicit user direction** ("add a planner tab for super admins
and admin roles... admins should have the planner used by lead drivers, no
need for jump in as Lead, dispatchers never get in a truck"):
- `CalculatorLayoutClient.tsx`: every tab now has a permanently unique id
  (`terminal`/`dispatch`/`planner`/`cards`/`vault`). `tabsFor(role,
  isSuperAdmin)`: dispatch → Terminal/Dispatch/Cards/Vault (no Planner,
  ever); admin or super-admin → Terminal/Dispatch/Planner/Cards/Vault
  (both, permanent, not a toggle); everyone else → Terminal/Planner/Cards/
  Vault. `activeTabFor` now does a straight pathname-prefix match per tab
  instead of the old "find the one extra tab" logic — the shared-id class
  of bug can't recur since ids are unique.
- `adminActingAsLead` removed entirely from `CalculatorShellContext.tsx`
  (state + setter) — no toggle state left to desync.
- `app/calculator/page.tsx` (Planner): removed the "Acting as Lead Driver /
  ← Back to Dispatch" banner. Added a **one-time landing redirect** — a
  module-level `hasCheckedDefaultLanding` flag (must be module-level, not
  component state: this page genuinely unmounts/remounts on every route
  nav, so component state can't survive a round-trip to another tab and
  back) gates a `useEffect` that sends dispatch/admin/super-admin users
  from bare `/calculator` to `/calculator/dispatch` on first landing only —
  so those roles still land on Dispatch by default, but visiting Planner
  afterward (via the new permanent tab) is never bounced back.
  `canDriverTrain` simplified to `role === "lead" || role === "admin" ||
  isSuperAdmin` (was gated on the now-removed toggle).
- `app/calculator/dispatch/page.tsx`: removed both the "Jump in as Lead
  Driver →" (no driver selected) and "Act as Lead Driver" (driver selected)
  buttons entirely, along with the now-unused `role`/`canActAsLead`
  variables — per "no need to have a jump in as Lead on dispatch tab."
- `isDispatchContext` in `app/calculator/terminal/page.tsx` and
  `app/calculator/cards/page.tsx` simplified from `(role === "dispatch" ||
  (role === "admin" && !adminActingAsLead)) && selectedDriverId` to
  `(role === "dispatch" || role === "admin" || isSuperAdmin) &&
  selectedDriverId` — the contextual (viewing-a-selected-driver) behavior
  for these two tabs no longer depends on a mode that doesn't exist anymore.

**Live-verified 2026-08-04**: `tsc --noEmit` clean. Fresh load of
`/calculator` as the real admin account correctly redirects to
`/calculator/dispatch` (driver picker, no Jump-in-as-Lead button). Tab bar
renders Terminal/Dispatch/Planner/Cards/Vault as five distinct tabs.
Clicking Planner navigates to real Planner content (equipment/terminal
cards, presets, LOAD button, Driver Training) with the Planner tab itself
correctly highlighted — the exact mismatch that was reported is gone.
Clicking back to Dispatch still works and still shows only "‹ Change
Driver" with no act-as-lead button anywhere. (Some stale "export doesn't
exist" build errors surfaced in the console during this check from a
now-superseded version of `labels.ts` — confirmed via `grep` that no
current file imports anything but `displayLabel`; this is the known
`read_console_messages`-buffers-forever behavior, not a live regression.)

### Default-landing redirect removed for admin; real full-app impersonation added (2026-08-04, later same day)

User reported the Planner tab still didn't stick for admin — tapping it
"twitches back" to Dispatch, even with a driver selected. **Root cause**:
the one-time landing redirect above (`hasCheckedDefaultLanding`) also fired
for admin/super-admin, not just dispatch. The module-level flag is supposed
to make it fire only once per session, but if this page's own JS chunk gets
re-evaluated after navigating away and back (plausible on mobile under
memory pressure, though not confirmed as the exact mechanism here), the
flag resets and the "one-time" redirect silently refires on what the admin
experiences as a deliberate Planner visit.

**Fix, per explicit user direction**: "the only role that should default to
the dispatch tab on open is the dispatch role. all other roles should open
to the planner. the Admin roles just get a backstrip button in the
dispatch. Tap that allows them to use the whole app as if they are the
person selected."

- `app/calculator/page.tsx`: the redirect condition narrowed from
  `role === "dispatch" || role === "admin" || isSuperAdmin` to just
  `role === "dispatch"`. This doesn't fix the theoretical re-evaluation risk
  in the abstract, but it does mean the only role that can hit it
  (dispatch) has no Planner tab to be bounced away from in the first place
  — the bug class has no visible symptom for any role that can actually
  reach it now.
- `app/calculator/dispatch/page.tsx`: new "Use app as {driver} →" button
  (admin/super-admin only — `canUseAppAs = role === "admin" ||
  isSuperAdmin`; dispatchers never get in a truck), shown once a driver is
  selected and their identity has loaded. This is a different, bigger
  capability than the same-day Cards-tab parity work above — that was a
  *contextual* view (dispatch/admin looking at a driver's cards/notes while
  staying themselves); this is *real* full-app impersonation, reusing the
  existing `setupSession` mechanism (`lib/setupSession.ts`, the same one
  `/admin`'s "Set up planner for X" button already used) so the admin
  becomes that driver everywhere — Planner, Terminal, Cards, actually
  loading a truck, all of it — not just a Cards-tab-scoped partial view.
  `SetupSession` gained an optional `returnTo` field (defaults to `/admin`
  when omitted, preserving the original `/admin`-entry behavior unchanged)
  so the Planner's existing "← Return to Admin" banner can correctly read
  "← Return to Dispatch" and go back to where this admin actually started,
  not a page they never visited.

**A real bug found and fixed twice in a row while verifying this** (same
root cause, hit on both the entry and exit path): `startSetupSession()`/
`clearSetupSession()` only touch `sessionStorage` — `CalculatorShellContext`'s
`setupSession` React state is read from `sessionStorage` exactly once, in a
mount-only `useEffect`. The original `/admin` → "Set up planner for X" flow
never hit this because `/admin` sits *outside* the `/calculator` layout, so
`router.push("/calculator")` always mounts `CalculatorShellProvider` fresh.
But the new Dispatch-tab entry point starts and ends *inside* the same
`/calculator` layout — a plain `router.push` doesn't remount the provider,
so a freshly-written (or freshly-cleared) session silently never took
effect. Live-verified broken exactly as described (clicking "Use app as
Kyle Tatro" left the Planner showing the *admin's own* equipment; clicking
"← Return to Dispatch" afterward left the "Setting up planner for" banner
still showing) before switching both the entry click and the exit click to
`window.location.href = ...` (hard navigation, forcing the provider to
remount and re-read `sessionStorage` either way) — same fix
`JoinFleetView.tsx` already uses for this identical class of problem.

**Live-verified end-to-end, 2026-08-04**: fresh load of bare `/calculator`
now lands directly on Planner (no redirect at all) for the admin account.
Selected Kyle Tatro on Dispatch, confirmed the "Use app as Kyle Tatro →"
strip renders, clicked Planner while Kyle was selected — content stayed on
Planner with no bounce back (the originally reported bug, now gone; waited
several seconds to rule out a delayed re-fire). Clicked "Use app as Kyle
Tatro →": banner now correctly reads "SETTING UP PLANNER FOR / Kyle Tatro",
content switched to Kyle's own (empty) equipment state — not the admin's —
confirming the session genuinely took effect this time. Clicked "← Return
to Dispatch": URL moved to `/calculator/dispatch`, `sessionStorage` cleared,
driver picker shown (admin's own identity, not stuck impersonating).
Reloaded Planner directly afterward — admin's own real equipment
(Truck·25184/Global South) rendered correctly, confirming no lingering
impersonation state. `tsc --noEmit` clean throughout.

### Equipment selection broken under full-app impersonation (fixed same day)

User's very next real-world use of the new "Use app as {driver}" feature
hit two problems: presets appearing lost under their own identity, and
being completely unable to select equipment while impersonating.

**Presets**: checked live via direct Postgres query before assuming
anything was actually wrong — `user_plan_slots` for the admin's own
`authUserId`, all five preset slots (`__universal__` scope), all had real,
non-empty `compPlan` data with recent `updated_at` timestamps. Server-side
data was never lost. This points to a local device cache/sync display
issue (same general fragility as the earlier-documented preset-loss
incident this session, root-caused then to local-cache-vs-server
staleness) rather than a new regression from today's changes — not
independently root-caused further this pass; flagged, not fixed, since the
underlying data is confirmed safe and a hard refresh should resolve the
display.

**Equipment selection — real bug, found and fixed.** Root cause: this
company (the persistent demo/QA company used all session) is flagged
`companies.is_solo = true` despite having multiple real members — an
already-documented quirk (`is_solo` reflects how a company was *created*,
not its current member count; see the solo→fleet join flow notes above).
`EquipmentModal.tsx` routes any `is_solo` company into `SoloEquipmentModal.tsx`
instead of its own fleet UI — and `SoloEquipmentModal.tsx` had **zero
setupSession-awareness**: it didn't even accept the prop, and called
`couple_combo` directly via the browser's own live session regardless of
who was being impersonated. Confirmed live via `pg_get_functiondef`:
`couple_combo` only ever had a single overload, hardcoded to `auth.uid()`
throughout — unlike `claim_combo`, which already had a service-role
`(p_combo_id, p_user_id)` overload for exactly this class of problem, added
back when the original Dispatch-tab work was built. So tapping a truck/
trailer while impersonating Kyle actually claimed the combo under the
*admin's own* account — `useEquipment.ts`'s setup-mode `selectedComboId`
derivation (only shows combos `claimed_by` the target user) then
immediately reverted the selection back to empty, which is what read as
"won't let me select equipment."

Fixed by adding a matching service-role overload,
`couple_combo(p_truck_id, p_trailer_id, p_user_id, ...)` — a verbatim copy
of the existing function with every `auth.uid()` replaced by `p_user_id`,
migration `20260815020000_couple_combo_service_role.sql` (applied) — plus
the same plumbing pattern `claim_combo` already established: a new
`couple_combo` case in `/api/admin/setup/route.ts`, a `coupleCombo()`
helper in `lib/adminSetupClient.ts`, and `SoloEquipmentModal.tsx` gained a
`setupSession` prop (now actually threaded through from
`EquipmentModal.tsx`, which already received it but never passed it down —
also part of the bug) with `resolvePair()` branching to the service-role
proxy when impersonating. `confirmRemove` (delete_truck/delete_trailer)
was checked and left alone — those RPCs already enforce admin-only via the
*real* `auth.uid()` internally, which is correctly the actual admin during
impersonation, and the action is company-wide equipment deletion, not
user-specific, so no setupSession branch was needed there.

**Live-verified end-to-end**: impersonated Kyle Tatro (zero prior
equipment), opened Select Equipment, tapped a truck+trailer never paired
before — got the same "New Pairing, enter tare weight" prompt a real
driver would see (proving the call reached the real RPC rather than
silently failing), entered a tare weight, and the Planner correctly showed
"Truck · 22049 / Trailer · 3151" with a real compartment grid. Confirmed
via direct Postgres query that `equipment_combos.claimed_by` was genuinely
Kyle's user ID, not the admin's. This test's pairing force-decoupled the
admin's own real truck/trailer (25184/3151) as a side effect of the
existing `p_force: true` behavior (a real driver re-selecting their own
equipment mid-session is the normal case this flag exists for) — restored
immediately after by returning to the admin's own identity and
re-selecting 25184/3151 through the same picker, which correctly found
the prior tare-weight history and re-coupled with no new prompt. Confirmed
clean afterward via direct query: admin's original combo active again,
Kyle's test combo left with no active claim. `tsc --noEmit` clean
throughout.

### Dispatch tab (new)
Per-driver dashboard, reachable by selecting a driver (exact selection
UI/modal not designed yet — flagged as open design work below, not blocking
the rest of this spec). Shows for the selected driver:
- Identity/context: name, store, region, shift schedule (day-of-week + time
  range, e.g. "3p-3a"). **Store/region are believed to already exist
  somewhere on profiles** (unconfirmed — verify live before building),
  **shift schedule is net-new**, needs a new table/columns.
- Terminal card list across all terminals, each with computed expiry state —
  reuses the same `cardStateFor`-style logic as Fleet Cards/Credentials, not
  new logic. "Not Carded" is just this app's existing "inactive" card state
  relabeled to match field terminology — no new state needed, but verify the
  existing enum/state naming live before assuming the mapping is 1:1.
- Equipment summary (truck/trailer + make) and equipment registration
  expiry — reuses existing equipment data.
- A freeform dispatcher notes box, per driver. **New table** — visible and
  editable by dispatch, lead, *and* admin (not dispatch-only).
- Switching to the Terminal tab while a driver is selected opens directly
  into that driver's current terminal (as a modal) rather than a bare
  terminal picker — exact trigger/UX not fully speced, treat as a detail to
  nail down during implementation.

### Terminal tab (new — biggest net-new piece of this spec)

**Schema shipped 2026-08-10.** Migration
`supabase/migrations/20260810000000_terminal_racks_lanes_arms.sql` — applied
directly to the live DB this session (had direct Postgres write access via
the `pg` npm package, not just read — first time this project's had that
rather than routing through the Supabase SQL editor) and confirmed live via
a follow-up query: all three tables, the `allow_all_authenticated` RLS
policy on each, and the three `updated_at` triggers all present.
`terminal_racks` (rack naming + lane/arm layout config — count, reverse-
order, numeric/alphabetic per rack), `rack_arms` (one row per physical
lane × arm position, holding a `product_id` + free-text `status`), and
`rack_product_status` (rack-level product-out flag + last API/temp
reading). RLS on all three follows the `terminals`/`terminal_products`
precedent exactly (confirmed live via `pg_policies` before writing this,
alongside confirming `terminals` has no `company_id` at all — it's a
shared cross-company catalog, so no company-scoped role-check function
could apply here anyway): wide open to any authenticated user, with
"Edit Terminal" being hidden from drivers enforced in the UI only, same
risk profile equipment CRUD carried before its 2026-08-07 permission-split
migration. `rack_arms.status` is deliberately a loose nullable `text`
column, not an enum — the canned status list (e.g. "Arm Down," "No
Premium") isn't fully enumerated yet.

Also confirmed before writing this: `terminal_products.is_out_of_stock`
already exists but has never actually been set `true` by any code path
(grepped every reference — it's read/displayed and defaulted `false` on
insert only) and is terminal-wide, not rack-scoped, so it can't represent
"out at South Rack only" without changing its primary key. Left untouched
rather than repurposed — `rack_product_status` is a clean new table, not
a rack-scoped extension of the old column.

**Deliberately decoupled from the Planner** — confirmed with the user:
since the Planner doesn't ask the driver which rack they're loading at,
any in-Planner warning based on rack-level outages would be a guess (the
product could be fine at a different rack of the same terminal) and risks
training drivers to distrust the flag. No `rack_id`/`terminal_id`
awareness is being added to the load flow for this pass — the Terminal
tab is a standalone status board, checked manually, not reasoned about by
the planner. Revisit only once there's real usage data on how often
outages happen and how reliable the crowdsourced flags turn out to be.

**App code shipped 2026-08-11** (`app/calculator/terminal/`), committed and
pushed (`111fa80`): new universal Terminal tab (`page.tsx`) showing rack
sub-tabs + a lane/arm grid (`RackLaneGrid.tsx`) + the rack's product list;
`LaneStatusModal.tsx` (per-arm STUD, open to every role) and
`RackProductStatusModal.tsx` (rack-level STUD, feeds
`update_terminal_temp_bias` via `/api/fuel-temp`'s predicted temp, same
error computation `useLoadWorkflow.ts` already does); `EditTerminalModal.tsx`
(lead/dispatch/admin only, hidden from drivers — rack create/rename, product
list curation mirroring `ManageTerminalProductsModal.tsx`'s pattern against
`rack_product_status` instead of `terminal_products`, and lane/arm layout
config). `CalculatorLayoutClient.tsx`'s tab bar now has Terminal as a
universal tab; the shelved Lead/Dispatch/Admin role tabs and their
`ROLE_TABS`/`ROLE_TAB_ORDER` machinery were removed in the same pass (the
routes/components under `app/calculator/lead|dispatch|admin/` were left in
place, just no longer reachable from the tab bar — not deleted outright).

Lane/arm display labels (reversed order, numeric vs. alphabetic) are purely
presentational (`labels.ts`) — `rack_arms.lane_number`/`arm_number` are
always a stable 1-based physical position, never remapped; only the printed
label changes. This also makes resizing a rack's lane/arm count trivial
(`EditTerminalModal.tsx`'s layout save): insert blank rows for new tail
positions, delete rows beyond the new count, never touch existing ones.

`tsc --noEmit` is clean across the whole project.

**Fully live-verified 2026-08-04**, in a real logged-in session (this
session's own dev-server sandboxing issue never got resolved, but
`preview_start` with a plain `url` — pointing straight at the *other*
already-running chat's `localhost:3000` — worked once the user actually
logged in there). This surfaced three real bugs no amount of typechecking
would have caught, all fixed the same pass:

1. **A newly created rack never got its `rack_arms` grid seeded** — only
   happened when someone opened Edit Lane/Arm Layout and hit Save, so a
   fresh rack's Lane Map and product-assignment UI both silently rendered
   as if the rack had no arms at all. Fixed: `addRack()` now seeds the
   grid immediately at the table's own defaults.
2. **No UI existed to assign a product to a specific arm at all** — the
   rack's product list (`ProductsView`) and its layout config
   (`LayoutView`) never actually connected to individual `rack_arms` rows,
   so the Lane Map always rendered every cell blank regardless of setup.
   New `AssignArmsView` (reachable via a new "Assign Arm Products" button
   per rack) — this was a real gap in the original build, not a deferred
   scope decision.
3. **Tab bar navigation silently no-op'd** when toggling admin
   act-as-lead while sitting on `/calculator/dispatch` — see the "Roles &
   permissions" section below for the fix (it's really a tab-bar bug, not
   Terminal-tab-specific, but was caught testing this flow).

With those fixed, end-to-end confirmed working against real data: create
rack → seed grid → add product to rack's list → assign it to a specific
arm → Lane Map reflects it live → STUD a lane (Arm Down flag renders on
the grid) → STUD a rack product with API/temp → **confirmed a real
`terminal_temp_bias` row updated 5 seconds later** (not just that the
write succeeded, that the downstream RPC actually fired) → Edit Terminal
correctly hidden from context where it shouldn't show, present where it
should. Driver-role gating itself (hidden entirely, not just disabled)
is still only architecturally verified, not tested with a real
driver-role login — same category of gap this project has flagged
elsewhere for role-matrix checks.

Available to **all roles**, but with different capabilities:

- **Structure**: a terminal has one or more named **Racks** (e.g. "North
  Rack," "South Rack" — customizable names, some real-world racks are
  lettered instead). Each rack has **Lanes** (numbered in the mockup, but
  needs the same count/order customization as arms below) and each lane has
  **Arms** (count varies per facility, sometimes in reverse order, e.g. 6-1
  instead of 1-6). Each arm holds a product code (matches the existing
  granular product catalog) and a status.
- **Rack-level Product List**: shows every product available at that rack
  with live API/temp readings.

**STUD (= "status update") actions** — two distinct granularities, both
crowdsourced for this first pass (open to any role, including drivers — no
permission gate on *reading or submitting* a status update):
1. **Lane-level**: tapping a lane opens a "Lane N — Status Update" modal,
   one row per arm in that lane, each settable to a status like "Arm Down"
   or a specific out-of-stock note (e.g. "No Premium"). Use case: one
   specific arm is down/restricted, rest of the lane is fine.
2. **Rack-level**: the "STUD" button at the bottom of the rack screen opens
   a "Product Status Update" modal — pick a product, mark it e.g. "Product
   Out," enter API + temp. Use case: a product is out across the *entire*
   rack, not just one arm. **The API/temp entered here needs to feed the
   existing fuel-temp-bias system** (`terminal_temp_bias` /
   `update_terminal_temp_bias`) — same underlying data, new write path.
   Needs its own design pass to fit the existing bucketing (hour-of-day/
   month) — not just "add a row somewhere." **Resolved 2026-08-08, see
   "Rack-level STUD now writes through to terminal_products" below** — the
   temp-bias feed itself was already wired at launch; what was still
   missing was `terminal_products` itself.

#### Rack-level STUD now writes through to terminal_products (2026-08-08)

Found live, not reported as a bug report — while capturing real app
screenshots for the marketing landing page (see "Website / landing page
rework" below), the Terminal tab's own rack-level Product List kept
showing blank `API —` / `—°F` placeholders for a real, actively-used
terminal (Marathon, Tampa) even though the Planner's temp prediction for
that same terminal was clearly working (real predicted temp, real
`terminal_temp_bias` buckets). User's own diagnosis, confirmed live before
touching anything: **`rack_product_status`** (the table the rack Product
List actually reads) and **`terminal_products`** (the older, per-terminal
table the Planner's prediction pipeline and `useLoadWorkflow.ts` actually
read/write) are two separate tables that were never connected — the rack
feature launched with its own fresh table rather than reading or writing
the one already in use. Confirmed via direct query: of 28 total
`rack_product_status` rows across the whole live DB, 27 were null; North
Rack and South Rack at Marathon both had **zero** real readings on either
rack, even though `terminal_products` had real, recent data for the same
terminal (D2 36.8 API / 89.5°F, updated 2026-07-24, etc.) — so nothing was
"lost," the new table had just never been fed from the old one.

User's ask, and the actual fix: rack-level STUD submissions should be a
second way of updating the *same* shared "last known" value the Planner
already uses — global across every company, same as `terminals` itself —
not a parallel, rack-siloed side table. `RackProductStatusModal.tsx`'s
`save()` now does a `terminal_products` update-then-insert-if-missing
(same pattern `useLoadWorkflow.ts` already uses after a real load
completes: `last_api`, `last_temp_f`, `last_api_updated_at`,
`last_loaded_at`, `last_updated_by_load_id: null` since there's no load,
`updated_at`), including the same canonical-product pooling a dyed-diesel
STUD update needs (a variant pools onto its canonical product's
`terminal_products` row instead of forking its own) — `ProductLite` gained
`canonical_product_id`, sourced from the `products` table the same way
`ActiveComp` already does in `app/planner/types.ts`. Deliberately gated on
*both* API and temp being supplied together (same gate the existing
temp-bias call already used) so a partial STUD entry can never blank out a
previously-good value in the other column. `rack_product_status` itself is
untouched — still the thing the rack UI reads for display, just no longer
the only thing a STUD submission writes to.

**Live-verified 2026-08-08**: submitted a real STUD entry (51.2 API /
78.3°F) for ULSD Diesel #2 on Marathon's North Rack, then queried both
tables directly — `rack_product_status` and `terminal_products` both show
the new values under the same timestamp cluster, and the Terminal tab's
Product List immediately reflected it (previously blank `API —` row now
reads `API 51.2` / `78.3°F`). `tsc --noEmit` clean.

**Not done, flagged not guessed**: no backfill migration was run to seed
existing empty `rack_product_status` rows from `terminal_products`'
already-real values — the write-through fix means new STUD submissions
self-heal this going forward, but the ~26 remaining null rows across other
terminals stay null until either a real STUD submission or a real load
happens there. A one-time backfill was discussed but not run pending a
decision on scope (one terminal vs. every terminal in the live DB).

Crowdsourcing model is explicitly a v1/experiment — "we'll see how
crowdsourcing terminal statuses go." Long-term intent is terminal operators
eventually get write access with everyone else moved to view-only for
structural edits, but that's explicitly not this pass. Don't build any
operator-specific role for this yet.

**Edit Terminal** (structural configuration — separate from the STUD status
actions above):
- Name/create racks for the whole facility.
- Per rack: edit the active product list (this is effectively the
  previously-deferred punch-list item #9's admin-curated terminal product
  list — **treat item 9's old spec as absorbed into this**, don't build it
  separately), and edit lane/arm layout.
- Layout customization, same shape for both lanes and arms: a count input,
  a reverse-order toggle (icon: rounded-rectangle arrow, paired with a
  toggle switch), and a numeric-vs-alphabetic toggle ("123" vs "ABC"
  labeling — some racks/lanes are lettered, not numbered).
- **Permission**: hidden entirely from drivers (not just disabled). Lead,
  dispatch, and admin can all edit.

**Shipped 2026-08-04** (Dispatch tab, Cards/Terminal contextual behavior,
admin act-as-lead toggle, Driver Training). Built in one continuous pass per
explicit user direction ("keep rolling... I don't want to stop you to fix
anything you will naturally fix in the process") — punch-list review deferred
to the user rather than pausing per-feature. `tsc --noEmit` clean throughout.

**Fully live-verified 2026-08-04**, same real logged-in session as the
Terminal tab pass above. Found and fixed **one real bug**: toggling admin
act-as-lead while sitting on `/calculator/dispatch` relabels the middle tab
"Planner" without changing the URL — the tab bar's click handler compared
`t.id !== active`, and both the Planner and Dispatch tab variants
deliberately share `id: "planner"` (to keep active-tab detection simple
across the swap), so a click was silently treated as "already here, just
re-center" instead of navigating. Fixed by comparing the actual `pathname`
against `t.href` instead. End-to-end confirmed working with real company
roster data (6 real drivers, not demo placeholders): driver picker → real
identity/region/division render → schedule toggle persists
(`driver_schedules` row confirmed via direct query) → notes save on blur
(`dispatcher_notes` confirmed) → Cards tab correctly goes read-only
contextual **only when using real in-app tab navigation** (a full
`navigate()`-style page reload — not something a real user ever does by
tapping tabs — resets `CalculatorShellContext`'s in-memory
`selectedDriverId`, which looked like a bug during testing but isn't one)
→ Terminal tab correctly infers the selected driver's own most-recent-load
terminal (visibly different rack setup than the tester's own location) →
act-as-lead toggle + the tab-bar fix above → Driver Training picker
(correctly excludes self) → picking a trainee and tapping LOAD wrote a
real `load_log` row with `trainee_id` correctly set to the trainee, `user_id`
correctly staying the lead → canceling the test load cleanly deleted the
row (confirms the existing "planned row" cleanup path, not a new gap).
Test artifacts (a note, a schedule toggle) were cleaned up after verifying;
the test load was canceled, not completed, so no fake payroll/incentive
data was created. The Terminal tab's "North Rack" test setup at Global
South was deliberately left in place as a working example, not cleaned up.

**Not verified**: the trainee-side "Training with X" banner (needs a
second real driver-role login, not available this session — same
limitation this project already documents for other role-matrix checks)
and driver-role gating of Edit Terminal (architecturally sound, not
empirically tested with a real driver account).

### Terminal tab visual redesign (2026-08-04)

User provided a real mockup screenshot and a written punch list after the
first Terminal tab pass; this is a from-scratch redesign of the Lane Map
and its two STUD modals to match it, plus real schema changes it required
— migration `20260813000000_rack_arms_blenders_and_lane_status.sql`
(applied). `tsc --noEmit` clean; live-verified end-to-end in the same real
session (blender assignment, product-out toggle, and the circle-slash
"fully down" rendering all confirmed against actual DB state and a
screenshot, not just that the UI didn't crash).

- **Continuous lane numbering across racks** (`labels.ts`): a terminal's
  second rack no longer restarts at lane 1 — e.g. South Rack 1-5, North
  Rack continues at 6-10. Deliberately **derived, not stored**:
  `computeLaneOffsets(racks)` orders racks by `created_at` and sums
  `lane_count` running totals, so it can never drift out of sync with the
  racks list the way a stored offset column could if a rack's lane count
  changed later. `TerminalRack.created_at` added to the type (the column
  already existed in the original migration, just wasn't selected before).
- **No more letter option, for either lanes or arms.** The original build
  had `lane_alpha`/`arm_alpha` toggles; both removed from the UI (per
  explicit "we don't need a letter option for arms," extended to lanes too
  since a global continuous numbering scheme and per-rack lettering don't
  compose sensibly). The `lane_alpha`/`arm_alpha` **columns are still in
  the DB**, just unused going forward — not worth a migration to drop them.
- **Blender arms — up to 3 products on one arm.** `rack_arms.product_id`
  (single) → `product_ids uuid[]` (existing single assignments preserved
  via `array[product_id] where product_id is not null` during the
  migration, not discarded). `AssignArmsView` in `EditTerminalModal.tsx`
  changed from a `<select>` to multi-select toggle chips capped at
  `MAX_PRODUCTS_PER_ARM = 3`.
- **Structured Lane Down / Arm Down / Product Out, replacing the old
  free-text `rack_arms.status`.** Per explicit direction ("no need for a
  text field or clear button or slow fill button" — toggle buttons only):
  - New `rack_lanes` table (`rack_id, lane_number, is_down`) — lane-level
    down state didn't exist as a concept before this pass at all.
  - `rack_arms.is_down` (whole arm) + `rack_arms.out_product_ids` (which
    of *this arm's own* products are flagged out) replace the dropped
    `status` column.
  - `LaneStatusModal.tsx` rebuilt: a "Lane Down" toggle at the top, then
    per arm an "Arm Down" toggle plus one "{Product} Out" toggle per
    product currently on that arm.
- **Layered down/out rendering logic** (`RackLaneGrid.tsx`,
  reverse-engineered from the actual mockup screenshot, not just the
  written punch list — the image showed two visually distinct treatments
  that the text alone didn't fully specify): an arm renders **fully
  down** (a red circle-slash "no" icon over the whole column) when either
  `arm.is_down` is true, or *every* product currently on that arm is out
  for any reason — flagged out on this specific arm
  (`out_product_ids`), or out **rack-wide** via the bottom STUD button
  (`rack_product_status.is_out` for that product) — the two signals are
  read together, not stored redundantly. If an arm has multiple products
  and at least one is still available, only the individually-out
  product(s) get a plain strikethrough; the arm itself stays normal. This
  is why the mockup shows a lone product (Transmix, alone on its arm)
  circle-slashed while a two-product arm with one product out just shows
  a strikethrough on that one code — confirmed this reasoning against the
  screenshot pixel-by-pixel before writing the rendering logic, then
  reproduced the same visual live by marking one product out on a
  two-product arm (strikethrough, arm still normal) and then the second
  (arm flips to full circle-slash).
- **Product List polish**: added `products.description` to the row
  (matches the mockup's "(pipeline interface mixture)"-style annotations),
  wider gap between the API and temp columns, explicit "API —" / "—°F"
  placeholders instead of blank space when a product has no reading yet
  (per "always show" — the columns no longer shift depending on data
  presence), and the whole row dims + strikes through when
  `rack_product_status.is_out` is true (previously just an "OUT" badge).
- **`RackProductStatusModal.tsx` (rack-level STUD)**: API/temp fields now
  prefill from that product's own last reading when selected, instead of
  starting blank. Done button moved out of the sticky footer into normal
  content flow (`footer={null}`), per "move the done button up so it
  stays just under everything."
- **Sub-tab active color**: `CenteredSubTabs` now gets `accentColor="#ffffff"`
  on the Terminal tab's rack picker (was defaulting to the component's own
  cyan) — "sub tab should be white not blue."

**Not done this pass, flagged not guessed**: the mockup's header
("Marathon / 425 South 20th Street, Tampa, FL") wasn't touched — that's
the app's shared header chrome across every tab, not Terminal-tab-specific
content, and no street-address field exists anywhere in the schema
(`terminals` only has city/state/lat/lon). Read the punch list's itemized
asks as scoped to the tab's own content area (lane map + product list),
not a request to add fabricated address data or restructure shared chrome.

### Lane Status modal tightening + explicit lane/arm labels (2026-08-04, same day continued)

Two more rounds of feedback against a real screenshot, same session:

**Lane Status modal tightening**: `FullscreenModal` gained an optional
`headerRight` slot (purely additive — `min-w-[64px] flex justify-end`
replacing the old fixed empty spacer, so every other modal using this
shared component is unaffected). `LaneStatusModal.tsx`'s "Lane Down"
toggle moved there, out of a redundant content row that just repeated the
title. Per-arm rows collapsed further: the arm-level toggle relabeled
from "DOWN" to "ARM" so it reads as "which thing are you toggling" in
parallel with the product-code toggles next to it (`[ARM] [D2] [DYED]`),
rather than describing state redundantly against the row's own "Arm N"
label.

**Explicit lane/arm labels, replacing the count+reversed scheme entirely**
— migration `20260814000000_explicit_lane_arm_labels.sql` (applied). Root
cause: the original count+reversed model assumed every lane in a rack had
the same number of arms, which is false at real facilities. Rather than
bolt on a per-lane override, replaced the whole computed-labeling approach
with **explicit, directly-editable text** on `rack_lanes.label` /
`rack_arms.label`:
- `rack_lanes` was previously sparse (a row only existed once a lane's
  down-status had been touched); it's now the source of truth for which
  lanes exist at all, backfilled from every lane referenced by an existing
  `rack_arms` row.
- `terminal_racks.lane_count`/`lane_reversed`/`arm_count`/`arm_reversed`
  (and the already-unused `lane_alpha`/`arm_alpha`) are now **fully
  unused** — left in the DB rather than dropped, same call as the alpha
  columns before them. `TerminalRack`'s TypeScript type no longer carries
  them at all.
- `labels.ts` collapsed from `computeLaneOffsets`/`laneLabel`/`armLabel`
  down to one `displayLabel(label, fallback)` helper — the continuous-
  across-racks computation this replaced is gone entirely, not hidden
  behind a flag; full manual control made it unnecessary (an admin can
  retype a continuous number in seconds if they want one).
- `EditTerminalModal.tsx`'s Layout view rebuilt from a "set counts, hit
  Save" form into a **live-editing grid**: `+ Add Lane` / `+ Arm` per lane
  / `×` to remove either, and a `LabelInput` (tap-to-select-all, save on
  blur — same mobile-friendly "replace don't edit" pattern the STUD modal
  fields got earlier the same day) on every lane and arm. No separate
  save step — every action persists immediately, matching how
  `AssignArmsView`/`ProductsView` already worked.
- `RackLaneGrid.tsx` now enumerates lanes/arms from the actual
  `rack_lanes`/`rack_arms` rows rather than a rack-wide count, so lanes
  legitimately render with different arm counts side by side.

Live-verified end to end: added a 7th arm to one lane while removing one
from another (5 vs. 7 arms on adjacent lanes, both rendering correctly on
the live grid), renamed a lane's label to "A1" via tap-to-select-all, and
confirmed it immediately propagated to the Lane Map header badge, the
Lane Status modal's title, and the Assign Arm Products view — all three
read the same live DB value now, nothing cached or recomputed
separately. `tsc --noEmit` clean throughout both rounds.

**Two more gaps found and fixed during this same live-testing pass**
(2026-08-04, continued — not requested, found by exercising the feature
end to end rather than stopping once the requested items worked):
- **No way to delete a whole rack** — `RacksView` only ever had
  rename/reconfigure actions; a test rack created by mistake had no path
  to remove it. Added a "Delete Rack" action with an inline confirm step
  (matching the app's existing confirm-in-place pattern, e.g. Cards tab's
  deactivate/remove). `rack_lanes`/`rack_arms`/`rack_product_status` all
  reference `rack_id` as a plain column, not a DB-level FK with `ON DELETE
  CASCADE`, so the delete cascades manually in app code (children first,
  then the rack) — verified live via direct query afterward that zero
  orphaned `rack_arms`/`rack_lanes` rows were left behind.
- **The rack-wide "Product Out" STUD button's cascade to the Lane Map
  grid had only been reasoned through, not actually exercised** (earlier
  verification confirmed the DB write and the `terminal_temp_bias` feed,
  but not that the grid's "effectively down" logic correctly reads
  `rack_product_status.is_out` live). Marked "93" out rack-wide on a real
  multi-lane, multi-product rack (South Rack) and confirmed: every arm
  whose *only* product was 93 flipped to the full circle-slash, every
  arm carrying 93 *alongside* another still-available product (D2 or 87)
  correctly showed just a strikethrough on 93 with the arm otherwise
  normal, and the Product List row grayed out — all from the one toggle,
  no per-arm action needed.

- **Tab bar**: `CalculatorLayoutClient.tsx`'s middle tab is now genuinely
  contextual — `tabsFor(role, adminActingAsLead)` swaps in Dispatch (href
  `/calculator/dispatch`, same `id: "planner"` so active-tab detection stays
  simple) for dispatch role and admin role (unless acting-as-lead).
- **`shell.selectedDriverId`/`shell.adminActingAsLead`** (new, in
  `CalculatorShellContext.tsx`) — shared so Dispatch/Cards/Terminal agree on
  the same driver across tab switches without re-picking, and so the admin
  toggle is a single source of truth the tab bar, Planner, and Dispatch page
  all read.
- **`app/calculator/dispatch/page.tsx`** — fully replaced the old
  Dashboard/Tasks/Ledger placeholder (that content is gone now, not kept
  alongside). `DriverPicker.tsx` (new, shared component) to pick a driver,
  then: identity header (name, "Store {division}" — **`division` is a
  best-effort label for the mockup's "Store 495," not a confirmed match**,
  worth confirming the actual intended field if it matters; region/local_area
  already existed on `profiles`), an inline weekly-schedule editor (day
  toggles + shift time range, `driver_schedules`, new table), a terminal
  card list (status-only, reusing `terminal_access`/`user_terminal_cards`
  reads), an equipment + registration-expiry summary
  (`user_primary_trucks`/`user_primary_trailers` → `trucks`/`trailers`), and
  a notes box (`dispatcher_notes`, new table, staff-only per the spec — no
  self-read policy, so **a plain lead has no UI entry point to this page at
  all today** even though `dispatcher_notes`'s RLS already permits lead
  read/write; the Dispatch *tab* itself is only reachable by dispatch/admin
  roles via the tab bar. Flagged, not solved — a real gap if leads are
  expected to actually use these notes day to day.)
- **Cards tab, contextual** (`cards/page.tsx` + new `DriverCardsReadOnly.tsx`):
  when dispatch/admin has a driver selected, shows that driver's card
  status — **deliberately read-only**, not the "same controls as the driver"
  full parity originally described. Confirmed live before building that
  `user_terminal_cards` had *zero* admin/dispatch RLS access at all (only
  `owner_*` policies) — granting cross-user *write* access to another
  driver's card numbers/PINs is a real permission expansion, so this pass
  only added a read policy (`user_terminal_cards_admin_dispatch_read`,
  mirroring `terminal_access_admin_dispatch_read`'s exact shape) and built a
  status-only view, matching the precedent already set by
  `FleetCardsModal.tsx`/`FleetCredentialsModal.tsx` for this exact class of
  feature. Full write parity would need a deliberate follow-up decision, not
  something to assume.
- **Terminal tab, contextual**: when arriving with a driver selected
  (dispatch/admin context), the terminal shown is inferred from that
  driver's most recent `load_log` row rather than the viewer's own
  `location.selectedTerminalId` — there's no GPS/check-in signal to know
  where a driver physically is, so "most recent load's terminal" is the best
  available proxy, not a precise "where are they right now" signal.
- **`load_log.trainee_id`** (new column) + `load_log_select_trainee` RLS
  policy (narrowly scoped to `trainee_id = auth.uid()`, doesn't touch the
  existing own/admin-dispatch-read policies) — migration
  `20260812000000_dispatch_tab_and_driver_training.sql` (applied).

### Access Renewal Period field on Edit Terminal (shipped 2026-08-04)

User asked for a place to set the terminal card renewal/expiration period,
to feed the expiration notification system, on the Terminal tab. Turned out
**no new schema was needed** — `terminals.renewal_days` (int, default 90)
already exists live and already feeds every expiry computation in the app
(`useExpirations.ts`, `useTerminals.ts`, `ExpirationModal.tsx`,
`MyTerminalsModal.tsx`, `TerminalCatalogModal.tsx`, `FleetCardsModal.tsx`,
`DriverCardsReadOnly.tsx`, `dispatch/page.tsx` — all read `terminal.renewal_days
?? 90`), and was already editable in the old `/admin` console's own
`TerminalModal` (`app/admin/page.tsx`'s "Renewal Days" field). The gap was
narrower than the request implied: the *new* Terminal Tier's own
`EditTerminalModal.tsx` (the rack/lane/arm editor fleet staff actually use
now) had no field for it at all.

Added directly to `RacksView` (the top-level "Edit Terminal" screen) in
`EditTerminalModal.tsx`, above the rack list — per explicit user direction
("put it in the Edit Terminal modal because it applies to the entire
terminal," not per-rack. `EditTerminalModal` fetches/saves `terminals.renewal_days`
alongside its existing `terminal_racks` load (`loadTerminalInfo`/
`saveRenewalDays`, save-on-blur, same tap-to-select-all-adjacent numeric
input pattern already used elsewhere in this file), defaulting the input to
90 when the column is somehow null.

**Live-verified 2026-08-04** end-to-end against the real Global South
terminal — not just that the UI didn't error, that the write actually lands:
read initial value (90) via the app, edited to 45 through the real input
(tap-to-select-all + blur-to-save), confirmed via a direct service-role
Postgres REST query that `terminals.renewal_days` was actually 45 live (not
just reflected client-side), closed and reopened the modal to confirm a
fresh DB fetch also shows 45 (not a stale local echo), then reset back to 90
the same way and re-confirmed live. One real bug caught mid-verification
and self-corrected: an initial synthetic-event test dispatched a raw `blur`
event, which doesn't reach React's `onBlur` (React listens for the
bubbling `focusout` event, not `blur`, which doesn't bubble) — the input
visually updated (via the `input` event, which does bubble and does drive
`onChange`) but the save handler never fired, at first looking like a
false negative on the DB check. Switched to calling the real `.blur()` DOM
method (which the browser itself turns into a proper `focusout`), and the
write round-tripped correctly. No test data left behind — the terminal is
back at its real value (90) post-verification.

### Edit Terminal rework: bulk lane/arm tools + inline product assignment (shipped 2026-08-05)

Per a real mockup + written spec: "Assign Arm Products" is no longer a
separate top-level rack button — product assignment moved inline into the
Lane/Arm Layout flow (expand a lane card → "Lane N — Arm / Products"), and
Lane/Arm Layout itself gained bulk relabel/reorder tools on top of the
existing per-row manual rename from the 2026-08-04 explicit-labels rework
(that rework's own `rack_lanes.label`/`rack_arms.label` columns are
unchanged — this is new UI on the same schema, no migration needed).

**Design calls made, not directly in the spec text (documented here since
they weren't asked, just reasoned through against the mockup)**:
- Both "Alphabetical/Numerical" and "Reverse Order" are **bulk one-shot
  actions**, not persisted view modes — tapping them immediately rewrites
  every lane's (or, for arm-reverse, one lane's arms') `label` text in the
  DB, in current top-to-bottom (`lane_number`/`arm_number` ascending) order.
  Nothing about *which physical row holds which arms/products* ever moves —
  only the label text visible on that row changes. This is why reversing
  or relabeling never disturbs product assignments.
- "Reverse Order" is deliberately **generic**: it takes whatever label
  sequence currently exists (numeric, alphabetic, or custom text) and
  reverses that array across the same rows, rather than only working for a
  clean sequential series. Same operation for lanes (rack-wide) and arms
  (scoped to one lane, via the per-lane reverse icon).
- The "ABC"/"123" toggle's displayed state is **inferred from current
  data** (does the top-to-bottom label sequence already exactly match
  A,B,C...?) rather than tracked as separate persisted state — simpler,
  and self-corrects if labels are edited by hand in between. A reversed
  alphabetic sequence (E,D,C,B,A) won't match this ascending check, so the
  button reverts to offering "ABC" again rather than "123" — a known,
  accepted simplification, not a bug.
- Per-lane arm **count** is now a direct numeric field (type a number,
  arms are added/removed from the end to match) instead of individual
  "+ Arm"/"× arm" controls — replacing the old inline arm-chip row
  entirely. There is no more per-arm manual rename UI in this screen (the
  old small `LabelInput` per arm chip) — matching the mockup, which shows
  arm labels as plain text in the expanded product view, not an editable
  box. Existing custom arm labels still display via `displayLabel` and are
  still reachable indirectly through count-change + reverse. ~~A lane's
  own label chip did keep its manual rename input (`LabelInput`)~~ —
  **reversed same day**: explicit follow-up feedback, "the only in cell
  editing is for the number of arms" — the lane chip looked editable
  (boxed, tap-to-select-all styling) when it shouldn't have implied that;
  removed `LabelInput` and per-lane `renameLane` entirely, now a plain
  `<span>` like arm labels already were. Lane text is now only ever set by
  the bulk Alphabetical/Numerical/Reverse tools above, never hand-typed
  per row — consistent with there being no per-arm rename either.
- There is **no more per-lane delete button** — matching the mockup's lane
  row (no visible delete icon) — removal is now only via the top-level "−"
  (removes the highest `lane_number`, i.e. the last one), symmetric with
  "+" adding a new one at the end.
- The arm-product picker modal (opened by "+" on an arm) excludes only
  that **same arm's own** already-assigned products, not products used
  elsewhere in the lane — a product can legitimately sit on more than one
  arm at once (matches the existing "up to 3 products per arm" blender
  model; nothing in the spec said one-arm-exclusive).

**Live-verified end-to-end** against the real "Global South" terminal's
North Rack (careful to resolve the correct rack first — there are two
racks named "North Rack" across different terminals in this DB, Marathon/
Tampa and Global South/Fort Lauderdale; picked the wrong one on a first,
unfiltered query and caught it before drawing any conclusions from it):
tapped "ABC" — all 6 lanes relabeled A–F in order, arm counts stayed
attached to their original rows; tapped "Reverse Order" — labels flipped
end-for-end (F,E,D,C,B,A) with per-row arm counts unchanged, confirming
label content moved, not the underlying rows; edited one lane's arm-count
field from 7 to 3 — the 4 highest-numbered arm rows were deleted, kept
arm1/arm2's existing state; expanded that lane — "Lane F — Arm / Products"
rendered with 3 arm rows; tapped "+" on an empty arm — picker modal opened
scoped to only this rack's 2 active products (D2, DYED), grouped under
"DIESEL" exactly like the full catalog's own grouping; added D2 to it;
tapped "−" on the other arm (which had [D2, DYED]) — removed DYED (the
rightmost) first, leaving just D2, matching the "clear from the right"
spec exactly. Confirmed all of the above directly via Postgres query
against the correct rack_id, then manually restored every value back to
its real pre-test state (lane labels back to 1–6, arm count back to 7,
product assignments back to their original arm1=[D2,DYED]/arm2=[] shape)
since this is the persistent demo/QA rack other work in this session
already depends on, not throwaway data. `tsc --noEmit` clean throughout;
no console errors on a fresh (non-buffered) tab.

~~**Follow-up same day**: the per-lane "Reverse arm order" icon...~~ —
**superseded 2026-08-06, see below.** Moving the relabel tool into "Lane
N — Arm / Products" (so the effect was at least visible) turned out to
still not be what was actually needed — per explicit follow-up, the real
problem was never the arm *labels* at all.

### Arm order fixed at the display layer instead of via relabeling (2026-08-06)

Root feedback: "the reverse arm order isn't quite what I was hoping for...
in the main terminal card where we tap to STUD, the visual representation
of where arm 1 is matters. arm 1 is always on the right and the last arm
is always on the left." The whole relabel-based "reverse arm order" tool
(both its original per-lane-card location and its just-shipped relocation
into "Lane N — Arm / Products") was the wrong fix for the actual problem —
the Lane Map card was always rendering arm 1 leftmost, and no amount of
relabeling changes which physical column a product renders in.

**Fixed for real** in `RackLaneGrid.tsx` (the actual Lane Map card, "the
main terminal card where we tap to STUD") — `armsByLane`'s per-lane sort
flipped from ascending to **descending** `arm_number`, so arm 1 always
renders last (rightmost) and the highest-numbered arm always renders first
(leftmost), matching how real racks are physically laid out. `arm_number`/
`label` are untouched — this is a pure render-order change, nothing in the
data model moved. The "reverse arm order" relabel tool (button, state,
handler) was removed entirely from `LaneArmProductsView` — arm labels stay
a plain, permanent `1..N` sequence with no reverse tool needed for them at
all, since the actual ask was always about display, not data.

**Live-verified**: set Global South North Rack's lane 1 to D2-only on arm 1
and DYED-only on arm 7 (6 empty arms between), confirmed via the DOM that
render order is now DYED, then 5 blanks, then D2 — DYED (arm 7, highest)
on the left, D2 (arm 1) on the right, exactly as described — and via a
screenshot for a full visual check. Restored the demo rack back to its
real arm1=[D2,DYED]/arm7=[] shape afterward and confirmed the same card
still renders correctly (both products now rightmost, since arm 1 holds
both). `tsc --noEmit` clean; no console errors.

### Product List row: dropped parenthetical description, fixed a real overflow bug (2026-08-06)

Per explicit feedback: drop the `products.description` parenthetical
("(Ultra Low Sulfur Diesel #2)") from `app/calculator/terminal/page.tsx`'s
rack Product List row entirely; make the product name itself thinner --
same size/weight the parenthetical text used to have (`fontWeight: 400`,
`fontSize: 11`, still white) -- and guarantee API/temp never gets pushed
off-screen by a long name, with the name truncating instead if space runs
short.

**A real, separate overflow bug found and fixed while implementing
this** (not just the parenthetical's fault): even after removing the
parenthetical and giving the name `overflow: hidden` / `textOverflow:
ellipsis` / `minWidth: 0`, a synthetic long-name test still overflowed the
row past the viewport (confirmed via `getBoundingClientRect()` before
assuming the fix worked — row measured 573px wide inside a 404px viewport).
Root cause: each product row `<div>` is a grid item (its parent uses
`display: "grid"`), and grid items default to `min-width: auto`, which
sizes them to their content's max-content width regardless of any
`overflow: hidden` set *inside* them — the inner truncation styles were
correct but powerless because the outer grid item itself refused to
shrink below the long text's natural width. Fixed by adding `minWidth: 0`
to the row `<div>` itself (the actual grid item), not just its children --
the classic min-width:auto-on-grid/flex-items gotcha. Re-tested the same
synthetic long name afterward: row now measures 380px (within the 404px
viewport), name visibly truncates with an ellipsis, "API 50.6 / 75.6°F"
stays fully visible and right-aligned. `tsc --noEmit` clean; no console
errors; reverted the synthetic long-name DOM edit (an in-page-only test,
never touched real data) by simply reloading.

### Dispatch tab follow-up: real color bug fixed, explicit unit labels (2026-08-07, later same day)

Two real bugs reported after live use, both traced to the same root cause:
"the equipment section... showing registration expired 7 days ago, this is
incorrect... we also don't know which equipment it is for" and "the
terminal expirations are not showing proper colors."

**Investigated before assuming anything was wrong** (this repo's own
"verify live" rule): confirmed via a direct query that truck 25184's
`reg_expiration_date` genuinely is `2026-07-31` in the database (matches
what `/admin`'s own Edit Truck form shows), confirmed the claimed-combo
lookup was picking the right (only) combo `claimed_by` that driver, and
confirmed via `get_display_names_full` that combo's owner really is Seth
Perry -- so "-7 days" was arithmetically and data-wise correct; the
Equipment date itself was never wrong.

**The real bug**: this page's original color logic reused `cardTheme.ts`'s
shared `cardStateFor`, which fades anything expired more than 7 days ago
from "expired" (red) into a separate "inactive" state (gray) -- a
deliberate design in that shared function ("expired 7+ days mutes the
whole card," per its own comment), built for the Cards tab's own UX. But
the explicit ask here only ever put a day-limit on "expiring" ("expiring
in the next 7 days") -- "expired cards should show date in red" has no
day-limit at all. Under the shared function, ExxonMobil (-46 days) and
TransMontaign (-236 days) were both silently rendering gray instead of
red, exactly matching "not showing proper colors." Worse, this same
mismatch meant `collectExpiringPermits()`'s filter (which only ever
matched `cardStateFor`'s "expiring"/"expired" states, never "inactive")
would have silently dropped any permit more than 7 days overdue from the
Equipment list entirely, once the underlying date crossed that threshold.

Fixed with a local, page-only `expStateFor` (3 states: `expired` = any
`days < 0` with no cutoff, `expiring` = 0-7 days out, `valid`/`not_set`
otherwise) and a matching `DARK_EXP_COLOR` map, used everywhere on this
page instead of the shared `cardStateFor` -- deliberately NOT changed in
`cardTheme.ts` itself, since that function's 7-day decay is real, existing
behavior the Cards tab/`FleetCardsModal`/`FleetCredentialsModal` all still
rely on and weren't asked to change.

**Explicit unit labels**: `collectExpiringPermits()` now takes a
`unitLabel` ("Truck 25184" / "Trailer 3151", falling back to the bare
"Truck"/"Trailer" word if the unit somehow has no name) and bakes it
directly into each item's label ("Truck 25184 — Registration") instead of
the bare permit name alone -- directly answers "we don't know which
equipment it is for."

**Live-verified**: read every expiration line's actual computed CSS
`color` via `getComputedStyle` (not just screenshot judgment) before and
after the fix -- ExxonMobil/TransMontaign flipped from
`rgba(255,255,255,0.35)` (gray) to `rgb(239,68,68)` (red); the Equipment
line now reads "Truck 25184 — Registration" and stayed correctly red
(`-7` days was already `< 0` either way, so this item's color was never
actually wrong -- only its missing unit label was). Confirmed again after
a hard reload. `tsc --noEmit` clean. Two stale console errors
(`SimpleServiceModal is not defined`, `cardStateFor is not defined`)
surfaced mid-pass and were ruled out the same way prior stale-HMR errors
in this doc were: `tsc` clean, a `grep` confirming no live reference
remains, and the actual page rendering and computing correct values
immediately after, both before and after a hard reload.

### Dispatch tab follow-up #2: Equipment now reads equipment_permits, not the old columns (2026-08-07, same day)

User report: "still showing registration expired in dispatch but good in
the equipment modal." This **corrects** a conclusion from the
immediately-preceding note above -- that note's live check confirmed the
old `trucks.reg_expiration_date` column really was `2026-07-31` and called
the Equipment date "never wrong," but that was only checking internal
consistency (does the display match its own data source), not whether that
data source was still the right one to read.

A follow-up query against `equipment_permits` (the dynamic system the
Binder screen actually manages, joined to `permit_types`) found truck
25184's real, current "Registration" row at **2027-07-31** -- a full year
past the old column's stale `2026-07-31`. Someone renewed this permit
through the Binder at some point, which only ever writes to
`equipment_permits`; nothing writes that back to the old `trucks` column,
so the two silently diverged and Dispatch (reading the old column, per the
original design decision earlier this same day) kept showing an
expired date that had actually been fixed a year ago.

This directly reverses that earlier decision's own reasoning. The original
choice worried `equipment_permits` might be the stale one (per that
migration's own documented risk); live data showed the opposite is true in
practice for this real company -- the OLD columns are what's actually
abandoned, because the Binder (the tool people actually use to renew
permits) was migrated to the new system and the admin's plain date-input
form was not. `app/calculator/dispatch/page.tsx`'s Equipment section now
queries `equipment_permits` (`.eq("truck_id", ...)` / `.eq("trailer_id",
...)`, joined to `permit_types(name)`) instead of the hardcoded
`TRUCK_PERMIT_FIELDS`/`TRAILER_PERMIT_FIELDS` column lists, which are
removed entirely. This also means Dispatch now agrees with
`useExpirations.ts` (the header bell badge), which already read
`equipment_permits` -- previously the two could disagree about the same
truck's same permit.

**Live-verified**: truck 25184's Equipment section now shows "Nothing
expiring soon" (correctly reflecting the real 2027-07-31 date) instead of
the stale "Truck 25184 — Registration, 07-31-2026 (-7 days)" in red.
Kyle Tatro's empty-equipment case re-checked and still renders cleanly (no
crash from the new `equipment_permits` queries when `truckId`/`trailerId`
are both null). `tsc --noEmit` clean; no new console errors beyond the
same already-documented stale-HMR ones.

### Dispatch tab rework: city-grouped cards, Badges + Credentials sections, Equipment moved up (2026-08-07)

Per explicit request against `app/calculator/dispatch/page.tsx`:

- **Terminal Cards grouped by city** -- `cardsByCity` (`useMemo`) buckets
  `filteredCards` by `city` (falling back to a "No City" bucket, sorted
  last so real cities always lead), rendered as a city subheading per
  group. Search still filters across name/city/state first, city grouping
  happens on whatever survives the filter.
- **Same color scheme everywhere on this page** -- already had a
  dark-background `DARK_EXP_COLOR` override of `cardTheme.ts`'s
  `cardStateFor` (expiring within 7 days = amber, expired = red, expired
  7+ days = gray/"inactive", no date = gray/"not_set"); this pass reuses
  the exact same `cardStateFor`/`DARK_EXP_COLOR` pair for every new
  expiration line added (Badges, Credentials, and the new per-permit
  Equipment lines) via one shared `ExpirationLine` component, instead of
  each section growing its own copy.
- **New Badges section** (`driver_port_ids` -- port_name/category/
  expiration_date), directly under Terminal Cards. **New Credentials
  section** (License/Medical/TWIC -- `driver_licenses`/
  `driver_medical_cards`/`driver_twic_cards`, `expiration_date` only)
  directly under that. Both reuse the exact same admin+dispatch RLS
  `FleetCredentialsModal.tsx` already relies on
  (`supabase/migrations/20260806000000_dispatch_credential_visibility.sql`)
  -- no new migration needed, this is a second consumer of an existing
  grant, not a new one.
- **Equipment moved above Terminal Cards**, and switched its equipment
  source from "primary" (`user_primary_trucks`/`user_primary_trailers`) to
  whatever the driver has **actually claimed right now**
  (`equipment_combos` where `claimed_by = selectedDriverId`, most recent
  `claimed_at`) -- "primary" is a separate fallback-default concept (same
  one `useEquipment.ts`'s own header comment distinguishes), not "what
  they're driving today"; reading it here would show stale/wrong equipment
  for a driver who slip-seated into something else since it was set. This
  is the same signal `useEquipment.ts` itself derives setup-mode selection
  from (`combos.find(c => c.claimed_by === effectiveUserId)`), just read
  from the dispatcher's side instead of the driver's own device.
- **Equipment now lists every expiring/expired permit item**, not just
  truck registration -- `TRUCK_PERMIT_FIELDS`/`TRAILER_PERMIT_FIELDS`
  (module-level label configs mirroring `EquipmentDetails.tsx`'s
  `PermitEditRow`/`TankEditRow` call sites exactly: Registration, Annual
  Inspection, IFTA, PHMSA, Alliance, Fleet Insurance, HazMat License, Inner
  Bridge for trucks; Trailer Registration, Annual Inspection, and all
  seven Tank inspections for trailers), `collectExpiringPermits()` filters
  each unit's full field set down to only `cardStateFor` "expiring"/
  "expired" entries, sorted soonest-first.

  **Deliberately reads the OLD hardcoded `trucks`/`trailers` expiration
  columns, not the newer `equipment_permits` table** -- checked both live
  before choosing: a direct query confirmed `equipment_permits` rows exist
  for truck 25184 and their dates matched the old columns' values, *but*
  `supabase/migrations/20260723000000_permit_types_binder.sql`'s own
  header comment states the fleet-tier admin screen
  (`EquipmentDetails.tsx`'s `TruckModal`/`TrailerModal` -- confirmed via
  code read this session to be the actual, only edit path both solo and
  fleet companies use) "keeps reading/writing the OLD columns" and flags
  `equipment_permits` going silently stale as an accepted, known risk if a
  company only ever uses that form. Rather than build Dispatch's Equipment
  section on a table that migration's own author already flagged as able
  to silently drift from what admins actually edit, this reads the exact
  same columns `EquipmentDetails.tsx` writes -- guaranteed to agree with
  what dispatch/admin see and change in the Equipment modal, no
  independent-staleness risk.

**Live-verified** against the real Gemini Motor Transport company: Seth
Perry (real equipment/cards) shows Equipment above Terminal Cards
("Truck · 25184 / Trailer · 3151", one expired item -- "Registration
07-31-2026 (-7 days)" in red, correctly at the exact -7-day expired/
inactive boundary), Terminal Cards grouped into "FORT LAUDERDALE" (7
terminals) and "TAMPA" (7 terminals) subheadings, Badges showing two real
port badges, Credentials showing real License/Medical/TWIC dates -- colors
screenshot-confirmed (red for the expired item, gray for entries expired
7+ days like ExxonMobil/TransMontaign, plain white for valid/not-yet-
within-7-days entries like Global West's 10-days-out card). A second
driver with zero data on file (Kyle Tatro) confirmed every section's empty
state renders cleanly ("No equipment currently selected," "No terminal
cards on file," "No badges on file," "Not on file" ×3 for credentials) --
no crashes, no leaked data from the previous driver. `tsc --noEmit` clean;
no new console errors (same pre-existing stale dev-server errors already
documented elsewhere in this file, confirmed unrelated).

### Service type/interval editing shared across solo and fleet tiers (2026-08-07)

User feedback, in order: "in the equipment modal I can't find where we set
service intervals" (answered live -- it's the "−" edit affordance on each
option in the Type dropdown inside the Service modal, only reachable from
`SoloEquipmentModal.tsx`'s Service button, since that's where the whole
feature was originally built), then, on their own real company ("Gemini" --
confirmed via a direct `companies` query, `is_solo = true`): "can we make it
the same for all? I think everyone should be able to edit," plus a second,
independent ask: the equipment picker's report-section "next service due"
line should show the soonest due of ANY logged type, not just whichever
type happened to be logged most recently.

**Root cause of the "make it the same for all" gap**: `ServiceTypeEditorModal`/
`ServiceTypeSelect`/`SimpleServiceModal` (create a service type, set its
interval, log a service against it) only ever existed inline inside
`SoloEquipmentModal.tsx`. Confirmed via a repo-wide grep of every
`service_types`/`service_records` write: literally the only insert/update
path in the whole app. The fleet-tier equipment editor
(`lib/ui/driver/EquipmentDetails.tsx`'s `TruckModal`/`TrailerModal`, used by
both `/admin`'s Equipment section and non-solo companies' Planner "Select
Equipment" sheet) had no service UI at all -- `RecordHistoryModal.tsx`
(Reports hub's "Service History") only ever reads/edits existing rows, never
creates one. So a fleet (non-solo) company had zero way to log a first
service or configure an interval, regardless of role.

**Fix**: extracted `ServiceType`, `ServiceTypeEditorModal`, `ServiceTypeSelect`,
`SimpleServiceModal`, and a `fetchServiceTypes()` helper into a new shared
file, `app/calculator/modals/ServiceTypeManager.tsx` -- same reasoning
`lib/ui/CustomSelect.tsx`'s own header comment already gives for why this
kind of thing gets pulled out instead of copy-pasted per-tier ("duplicating
this per-file is how the bug crept back in once already"). `SoloEquipmentModal.tsx`
now imports from there instead of defining its own copies (one real bug
caught in the extraction: `ServiceTypeSelect`'s dropdown button had been
using the plain `inputStyle`, not the chevron-icon `selectStyle` variant the
original used -- fixed before it shipped, not after).

Added a new `ServiceSection` component directly in `EquipmentDetails.tsx`,
wired into both `TruckModal` and `TrailerModal` (`!isNew` only -- needs a
real unit id) as a "Log Service / Manage Service Types" button opening the
same `SimpleServiceModal`. **Deliberately not gated by `canEditRestricted`**
(the admin/dispatch/lead-only gate every other restricted field on this
modal uses) -- per explicit user direction ("everyone should be able to
edit"), matching the solo flow's own precedent, which was never role-gated
either.

**Report-section "next due" fix** (`SoloEquipmentModal.tsx`'s
`computeUnitServiceDue`): previously picked whichever service type had the
most recently LOGGED record for that unit (by date, then `created_at` to
break same-day ties) and showed that type's own due state -- which could
surface a type due months away while a different type logged earlier was
actually due imminently. Rewritten to compute a due candidate for every
type with at least one record (`duration` → real due date; `miles`/`hours`
→ absolute due reading) and pick the soonest **within its own kind** --
comparing raw due-mileage or due-hours across types for the SAME unit is
still valid without live odometer/engine-hour telemetry (this app doesn't
track either), since it's the one monotonically increasing counter for that
unit ticking toward each threshold; a due DATE and a due READING aren't the
same unit of "soon" though, so when both exist for a unit, `duration` wins
as the more universally actionable of the two. Types with no computable due
(`interval_kind: "none"`, or a `miles`/`hours` type missing its reading)
only get shown as a last-resort fallback (most-recently-logged, same as the
old behavior), and only when nothing else on that unit has a real due
candidate at all.

**Live-verified against the real "Gemini Motor Transport" company** (not a
demo/test company -- confirmed `is_solo = true` via direct query, which is
why the Planner's "Select Equipment" still routes through `SoloEquipmentModal`
for it today):
- Fleet path: `/admin` → Equipment → Edit truck 25184 → "Log Service /
  Manage Service Types" now present and working -- opened the Type dropdown
  (existing "Dry"/"Wet" types with their edit affordances + "+ New type"
  rendered correctly), opened "Edit Service Type" for "Dry" (Miles / 65000 /
  Truck only), closed without changes.
- Solo path regression check: same truck (25184) via the Planner's Select
  Equipment sheet -- Service modal still opens and behaves identically to
  before the extraction.
- Next-due fix: truck 25184 has both a Dry record (due at 291,086 mi) and a
  Wet record (due at 326,442 mi, and the one more recently logged). Report
  line now reads "Truck · Dry / Due at 291,086 mi" -- the lower (sooner) of
  the two -- where it previously read "Truck · Wet / Due at 326,442 mi"
  purely because Wet was logged more recently. Confirmed both before and
  after a hard reload (not just a warm client nav).

`tsc --noEmit` clean throughout. One console error surfaced mid-pass and
persisted across a hard page reload -- `ReferenceError: SimpleServiceModal
is not defined` -- initially concerning since it survived a reload, but
ruled out as a real regression: `tsc --noEmit` stayed clean the whole time,
a direct `grep` confirmed no stale reference exists in any source file, and
the exact flow the error name implies would break (opening the Service
modal) was exercised successfully multiple times, in both the solo and
fleet paths, both before and after the reload, with the modal rendering its
full form every time -- consistent with this project's own documented
Turbopack/dev-server HMR staleness category (see "Dev-server stale-content
trap" earlier in this doc), not a genuine break. Worth a real dev-server
restart to fully clear if it resurfaces.

### Tab order swap + tab-switching "glitch" fix (2026-08-06)

Two small follow-ups, per explicit request:

- **Tab order**: Terminal and Dispatch swapped places in
  `CalculatorLayoutClient.tsx`'s `tabsFor()` so Terminal sits directly next
  to Planner (order is now Dispatch, Terminal, Planner, Cards, Vault for
  admin/super-admin; Dispatch, Terminal, Cards, Vault for dispatch role,
  which has no Planner tab regardless). Driver/lead order (Terminal,
  Planner, Cards, Vault -- no Dispatch tab at all) is unaffected.
- **"Dark mode flashes white then corrects" on tab switch** -- user's own
  diagnosis was exactly right, and pointed at two real, separate bugs, both
  in `CalculatorLayoutClient.tsx`/`hooks/useTheme.ts`, not something
  imagined:
  1. `useTheme.ts`'s `darkMode`/`accentColor` used to start at hardcoded
     defaults (`false`/`null`) and only get corrected once `authUserId`
     resolved (async, from `supabase.auth.getUser()`) and its effect ran --
     a textbook flash-of-default. Fixed by also mirroring the last-applied
     theme under a new userId-independent `protankr_theme_v1:__device__`
     key, read synchronously in the initial `useState` (lazy initializer) --
     same-device return visits now start correct immediately, no async
     wait. The per-user-keyed effect still runs afterward and corrects it
     if a genuinely different account's saved theme differs; nothing about
     the existing per-user persistence changed.
  2. Header's `<meta name="theme-color">` sync effect had a cleanup
     function that reset the tag to `"#ffffff"` -- React fires an effect's
     cleanup before *every* re-run of that effect (i.e. on every
     darkMode/accentColor change), not only on true unmount, so this was
     silently doing "flash white, then set the real color" on every single
     theme-relevant re-render, which is a strict superset of every tab
     switch. There was nothing to actually clean up: Next's own per-route
     metadata already reapplies whatever static `viewport.themeColor` a
     *different* layout declares once the user genuinely navigates away
     from `/calculator` (handled declaratively, not by this component) --
     removed the reset-in-cleanup entirely.
  Also added, defensively: a `transition: "background 200ms ease"` on the
  header's own gradient div (so any future legitimate theme change fades
  instead of snapping), and `router.prefetch()` for every tab's href in
  `TabBar` on mount, so `router.push` on tap is served from the already-
  fetched RSC payload instead of a fresh network round trip -- addresses
  the "speed the transition" half of the request, separate from the
  flash-of-white fix.

**Live-verified**: installed a `MutationObserver` on the real
`<meta name="theme-color">` tag with dark mode + a custom accent enabled,
then clicked through every tab (Terminal → Cards → Vault → Dispatch →
Planner) -- zero mutations recorded (stayed at the correct `#2a2a2c`
graphite value the entire time; previously, before this fix, this exact
sequence would have fired a white-then-graphite pair on every single
click via the cleanup bug above). Confirmed via a fresh hard reload too
(cold load, not just a warm client nav) that the meta tag is correct
(`#2a2a2c`) immediately, no flash window at all. `tsc --noEmit` clean.

### Terminal tab: clickable location header, compact sub-tabs, flatter down/out styling (2026-08-06)

Four small follow-ups against the main Terminal tab (`app/calculator/terminal/page.tsx`,
`RackLaneGrid.tsx`), per explicit request:

- **Clickable terminal/city header, shared with the Planner.** Rather than
  building a second copy of the Location/Terminal picker for this tab (risking
  the same "two independently-drifting copies" class of bug this project has
  hit before -- see `CustomSelect.tsx`'s own header comment), `LocationModal`/
  `MyTerminalsModal` were hoisted out of `page.tsx` (Planner) into `ShellChrome`
  (`CalculatorLayoutClient.tsx`), the same place `EquipmentModal`/
  `ExpirationModal` already live as single shared instances. Everything those
  two modals needed that wasn't already shared (`locOpen`/`statePickerOpen`/
  `expandedTerminalId` open-state, city-star favorites +
  `stateOptions`/`selectedStateLabel`/`selectedStateName`/`cities`/
  `topCities`/`allCities`) moved into `CalculatorShellContext.tsx` too --
  `shell.location` was already the one shared `useLocation()` instance, so
  this was "finish the hoist," not a new architecture. The Terminal tab's new
  header (`{terminal name in white} {city, state in gray}`, just under the
  rack sub-tabs) is a plain button calling `shell.setTermOpen(true)` (or
  `shell.setLocOpen(true)` if no location is set yet, mirroring the Planner's
  own step logic) -- tapping it opens the literal same `MyTerminalsModal`
  instance the Planner's own "Select Terminal" card opens, so picking a
  different terminal from either tab updates both immediately (no separate
  sync mechanism needed, since both read/write the one `shell.location`).
  Non-interactive (plain text, no button) when viewing a driver's
  auto-inferred terminal in dispatch/admin context -- tapping it there would
  silently change the *viewer's* own location, not the driver's, which isn't
  what "same modal" should mean in that context. `TerminalCatalogModal`
  (confirmed dead code -- never opened anywhere in the current Planner flow,
  `catalogOpen` is set to `true` nowhere) was left exactly where it was,
  Planner-only, not worth resurrecting into the shared move.
- **Compact sub-tabs + active-rack dot.** `CenteredSubTabs.tsx` gained two
  opt-in props, `compact` and `showActiveDot` (both default `false`, so the
  Lead/Dispatch/Admin shelved-route consumers render unchanged) -- smaller
  flex-basis/font-size, plus a small dot rendered under the active tab's
  label instead of relying on color/weight alone. Terminal tab's rack picker
  passes both.
- **Lane-down: text color, not a solid fill.** `RackLaneGrid.tsx`'s lane
  number/letter cell no longer fills its whole background red when
  `lane.is_down` -- the cell background stays the normal
  `rgba(255,255,255,0.08)`, only the label text itself turns red.
- **Arm-down: a red horizontal line, not a circle-slash icon.** The old
  `NoSymbol` SVG (a red circle with a diagonal slash, one per fully-down arm)
  is gone. A fully-down arm (`isArmDown()` -- explicitly flagged, or every
  product on it out) now renders a single red horizontal line straight
  through its whole product stack instead. Untouched: a single out product
  on an otherwise-fine multi-product arm still just gets its own
  strikethrough in its own color, arm stays normal -- that per-product logic
  never changed.

**Live-verified** against the real Global South terminal: header renders
"Global South" (white) / "Fort Lauderdale, FL" (gray) under the rack
sub-tabs; tapping it opens the same My Terminals list the Planner's own
location card opens (confirmed by opening it from both tabs). Sub-tabs
render smaller with a white dot under North Rack. Toggled a real arm's
"ARM" (down) flag via the Lane Status modal and confirmed live: the red
horizontal line renders across that arm's full D2/DYED stack (screenshot-
confirmed), reverted immediately after. Lane 6's own down-state (pre-
existing test data) confirmed the number "6" renders in red text on the
unchanged gray cell background, not a red fill. `tsc --noEmit` clean
throughout the refactor. One batch of "defined multiple times" console
errors surfaced mid-pass in the dev tab -- confirmed via a fresh hard
reload (page rendered correctly, no `nextjs-portal` error dialog present
afterward) and a direct `grep` of the file (no duplicate declarations
exist on disk) that this was the dev server's own documented hot-reload
staleness, not a real regression.

### Continue Numbering From (cross-rack lane continuation) + terminal/rack tag (2026-08-06)

Two small additions to `LayoutView` (Lane/Arm Layout), per explicit
follow-up against a screenshot with the empty space next to the
Alphabetical/Reverse Order controls circled:

- **"{terminal} — {rack}" tag** above the Add/Remove Lanes control (e.g.
  "Global South — North Rack") so it's unambiguous which rack is being
  edited — `terminalName` is threaded down from `EditTerminalModal` (which
  already had it as a top-level prop, just never passed it further).
- **"Continue numbering from" dropdown**, listing every *other* rack at
  this same terminal (`siblingRacks`, computed in `EditTerminalModal` as
  `racks.filter(r => r.rack_id !== selectedRack.rack_id)` and passed down)
  — picking one immediately relabels every lane on *this* rack to a fresh
  numeric sequence continuing from the selected rack's current lane count
  (e.g. South Rack has 5 lanes → North Rack picking "South Rack" relabels
  its own lanes 6, 7, 8...). This replaces the old, fully-removed
  `computeLaneOffsets` auto-continuation from the 2026-08-04 explicit-labels
  rework (which silently chained every rack by creation order) with an
  **explicit, one-shot bulk action** — per the user's own reasoning, "some
  terminals may have three or more racks in different areas," so a blind
  auto-chain isn't always correct; the admin has to say which rack (if
  any) precedes this one. Same category as the existing Alphabetical/
  Reverse Order tools: not a persisted relationship (so it can't silently
  drift if the preceding rack's count changes later), offset is read fresh
  via a `count`-only query against `rack_lanes` at the moment it's applied,
  and the dropdown resets to "— None —" after firing rather than "sticking"
  on the picked rack. The whole control (and its column in the layout
  grid) only renders when the terminal actually has more than one rack.

**Live-verified**: opened North Rack's Lane/Arm Layout at the real "Global
South" terminal — tag correctly read "Global South — North Rack" and the
dropdown correctly listed only "South Rack" (its one sibling, not itself).
Confirmed South Rack's real lane count (5) via direct query first, then
selected it from the dropdown — North Rack's 6 lanes correctly relabeled
6,7,8,9,10,11 (verified via Postgres, not just the UI), dropdown reset to
"— None —" afterward, no console errors. Restored North Rack's labels
back to 1–6 immediately after (this session's own test artifact, not real
data) — left South Rack and North Rack's arm/product assignments
untouched throughout, including one arm's product state that turned out
to already differ from what an earlier pass in this same session had
left it at — traced that to the user's own hands-on testing between
turns, not anything of mine to "fix" back. `tsc --noEmit` clean.

**Follow-up fixes, 2026-08-06** — five more issues from a live screenshot of
the shipped dropdown:
- **White-on-white dropdown** — the native `<select>` was still subject to
  the same "open option list is rendered natively by the OS/browser and
  ignores dark theming" issue this codebase already has a shared fix for
  (`lib/ui/CustomSelect.tsx`, built during the earlier Terminal-tab pass
  specifically for this). Swapped the native `<select>` for `CustomSelect`
  — no new component needed, just wasn't used here originally.
- **Selection not sticking** — root cause: the dropdown's value was backed
  by an ephemeral `useState` that got reset to `""` after every
  `applyContinueFrom` call, so a correct relabel always visually "reset to
  None" even though the DB write succeeded. Replaced with a derived
  `matchingSiblingId` (`useMemo`, same "infer from live data" pattern
  `isAlphabetized` already uses elsewhere in this file) — fetches each
  sibling's own current lane count via a new `siblingInfo` effect, then
  checks whether this rack's current lowest label equals `siblingCount +
  1`. Self-correcting: reflects reality every render, can't drift out of
  sync with a manual edit the way stored "last picked" state could.
  Live-verified: North Rack (currently continuing from South Rack, labels
  6–11) reopened this control and the dropdown showed "South Rack"
  pre-selected, not reset to blank.
- **Circular reference prevention** — new `selectableSiblings` (`useMemo`)
  excludes any sibling whose own current lowest label already equals THIS
  rack's lane count + 1 (i.e. already continues from this rack) — picking
  it back would create a direct two-rack cycle. The whole "Continue from"
  control (not just the option) is hidden entirely when zero siblings
  remain selectable — live-verified: South Rack's own Lane/Arm Layout
  (whose only sibling, North Rack, already continues from it) now shows no
  "Continue from" control at all.
- **Label + responsive wrap** — "Continue numbering from" shortened to
  "Continue from" (fits one line). The controls row changed from a
  `1fr auto` CSS grid (which pushed the dropdown off-screen on narrow
  viewports since grid item widths don't reflow) to `display:flex,
  flexWrap:"wrap"`, with `minWidth:0` on the left button column (the same
  flex/grid `min-width:auto` overflow gotcha documented earlier this
  session for the Product List row, applied here preemptively) — on a
  narrow screen the dropdown now wraps to its own line below the lane
  controls instead of being clipped off the right edge. Live-verified at
  403px mobile width: dropdown renders fully on its own line, not clipped.

All five live-verified together in one pass against the real Global South
terminal (North/South Rack), `tsc --noEmit` clean, no new console errors
(one stale 400 present in the console buffer was confirmed unrelated —
present before this pass, consistent with this project's documented
"console never resets for the tab's lifetime" behavior).

**Lane cards now tap-anywhere-to-expand, 2026-08-06** — per explicit
follow-up: "make each card tap-able to open from anywhere in the card
(except the arm count cell of course)... Right now you have to tap the
tiny arrow." `LaneRow`'s outer container gained `role="button"`,
`tabIndex={0}`, and `onClick={onExpand}` (+ Enter/Space `onKeyDown` for
keyboard/a11y parity); the arm-count `<input>` gained
`onClick={(e) => e.stopPropagation()}` so tapping/focusing it to edit the
count no longer bubbles up and triggers the expand; the trailing chevron
lost its own `onClick`/button semantics (now a plain decorative `<span
aria-hidden>`) since the click naturally bubbles to the card's own
handler — kept as a visual affordance only, not a second click target.
Live-verified: clicking anywhere on a lane card's body (label, "Arms"
text, chevron, blank space) opens straight into "Lane N — Arm / Products";
clicking directly into the arm-count textbox only focuses/selects it
(confirmed via `document.activeElement`) without navigating away from the
Lane/Arm Layout list. `tsc --noEmit` clean.

### Cards tab: full look-and-edit parity for dispatch/admin (shipped 2026-08-04)

Per explicit user direction: "all the cards should look identical for every
role. the only difference is whose cards they belong to. that gets
determined on the dispatch tab by the driver selected." This directly
supersedes the original 2026-08-04 Dispatch-tab Cards decision
(`DriverCardsReadOnly.tsx`, a separate simplified status-only list) — that
component is now deleted. Scope confirmed explicitly before building (asked,
not guessed, given the sensitivity of the permission expansion): **all
three** Cards sub-tabs (Terminals, Badges, Credentials) get full edit
parity, not just Terminals, and dispatch/admin get real write access (not
just an identical-looking read-only view) — reversing the earlier
`FleetCredentialsModal` "status-only, not full record access" scope-down
for this specific in-context-editing flow (`FleetCredentialsModal.tsx`
itself is untouched, still status-only — this is a different, new editing
surface).

**Migrations applied** (live pg_policies queried before writing either, per
this repo's own rule):
- `20260815000000_dispatch_cards_write_parity.sql` — `my_terminals` had
  *zero* admin/dispatch access at all before this (confirmed live); added
  full SELECT/INSERT/UPDATE/DELETE. `terminal_access`/`user_terminal_cards`
  already had the admin/dispatch READ policy from the original Dispatch-tab
  migration; added the missing INSERT/UPDATE/DELETE. All ten new policies
  mirror the existing read policies' exact `EXISTS`-via-`user_companies`
  shape, scoped to admin+dispatch only (not lead — lead never reaches this
  contextual view, the Dispatch tab itself is admin/dispatch-only).
- `20260815010000_dispatch_credential_write_parity.sql` — a genuine
  surprise found while verifying live state first: `driver_licenses`/
  `driver_medical_cards`/`driver_twic_cards`/`driver_port_ids` **already**
  each had an admin-only `ALL` policy (`dl_admin` etc.) that isn't scoped to
  the row's own `user_id` at all — just checks the *querying* user is a
  company admin for that row's `company_id` — so any company admin already
  had full CRUD on every driver's credential record before this pass; only
  **dispatch** write was the actual gap. Added one purely-additive
  `xx_dispatch_write` policy per table, mirroring `xx_admin`'s exact shape
  for `role = 'dispatch'`.

  **Noted in passing, deliberately NOT fixed (pre-existing, out of scope)**:
  `xx_own` on all four credential tables is SELECT-only — there is no
  own-row INSERT/UPDATE/DELETE policy at all, meaning a non-admin driver's
  own Credentials-tab save should fail under RLS today unless they happen
  to be their solo company's sole admin (solo companies are always
  `role = 'admin'`). Flagged, not chased further this pass — same category
  of "found while verifying something else" gap this project has surfaced
  several times before.

**App code**:
- `app/calculator/cards/page.tsx` (Terminals): `isDispatchContext` now
  drives a second `useTerminals(driverId, ...)` hook instance (safe to
  always call per rules-of-hooks; a no-op whenever `driverId` is empty) plus
  a new local `useDriverCardData(userId)` hook mirroring
  `CalculatorShellContext.tsx`'s own `cardDataByTerminalId`/
  `setCardDataForTerminal_` shape but parametrized by an arbitrary target
  user instead of `effectiveUserId` — a second independent copy is correct
  here (not the desync risk hook-hoisting exists to avoid elsewhere),
  since the whole point is that dispatch/admin and the viewed driver never
  share this state. `TerminalCard`'s `onSelect` prop is now optional (hidden
  in dispatch context — "Select" sets the *viewer's own* current-terminal
  state and navigates to the Planner, which has no meaning when looking at
  someone else's cards), and a new `walletLabel` prop feeds the
  Deactivate/Remove confirm copy ("Remove this card from Kyle Tatro's
  wallet?" instead of "your wallet"). `DriverCardsReadOnly.tsx` deleted.
- `app/calculator/cards/badges/page.tsx` / `credentials/page.tsx`: simpler
  than Terminals since these tables already had explicit
  `.eq("user_id", ...)` filters — swapped `effectiveUserId` for a
  `targetUserId = isDispatchContext ? shell.selectedDriverId :
  effectiveUserId` throughout, and insert calls now use `shell.companyId`
  (already resolved for the viewer) instead of a separate per-page
  `user_settings` lookup. Both gained the same "Viewing {driverName}'s
  badges/credentials" header note as Terminals.

**A real, separate bug found and fixed while live-verifying this** (not
present before this pass — introduced by the new RLS, caught immediately
by testing rather than shipped): `useTerminals.ts`'s `loadMyTerminals()`
queried `my_terminals_with_status` with **no `.eq("user_id", ...)` filter
at all** — it had always silently relied on RLS alone to mean "only my own
rows," which was true back when `my_terminals`/`terminal_access` only had
owner-scoped SELECT policies. The moment admin/dispatch got read access to
*other* users' rows too, this unfiltered query started returning every
company member's starred terminals flattened into one array with no
`user_id` to distinguish them — for a driver (Kyle Tatro) with zero rows of
their own, this meant the viewing admin's *own* terminals rendered instead,
mislabeled under "Viewing Kyle Tatro's terminal cards," with the same
terminal_id appearing once per company member who'd starred it (surfaced
immediately as a very visible "Encountered two children with the same key"
React error, not a silent data leak). Root cause confirmed by direct
Postgres query (Kyle: 0 rows in both `my_terminals` and `terminal_access`)
before touching any code. Fixed with one line
(`.eq("user_id", effectiveUserId)`) — correct and necessary for both the
own-view and driver-scoped-view call sites, since the query was never
actually scoped by the application layer at all, only ever by RLS.

**Live-verified end-to-end, 2026-08-04**, against a real second company
member (Kyle Tatro, zero pre-existing terminal data — a clean case to prove
scoping, not muddied by pre-existing rows): selected Kyle on the Dispatch
tab, opened Cards → Terminals (showed the correct empty state after the fix,
not leaked data), added a real Chevron card with a card number via the
identical `TerminalCard` UI the driver would use, confirmed via a direct
Postgres query that the write landed on **Kyle's** `my_terminals`/
`terminal_access`/`user_terminal_cards` rows (not the admin's own), then
removed it through the same UI (confirm copy correctly read "Remove this
card from Kyle Tatro's wallet?") and confirmed the unstar landed correctly
while `terminal_access`/`user_terminal_cards` were preserved per the
confirm copy's own promise ("stays saved if you add it back later") — then
manually cleaned up those two leftover rows directly, since Kyle is a real
driver account, not throwaway demo data. Badges and Credentials sub-tabs
both confirmed rendering the correct "Viewing Kyle Tatro's
badges/credentials" empty states with no leaked data (these two were never
at risk of the `useTerminals.ts` class of bug — they already had explicit
`user_id` filters). Re-loaded the driver's own (non-dispatch) Cards view
afterward as a regression check — renders normally, "Select" button
present (correctly shown only for the own-view case), no duplicate-key
errors on this fresh load. `tsc --noEmit` clean throughout.

### Driver Training (Lead/Admin-in-lead-mode feature) — REMOVED 2026-08-31

**Removed entirely, per explicit direction** ("not worth it and kinda
adds to the clutter on the planner tab") — see "Performance pass #1"
later in this file for the removal itself and what stayed in the DB
unused. Everything below this line is a historical record of the
feature as it existed before removal — don't build against it.

- A "Driver Training" button on the Planner (lead/admin-acting-as-lead
  only) opens a driver-selection modal (exact modal design not yet done —
  open task) to pick a trainee.
- **Single-load model, decided 2026-08-03**: rather than reconciling two
  separate load records (or figuring out "whose plan wins" when both people
  are physically in the same truck), there's still only **one** real load —
  one plan, one equipment combo, submitted once, created under the
  **lead's** account (same as any load the lead would normally submit). A
  new `trainee_id` reference is added to the load, separate from the
  creator, purely so the load can be attributed to the trainee for
  reporting.
  - **Incentive points go to the lead** (the load's actual owner/creator) —
    this falls out naturally from the existing points-go-to-creator logic,
    no special-casing needed.
  - **Trainee's "loads completed toward carding" count** is just a query
    filtering on `trainee_id = me` — read-only, reporting only; the trainee
    never has their own competing `load_log` row for this same physical
    event.
- **"Loading with [name]" banner**: shown on the lead's planner today (post-
  trainee-selection). Decided: mirror the same banner on the trainee's own
  planner too ("Training with [lead name]"), scoped as **part of the same
  open experiment** below rather than solved separately — i.e., don't build
  dedicated synced state just for this label; whatever mechanism ends up
  handling the core "two devices, one physical load" problem should drive
  this banner too.
- **Explicitly unresolved, deliberately deferred to a real-world try-it-and-
  see**: if both the lead and the trainee have their own Planner open on
  their own phones during a training session, what actually happens? Does
  the trainee's device need to be a read-only mirror of the lead's in-
  progress plan, or does each device just independently plan and only the
  lead's submission counts (with the trainee's parallel session being pure
  UI, never actually written)? Not designed — explicit user call to try the
  simplest version first (lead's device is the only one that actually
  submits) and see what breaks in practice before building anything more
  elaborate.
- **Reports**: purely reporting-side, dialed in last, no new UI action
  beyond what's above.
  - Lead: report of training loads they've given, listing which trainees
    and when.
  - Driver: a report letting them view/track their own in-progress carding
    status per terminal (their own training loads + which terminals they're
    actively getting carded at) — a self-service tracking tool for the
    driver, not a new driver-facing "give training" action.
  - Both live in the existing Reports/NAV hub (`/calculator/reports`) as new
    report types, not a new destination. **Not built this pass** — spec
    itself says "dialed in last," left for a future pass.

**Shipped 2026-08-04**: `load_log.trainee_id` + narrow trainee-read RLS
policy (see Dispatch tab section above). `DriverTrainingModal.tsx` (new,
wraps the shared `DriverPicker.tsx`) opens from a "Driver Training" text
button on the Planner, visible for `canDriverTrain = role === "lead" ||
role === "admin" || isSuperAdmin` (updated same day — see "Tab bar fix"
above; originally gated on the now-removed `adminActingAsLead` toggle, now
admin/super-admin always have lead-level Driver Training capability on
their permanent Planner tab, no mode switch needed). Picking a trainee just
sets local
`traineeId`/`traineeName` state on the Planner page — no write happens until
the lead actually begins a load. `useLoadWorkflow.ts`'s `beginLoadToSupabase`
takes a new `trainingTraineeId` prop and, right after `setActiveLoadId`,
fires a plain (non-blocking, non-fatal) `UPDATE load_log SET trainee_id =
...` on the row it just created — no RPC change needed, `load_log_update_own`
already covers it. "Loading with {trainee}" renders next to the Driver
Training button once picked, matching the mockup's placement (below RELOAD,
above the gal/lbs summary).

**Trainee-side "Training with {lead}" banner**: built as the "try the
simplest version first" cut per the open question below — every driver's
own Planner (not just leads) polls (30s interval, not a live subscription)
`select user_id from load_log where trainee_id = effectiveUserId and status
= 'planned'` and, if found, resolves the lead's name via
`get_display_names_full` and shows the banner. This is *a* answer to the
"two devices, one physical load" question, not *the* answer — it only
proves whether a trainee tag exists, says nothing about keeping two
in-progress plans in sync, and was deliberately left that simple.

### Explicitly shelved
- The entire 2026-07-30 "Role-based tabs" Lead/Dispatch/Admin dedicated-tab
  work — `EquipmentScheduleChart.tsx`, `DriverAssignmentModal.tsx`, the
  Dashboard/Tasks/Ledger placeholder subtabs on all three role tabs. Not
  moved into the nav menu, not preserved anywhere — a deliberate scope
  pullback per explicit user direction ("we pumped the brakes... this was
  scope creep"). If any of that functionality (e.g., equipment schedule
  visibility, driver assignment) turns out to be wanted later, that's a
  fresh scoping conversation, not a resurrection of this code as-is.

### Open questions (Terminal Tier spec)
- The "two devices, one physical load" concurrency question for Driver
  Training — still genuinely unresolved (see the trainee-side banner note
  above); the polling banner only proves a trainee tag exists, doesn't
  solve concurrent planning on two devices.
- ~~Exact driver-selection UI...~~ — **resolved 2026-08-04.**
  `DriverPicker.tsx` (search + list, shared by the Dispatch tab and Driver
  Training) is the answer — simple by design, no fancier UX was specified.
- ~~Live verification needed... region/local-area...~~ — **resolved
  2026-08-04.** Confirmed live: `profiles.region` and `profiles.local_area`
  both already exist (also `division`, `employee_number`, `hire_date` —
  `get_display_names_full` already returns all of them). No `store` field
  exists anywhere; the Dispatch tab's "Store {division}" label is a
  best-effort guess at what the mockup's "Store 495" maps to, **not
  confirmed** — worth double-checking if it matters. The existing "inactive"
  terminal-access state was **not** separately re-verified this pass (the
  Dispatch tab's card list derives "Not Carded" from the absence of a
  `terminal_access`/`user_terminal_cards` row entirely, not from reading an
  explicit inactive flag — functionally equivalent for display purposes,
  but the underlying enum question from the original spec is still
  technically open).

## Architecture reality (learned the hard way — READ THIS FIRST)

The local `supabase/migrations/` folder is **not** a reliable source of truth. It
has historically lagged badly behind the live database — real schema work
(tables, RLS, functions) has happened directly in the Supabase SQL editor without
always being captured back into a checked-in migration. Concretely: `user_settings`,
`super_admins`, `terminal_temp_bias`, `company_invites`, `pending_invites`,
`driver_licenses`, `attachments`, `equipment_attachments`, `truck_other_permits`,
and ~20 functions (including the entire invite-code system) all exist live but
were absent from the migrations folder as of the last full audit (July 2026).
Verified live 2026-07-17: `medical_cards`, `port_ids`, and `twic_cards` do
**not** exist — only `driver_licenses` does. A prior version of this doc listed
all four together; don't assume the other three exist without checking again.

**Before designing or writing any schema change, verify against the live
database — don't trust the migrations folder alone.** Ask the user to run
queries against `information_schema.columns`, `pg_policies`, `pg_proc` /
`pg_get_functiondef`, and `terminal_temp_bias` (or check with Supabase MCP/CLI if
available) rather than assuming the repo's migration file is current.

**Server-side auth checks — fixed 2026-08-13.** `lib/supabase/client.ts`
previously persisted sessions to `window.localStorage` only, via plain
`createClient` from `@supabase/supabase-js` — not `@supabase/ssr`'s
cookie-syncing `createBrowserClient` — so `lib/authz.ts`'s server-side
helpers (`getSessionUserOrRedirect`, `requireSuperAdmin`,
`requireMembershipOrJoin`) could never see a real session regardless of
whether the browser was actually logged in (confirmed live 2026-08-07, see
"Website / landing page rework" → "Shipped 2026-08-07" below). This is now
fixed: `lib/supabase/client.ts`'s singleton is `createBrowserClient`, and
`lib/supabase/browser.ts` (a second, previously-independent
`createClient()` instance used by `JoinClient.tsx`/`ActiveCompanySelect.tsx`
— would otherwise have split-brained against the new cookie-backed
singleton) now just re-exports the same singleton instead of creating its
own.

Three things had to be handled together for this to actually work, not
just compile:
- **Existing localStorage sessions don't carry over automatically** —
  `createBrowserClient` reads/writes cookies, not the old
  `sb-<ref>-auth-token` localStorage key, so shipping this as a bare swap
  would have silently logged out every currently-signed-in user (dev and
  production) on their next load. `lib/supabase/client.ts` now runs a
  one-time client-side migration on load: if a legacy localStorage session
  exists and no cookie session does, it's lifted in via
  `supabase.auth.setSession()` and the old key is cleared. Live-verified:
  confirmed the legacy key disappears and a real `sb-<ref>-auth-token`
  *cookie* appears after one page load with a pre-existing localStorage
  session.
- **`createBrowserClient` hardcodes `flowType: "pkce"`**, not overridable
  via options — this changes what `/login`'s `signInWithOtp()` magic link
  actually sends back: a `?code=` query param instead of a `#access_token=`
  hash fragment. `app/auth/callback/CallbackClient.tsx` already had `code`-
  handling code (redirecting to `/auth/confirm?code=...`), but
  `/auth/confirm` only ever read `token_hash`, never `code` — so that
  branch was dead/broken before this pass too, just never exercised since
  the client wasn't PKCE before. Fixed by calling
  `supabase.auth.exchangeCodeForSession(code)` directly in
  `CallbackClient.tsx` instead of redirecting. The *other* login flow
  (`/auth/confirm`'s own `token_hash`/`verifyOtp()` path, used by admin
  invites) doesn't depend on `flowType` at all and was unaffected — live-
  verified end-to-end via a real `admin/generate_link` magic-link token
  (session established, `/admin` and `/planner` both loaded real company
  data afterward).
- **`app/planner/layout.tsx` now actually has the server-side gate** this
  section used to warn against adding — `getSessionUserOrRedirect()` runs
  before `CalculatorLayoutClient` renders. Live-verified both directions:
  an authenticated session gets real Planner content directly (no
  `/login` flash); a session with cookies + localStorage fully cleared
  gets server-redirected to `/login` before any client JS runs.
  `CalculatorShellContext.tsx`'s own client-side
  `supabase.auth.getUser()` check is unchanged and still runs too (catches
  a session that expires mid-visit) — this is a first line of defense, not
  a replacement.

`requireSuperAdmin`/`requireMembershipOrJoin` are still not wired into any
route — only `getSessionUserOrRedirect` (via the Planner gate above) has a
real caller today. They're no longer *dead* code (the session they'd read
is real now), just not yet adopted anywhere else.

**Real-world fallout, fixed same day**: the very first genuine re-login
after this shipped hit a "link expired" error on a legitimate, unused
magic link. Root cause: `createBrowserClient` hardcodes `flowType: "pkce"`
(confirmed via the SDK source, not overridable through its public options),
and `/login`'s `signInWithOtp()` was running on that same shared client —
so the emailed link carried `?code=...`, which only completes
(`exchangeCodeForSession`) if the *same browser* that requested the link
still has the `code_verifier` cookie. Opening the link from a different
device, a different browser, or a mail app's in-app browser breaks that,
and reads as a generic "expired/already used" error even though the link
itself is fine — a well-known PKCE-and-email tradeoff, not a bug in the
exchange logic itself.

Fixed in `app/login/page.tsx`: `signInWithOtp` now runs on a dedicated,
throwaway `createClient` instance configured `flowType: "implicit",
persistSession: false` instead of the shared singleton — this client only
ever fires that one request, never reads/holds a session. The resulting
magic link now carries session tokens directly in the URL fragment
(`#access_token=...`) instead of a `?code=`, which needs no stored secret
to complete on the clicking end. `CallbackClient.tsx` needed no changes:
its existing `else` branch (`getSession()`, for whenever no `?code=` is
present) already handles this, and `_initialize()`'s hash-vs-code
detection (confirmed via the `@supabase/auth-js` source) is independent of
the *client's own* configured `flowType` — it reads whatever's actually in
the URL. Live-verified: submitted the login form fresh and inspected the
real outgoing `/auth/v1/otp` request body — `code_challenge` and
`code_challenge_method` are both `null`, confirming the implicit client is
genuinely in effect, not just configured.

### Stale-column audit — 2026-08-13

After the `buffer_lbs` bug (a dead `equipment_combos` column reference that
silently 400'd `EquipmentModal.tsx`'s entire fallback-hydration query, not
just its own dead "Buffer" display line — fixed same day), ran a full
repo-wide audit for the same failure class: every `.from(table).select(...)`
and every `.insert/.update/.upsert({...})` call, cross-checked against the
live schema (fetched via PostgREST's own OpenAPI introspection at
`/rest/v1/`, not the migrations folder — consistent with "Architecture
reality" above). The checker is relation-aware (recurses into embedded
`alias:table(cols)` joins rather than flagging the join itself as a bad
column) and skips anything containing a spread (`...obj`) rather than
guess. Validated against synthetic known-bad cases before trusting a clean
result. **Zero further findings** — `buffer_lbs` was the only stale
reference in the codebase, both passes (350 `.from()` calls / 201 read
queries, plus every write call) came back clean otherwise.

## Key existing infrastructure (already built, don't rebuild)

- `user_companies (user_id, company_id, role, created_at)` — join table, RLS
  blocks direct client inserts (`user_companies_no_direct_insert`); membership
  changes go through `SECURITY DEFINER` functions only.
- `companies (company_id, company_name, created_at, is_solo, owner_user_id)` —
  the last two columns added by the solo-tier migration (see below).
- `user_settings (user_id, active_company_id, updated_at)` — resolves which
  company's data a user sees. `get_active_company_id()` falls back to the
  user's oldest `user_companies` membership if `active_company_id` is unset.
- Full invite-code system already exists and works: `company_invites` table
  (code, expires_at, max_uses, uses_count, is_active, role),
  `generate_invite_code()`, `redeem_invite(p_code)`. **Not yet wired to any
  client UI** — `/join` (`JoinClient.tsx`) and `redeem_invite` are unused by any
  current call site. This is the natural foundation for the deferred
  solo→fleet join-via-code flow — build the UI against what's already there,
  don't design a new backend for it.
- `trucks` / `trailers` — already have `vin_number` (nullable text). RLS grants
  full INSERT/UPDATE/DELETE to any member of the row's `company_id` via
  `active_company_id` — **not role-gated at the RLS level**. Role gating for
  equipment happens only in `app/admin/page.tsx` UI (`role === 'admin' || 'lead'`
  gates entry to that page), not in `/api/admin/setup` (that route handles
  primary-equipment assignment, terminal cards/access, combo claims — not core
  equipment CRUD).
- `is_company_admin()` (DB function) already treats `'owner'` and `'admin'` as
  equivalent — but this is **not used** by app-code role checks, which all
  hardcode `role === "admin" || role === "lead"` inline. Confirmed spots as of
  this audit: `app/admin/page.tsx:1065`, `app/api/admin/setup/route.ts:59`,
  `app/api/admin/invite/route.ts:38`, `app/calculator/modals/SourcingModal.tsx:61`,
  `lib/ui/NavMenu.tsx:30,148,171`. **Decision made:** solo users get
  `role = 'admin'` (not a new `'owner'` role) specifically to avoid having to
  audit/update all of these. `companies.is_solo` is what distinguishes a solo
  company from a real fleet — role alone was never the right signal for that.
- Two separate signup/confirm paths: `/auth/callback` (organic magic-link
  self-signup from `/login`) and `/auth/confirm` (admin-invite emails and other
  OTP types). Invited users already get their `user_companies` row created
  server-side by `invite_user_to_company` *before* they click the email link —
  so provisioning logic only needs to be a no-op-if-already-a-member check, safe
  to call unconditionally from both paths.
- `effectiveUserId = setupSession?.targetUserId ?? authUserId` — existing pattern
  used throughout for admin impersonation. Not yet re-verified against the
  solo-tier changes; worth a pass if impersonation bugs show up for solo users.

## Fuel temp prediction system (architecture)

- `lib/fuelTempPredictor.ts` — physics-based prediction (first-order lag + solar
  gain), corrected by a per-terminal/hour-bucket/month bias.
- Bias is a genuine Welford's-algorithm running mean/variance, stored in
  `terminal_temp_bias (terminal_id, hour_of_day, month_of_year, sample_count,
  mean_error, m2, updated_at)`, updated via the `update_terminal_temp_bias(...)`
  RPC (SECURITY DEFINER, correctly implemented — confirmed working with live
  data showing real accumulation).
- Write path: `app/calculator/hooks/useLoadWorkflow.ts`, after `complete_load`.
- Read path: `app/api/fuel-temp/route.ts`.
- **"Confidence" (high/medium/low) is purely weather-based** (cloud cover +
  wind, via `confidenceFromCloudAndWind`) — it has no relationship to
  `sample_count` / bias maturity. This is intentional (confirmed with user) —
  don't conflate the two concepts again.
- `complete_load` has two overloads in the schema: the 4-arg one
  (`p_load_id, p_completed_at, p_lines, p_product_updates`) is **dead code** —
  writes to `products.last_api` globally (wrong table for the per-terminal
  design), never called by the client (`lib/supabase/load.ts` only calls the
  single-arg `payload jsonb` version). Safe to drop.

## Punch list status

### ✅ Done — deployed or ready to deploy
1. **Confidence color bug** — `ProductTempModal.tsx`: predicted temp number now
   colors by `confidence`, not by `isAccepted`/applied-state. Single shared
   `CONFIDENCE_COLOR` map with the dot/label so they can't disagree again.
2. **Bias correction gate removed** — `lib/fuelTempPredictor.ts`: correction
   used to be hard-zero below 3 samples (`biasSamples >= 3`), now ramps
   continuously from sample 1 (`Math.tanh(biasSamples / 4)`).
3. **Bias bucketing widened** — was exact UTC hour (0-23), fragmenting samples
   too thinly; now a 3-hour window (`Math.floor(hour / 3) * 3`), changed on
   both the write side (`useLoadWorkflow.ts`) and read side (`fuel-temp/route.ts`).
   Migration `20260716000000_consolidate_terminal_temp_bias_buckets.sql`
   folds pre-existing exact-hour data into the new buckets via correct
   parallel-variance combine (not discarded).
4. **Solo-company provisioning** — migration
   `20260717000000_solo_company_provisioning.sql` adds `companies.is_solo` /
   `companies.owner_user_id` (unique, nullable — enforces 1 solo company/user)
   and `provision_solo_company()` (idempotent SECURITY DEFINER function, role
   `'admin'`, auto-generated hidden company name). Hooked into both
   `CallbackClient.tsx` and `app/auth/confirm/page.tsx`, right before each
   redirect into the app.

**Verify before considering this fully closed:** a genuinely new signup lands in
the calculator with an empty, writable equipment list, no `/join` redirect, no
errors. (`requireMembershipOrJoin()` in `lib/authz.ts` is defined but currently
called from nowhere in the app — confirmed dead code, not a redirect risk today,
but don't assume that stays true if someone wires it in later.)

### 🔜 Not started — full detail needs to be re-established with the user
5. **VIN keying / future dedup** — `vin_number` already exists on trucks &
   trailers (nullable text). Normalization (uppercase/trim) and indexing not
   yet done. Merge/reconciliation logic explicitly deferred.
6. ~~**Expiration modal — group by city.** Currently a flat list with the
   selected city sorted to top, not visually grouped.~~ — **stale, checked
   2026-08-06, no longer applicable.** Read the current code
   (`modals/ExpirationModal.tsx`'s Terminal Cards section,
   `useTerminalFilters.ts`'s `catalogTerminalsInCity`, and the Reports hub's
   `buildTerminalCardsReport.ts`) before touching anything, and all three
   already scope to a single city — `catalogTerminalsInCity` filters by
   `selectedCity`/`selectedState`, and `buildTerminalCardsReportBody`'s own
   header comment says "for a single city." Live-confirmed in the Browser
   pane: the Expirations modal already renders one clearly-labeled section
   ("TERMINAL CARDS — In Fort Lauderdale, FL") with every listed terminal
   actually in that city — no flat cross-city list exists to group. This
   note describes an architecture that predates the Cards-tab city-grouping
   rework (`app/calculator/cards/page.tsx`, item #68 in the punch list
   above) and was never updated after that shipped. Left as a struck-through
   record rather than deleted, so a future pass doesn't waste time
   rediscovering the same thing.
7. ~~**Presets rework.**~~ — **shipped 2026-08-06, tap behavior reversed
   2026-08-04 (following session).** Scope changed from the original spec
   during a live clarifying pass with the user (see #8 below too — both
   items landed together, not sequenced, since the "equipment settings"
   destination turned out to already exist rather than needing a new
   gear-icon modal):
   - ~~Tap a **filled** preset slot now opens an action sheet...~~ —
     **reversed.** After using it in real full-app-impersonation testing,
     explicit feedback: "this window still pops up when we change presets,
     can we get rid of it?" A plain tap on a filled slot now **loads it
     immediately** again (`PresetDial.tsx`'s `onLoad` prop, calling
     `planSlots.loadFromSlot` directly, same as before this rework
     originally shipped) — no confirmation popup for the common
     "switch between presets" gesture. `PresetActionSheet.tsx` (Load/Edit/
     Clear) is **not removed** — it moved to **long-press** on a filled
     slot instead (`onOpenActions` prop), so Edit/Clear are still reachable,
     just out of the way of a plain tap. Tapping an **empty** slot is
     unchanged, still saves straight through (nothing to protect either
     way). Long-press on an empty slot still saves too (unchanged).
   - Presets (slots 1-5, the driver-facing A-E letters) are now **terminal-
     independent** — `usePlanSlots.ts`'s `planStoreKey` gives them a
     user-only key (no terminal component) instead of the old per-terminal
     one; server-side, `serverFetchSlots`/`serverUpsertSlot`/`serverDeleteSlot`
     write/read a constant `UNIVERSAL_SCOPE` sentinel for `terminal_id`/
     `combo_id` on those slots instead of the real ones. **No DB migration
     needed** — `user_plan_slots.terminal_id`/`combo_id` are `NOT NULL text`
     and part of the unique key, so a fixed non-null sentinel dedupes
     correctly (unlike an actual `NULL`, which Postgres never treats as
     equal to itself for uniqueness) — confirmed via the migration file
     directly before assuming this was safe. Slot 0 (the autosave/last-load
     draft, not a driver-facing "preset") is untouched, still keyed to the
     real terminal/combo exactly as before.
   - Presets now store **only the product selection per compartment** —
     `buildSnapshot` gained a `stripFillLevel` option (used for slots 1-5,
     not slot 0) that drops `capOverride` from each compartment before
     saving. `cgSlider` is dropped from every snapshot, all slots included
     — treated exactly like `tempF`'s existing "never restored" precedent
     (`PlanSnapshot.cgSlider` is now optional, kept only so old stored
     snapshots don't fail the type). Per explicit user clarification: the
     driver still adjusts headspace (the drag handle) and CG live per load
     exactly as today, unconstrained by any role — presets/CG were never
     meant to be role-gated, only the **cap itself** is (see #8).
   - **New, not in the original spec** — cross-terminal product-availability
     check: loading a preset that references a product not sold at the
     *current* terminal no longer silently mis-renders. A live derived value
     (`unavailableComps` in `page.tsx`, comparing `compPlan` against
     `terminalProducts`) drives three things: (a) `PlannerControls.tsx`
     gives an affected compartment's bar a red diagonal-stripe fill + "N/A"
     code instead of the generic teal fallback; (b) `CompartmentModal.tsx`
     shows a "⚠ Product Not Available at this terminal — choose a
     replacement below" banner when opened for such a comp, and `page.tsx`
     auto-opens it for the first unresolved comp right after a preset load
     (advancing to the next one once that specific comp is actually fixed,
     not just dismissed — a dismiss stops the auto-advance rather than
     re-trapping the driver); (c) the LOAD button's `onClick` (not its
     `disabled` attribute — deliberately, so tapping it while blocked still
     produces feedback instead of just doing nothing) shows "Cannot Load,
     all planned products are not available at {terminal}" and refuses to
     call `beginLoadToSupabase`. Live-verified end-to-end including the
     partial-mismatch case (one comp resolved, one still unavailable) —
     worth knowing if all comps are unavailable, the *pre-existing*
     `planRows.length === 0` gate (a comp with no resolvable density data
     was already excluded from weight calc) disables the button first via
     the HTML `disabled` attribute, so the new message only fires in mixed
     scenarios; that's fine, the load genuinely can't proceed either way.

   **Real data-loss bug found and fixed 2026-08-04**, while live-testing
   this session's other work in a real logged-in session for the first
   time (everything above had only ever been typechecked/guest-tested).
   The account's actual presets came back wrong: Preset A showed "Load
   Empty" and Presets D/E showed as completely unset. Root cause: the
   terminal-independent migration above was never fully carried out for
   this account — a `terminal_id = '__universal__'` row existed for slot 1
   but with an accidentally-empty `compPlan` (likely a leftover test save
   from whoever built the rework), and slots 4/5 had no universal-scope row
   at all, only old per-terminal rows going back months. Fixed via a
   one-off direct DB backfill (not a migration file — this was account
   data repair, not a schema change) restoring each slot's most recent
   real per-terminal `compPlan`. **This bug is specific to whichever
   accounts were mid-migration when the rework shipped** — not something
   that would recur for a fresh preset save, and not audited across every
   account, just this one during live testing.

   **CG reversed back into presets, 2026-08-04, per explicit user
   direction** — "the CG needs to save with the product selection... when
   the driver taps a preset it should snap to the last CG that was saved
   with that specific preset." This directly reverses the bullet above
   ("`cgSlider` is dropped from every snapshot... presets/CG were never
   meant to be role-gated") — that original call is superseded, not
   historical color anymore. `PlanSnapshot.cgSlider` is now written on
   every save (`buildSnapshot`) and restored on load, but **only for named
   presets (slots 1-5)**, not slot 0's autosave/last-load draft, which
   keeps its original "CG is live, never restored" behavior — `applySnapshot`
   takes a new `{ restoreCg? }` option, `loadFromSlot` passes `restoreCg:
   slot !== 0`, every other `applySnapshot` call site (last-load-from-log,
   slot-0-on-terminal-change) is untouched. **A second real bug caught
   while wiring this up**: the server-pull effect's local-cache
   normalization step built its own plain object and silently dropped
   `cgSlider` even when the server payload had it — so a correct DB row
   would still silently fail to restore CG once cached locally. Fixed by
   including `cgSlider` in that normalization. Live-verified end-to-end in
   the real session: tapping Preset A now shows "PRESET A / Load ULSD
   Diesel #2," and the CG slider visibly snaps to 0.64 (the value actually
   saved with that preset) on load — confirmed via both the DOM input value
   and the underlying `localStorage`/DB state, not just the UI rendering.
8. ~~**Equipment settings (new UI).**~~ — **shipped 2026-08-06, but not as a
   new gear-icon modal.** Confirmed with the user before building: the gear
   icon in the header is the user's own profile settings, unrelated: cap/
   volume/unit-number editing belongs in the **existing** equipment modal
   (`lib/ui/driver/EquipmentDetails.tsx`'s `TruckModal`/`TrailerModal`,
   already shared by both `/admin`'s full console and the Planner's
   fleet-mode `EquipmentModal.tsx`), not a new destination.
   - `CompartmentEditor` gained a second column, "Cap — overflow prevention"
     (`cap_gallons`), alongside the existing "Total Volume" (`max_gallons`,
     informational only) — previously this field didn't exist in the
     equipment modal at all.
   - **A real, separate bug found and fixed while wiring this up**:
     `TrailerModal.save()` deletes and reinserts every `trailer_compartments`
     row on every save, but the reinsert only ever wrote `comp_number`/
     `max_gallons`/`position` — `cap_gallons` was never included, so it
     silently reverted to `null` (falling back to `max_gallons`) on *every*
     trailer edit, not just ones that touched compartments. This predates
     this session's changes entirely and wasn't something anyone could have
     noticed from the UI (BinderModal.tsx's own separate cap editor, see
     below, was the only place a value ever showed up again — it does a
     direct `.update()`, not delete+reinsert, so it self-healed the exact
     symptom that would have made this bug visible). Fixed by writing
     `cap_gallons: c.cap_gallons ?? null` on the reinsert. Live-verified:
     edited a trailer's identity fields with cap 4300/1250/3800 already set,
     saved, reopened — all three caps intact.
   - **Role-gated to admin/dispatch/lead**, per explicit user instruction —
     "we don't want them going over the comp cap," with the driver still
     free to use headspace/CG live per load, just never past whatever cap a
     higher role set. `myRole` is threaded from `CalculatorShellContext`'s
     existing `shell.role` through `EquipmentModal.tsx` → its internal
     `EquipmentDetailsModal` → `AdminTruckModal`/`AdminTrailerModal` (this
     path never received it before — only `/admin`'s own page already
     threaded it, for the pre-existing admin-only `SensitiveInfoSection`).
     Gating covers cap/volume *and* Unit # (also named explicitly by the
     user) for **existing** equipment only — a brand-new truck/trailer
     still needs a name to be created at all, and creation itself isn't
     role-gated at the RLS level (a separate, already-documented gap, out of
     scope here) — so `canEditRestricted = isNew || myRole === "admin" ||
     "dispatch" || "lead"`. Validated server-round-trip live: a cap value
     exceeding the compartment's total volume is rejected with "Cap can't
     exceed a compartment's total volume," matching the explicit ask that
     "higher roles also can't set a cap higher than the total volume."
   - **BinderModal.tsx's own separate, ungated cap editor was removed**
     (`CompartmentRowItem` in `app/calculator/modals/BinderModal.tsx`) —
     consolidated into the one role-gated location above rather than
     leaving two editable, un-synced copies (one of which had no gate at
     all). Now read-only there, still showing the current value for anyone
     reviewing the Binder.
   - `SoloEquipmentModal.tsx` (the lightweight solo-tier equipment picker)
     was deliberately left untouched — confirmed via code read that it has
     no "edit existing equipment" flow at all (tap = select for pairing,
     long-press = remove, "+" = add new only), so there's nothing there to
     gate; solo companies are always `role = 'admin'` anyway per the
     existing architecture, so this was never reachable for them regardless.
9. **Terminal product setup — admin-curated, not driver-selected.**
   **Role gate shipped 2026-08-06**; the rest of this item is still
   unbuilt (deliberately, per explicit user scoping — see below).

   `ManageTerminalProductsModal.tsx` (reachable from any compartment's
   product picker via "Manage products at this terminal") toggles a
   terminal's active product list — an action that affects **every driver**
   who loads at that terminal, company-wide. It had **no role gate at all**
   before this fix — confirmed via code read, not assumption. Fixed by
   threading `myRole` from `page.tsx`'s existing `shell.role` through
   `CompartmentModal.tsx` (new `myRole` prop) into a `canManageProducts =
   myRole === "admin" || "dispatch" || "lead"` check that hides both the
   "Manage products at this terminal" entry-point button and the modal
   itself for anyone else — matches the equipment-cap gating pattern from
   earlier this session. UI-level gate only, consistent with this
   session's established precedent (equipment CRUD itself is also not
   RLS-gated, a separately-flagged, deferred gap — see "Open questions"
   below) — no `terminal_products` RLS change made here.

   **Explicitly deferred, scoped down from this pass on purpose** (asked,
   not guessed): the base-list curation UI, the driver-facing "terminal not
   yet configured" fallback + request action, a queryable `terminal_requests`
   table, and an admin bulk reset/reselect flow are all still exactly as
   unbuilt as before. Mid-Grade/Plus gasoline was confirmed to get its own
   slot in the eventual base list (not deferred as exotic) — recorded here
   for whenever that UI actually gets built, not implemented yet.
   - Master product list stays fully **granular** — this is a hard constraint,
     not a preference. Product selection feeds the API/temp correction
     calculation directly (confirmed with user); merging e.g. B5 and Diesel
     into one UI entry would silently corrupt the pooled bias data the whole
     app exists to produce. Rack-injected variance (dye, lubricity, cold-flow,
     cetane, corrosion inhibitors) is safe to treat as the same product
     identity; volumetric blends (bio % for diesel, ethanol % for gasoline)
     are NOT — those are real API/density-relevant differences and must stay
     distinct.
   - Candidate bare-necessity base list (non-exotic): Diesel (ULSD, any
     dye/additive), Biodiesel Blend (B20), Regular Unleaded (E10 baseline),
     Mid-Grade/Plus (rack-blended from Regular+Premium, borderline — confirm
     whether it earns its own slot), Premium Unleaded. B99/B100 and other
     exotics deliberately deferred, not deleted — full granular list still
     needed underneath.
   - Repurpose the existing admin product-setup screen as the user's own
     terminal-onboarding tool (self-curated by the user via phone calls to
     terminals — not crowd-sourced, not driver-selected).
   - New driver-facing flow: terminal not yet configured → show
     "not yet configured" notice + full fallback product list (never block
     usage) + "request this terminal be added" action. Once configured, the
     fallback list disappears for everyone at that terminal.
   - Admin side needs a fast reset/reselect flow (not manual deselect one by
     one) since this becomes the primary onboarding workflow, prioritized by
     driver demand.
   - Terminal requests need to be a queryable/sortable table
     (`terminal_requests`-style), not just a notification stream, so demand
     can actually drive prioritization.
   - Presets breaking gracefully when a product is removed from a terminal
     (driver just resets the preset — acceptable, but shouldn't crash/silently
     fail).

## Open questions / decisions still needed
- ~~Mid-Grade gasoline: own slot in the base list, or deferred as exotic?~~ —
  **resolved 2026-08-06: own slot.** Recorded in item 9 above for whenever
  the base-list curation UI actually gets built (not implemented yet).
- ~~Solo→fleet join flow~~ — **resolved + shipped 2026-08-06.** Scope
  collapsed significantly from the original framing: joining a fleet via
  invite code **abandons** the solo company entirely (no equipment
  migration/merge) rather than reconciling it, per explicit product
  decision — company selection is via invite *code*, not name, so the
  "which Gemini Trucking" disambiguation concern that prompted this
  question doesn't actually apply (the code encodes `company_id` directly,
  no matching step exists). This means the VIN-matching/reconciliation/
  admin-review-screen machinery originally envisioned is now **unnecessary
  and not built** — there's nothing to reconcile.

  `app/calculator/components/JoinFleetView.tsx` (new) — invite-code entry
  form, wired into `SettingsModal.tsx`'s Account section as a new "Join a
  Fleet" row, shown only when the user's current active company has
  `is_solo = true` (fetched fresh on modal open, not cached). Calls
  `redeem_invite(p_code)` then, critically, **also** calls
  `set_active_company(p_company_id)` — confirmed via live
  `pg_get_functiondef` that `redeem_invite` only sets `active_company_id`
  when it was previously **null** (`coalesce(existing, new)`), so a solo
  user (who already has one) would join the fleet's `user_companies` table
  but silently keep looking at their old solo company without this
  explicit follow-up call. On success, hard-navigates to `/calculator`
  (`window.location.href`) rather than trying to hot-swap
  `CalculatorShellContext`'s state, so every piece of shell state
  (role/companyId/equipment) refetches clean against the newly active
  company.

  Old solo company + its equipment are left completely untouched (not
  deleted, not flagged) — same "abandon, don't reconcile" decision. This
  means solo companies pile up unbounded over time as users leave them
  behind; tracked in "Pre-launch cleanup" below, not urgent enough to
  block this.

  **Live-verified 2026-08-06** (partial — see gap below): typecheck clean.
  The `isSolo` gate itself works exactly as coded — confirmed via a
  temporary debug log against the real Supabase call (removed after
  confirming, not left in the shipped file) that the shared demo/QA
  company (`1391e05e-...`) genuinely has `is_solo = true` live, which is
  why "Join a Fleet" rendered for it. This was a surprising result at
  first — this is the same company with 2 real members, Fleet Cards,
  Incentives, and Payroll Report all live-verified earlier this session —
  but it's a real, pre-existing data artifact, not a bug in this gate:
  there's no path today that flips `is_solo` to `false`, and this
  company's second member (`Test Testerson`) was added directly to
  `user_companies` mid-session for RLS testing, never through any
  "convert solo to fleet" flow. So a company can be `is_solo = true` and
  still have multiple real members and full fleet features enabled — the
  flag only ever reflects *how a company was created*, not its current
  member count. Worth knowing if `is_solo` is ever used elsewhere as a
  proxy for "single-member company" — it isn't one.

  With that confirmed, opened the actual `JoinFleetView` UI live (copy
  renders correctly) and submitted a bogus code (`ZZZZ9999`) — got back
  "Invite not found" rendered in the error banner, proving the full round
  trip end-to-end: real Supabase auth session, real `redeem_invite` RPC
  call, real Postgres exception, correctly caught and displayed by the
  component's `catch` block.

  **Not exercised**: an actual successful redeem (`set_active_company`
  follow-up + real fleet membership). Doing that against this session's
  only available test company would have meant redeeming a real invite
  code and switching the shared demo/QA account's `active_company_id` away
  from the persistent company this entire session's test data (Fleet
  Cards, Incentives, Payroll Report artifacts) lives in — a disruption to
  the established QA environment, not worth the risk for what's otherwise
  a single, well-understood `coalesce`-driven code path already confirmed
  correct via direct `pg_get_functiondef` reads earlier. The negative case
  (row hidden when `is_solo = false`) is the untested `else` branch of the
  exact same boolean gate just proven live — not separately verified, but
  low-risk by symmetry. If a disposable solo company + a second disposable
  fleet company with a real invite code are ever available, worth a real
  end-to-end redeem to close this out fully.
- ~~Post-join permission split~~ — **shipped 2026-08-07.** Mechanism decided
  (asked, not guessed): column-level RLS restriction via trigger, not the
  `equipment_activity` append-only log table originally floated — the
  simpler option, since `trucks`/`trailers`' existing `status_code`/
  `status_location`/`status_lat`/`status_lon`/`status_notes`/
  `status_updated_at` columns already serve as "current status," no new
  table needed.

  **Verified live before writing anything** (this repo's own "don't trust
  the migrations folder" rule, twice over here):
  - `pg_policies` query confirmed `trucks_insert_active_company`/
    `trailers_insert_active_company` (INSERT) and
    `trucks_delete_active_company`/`trailers_delete_active_company`
    (DELETE) exist live with **no role check at all** — just
    `company_id = get_active_company_id()`, exactly matching what
    "Key existing infrastructure" already said. `trucks_update_active_company`/
    `trailers_update_active_company` (UPDATE) is the same shape.
  - `pg_get_functiondef` on `delete_truck`/`delete_trailer` (also
    live-only, no migration file) showed they're `SECURITY DEFINER` RPCs
    that **already** enforce `role = 'admin'` internally — this is the
    real, already-working enforcement path (`EquipmentDetails.tsx` only
    ever calls these RPCs, never a raw `.delete()`). The bare table
    DELETE policy being wide-open was still a real gap for anyone
    bypassing the RPC via the client SDK directly, though.
  - No RPC exists for INSERT at all — `TruckModal`/`TrailerModal`'s
    `save()` call `.from("trucks"/"trailers").insert(...)` directly. This
    was the one genuinely ungated write path.

  `supabase/migrations/20260807000000_equipment_driver_permission_split.sql`
  (queued, not yet applied):
  - INSERT: tightened to `is_company_staff(company_id)` (admin/lead/
    dispatch), matching the precedent already set for equipment cap/Unit#
    editing (2026-08-06) — not a new/different role set.
  - DELETE: tightened to `is_company_admin(company_id)` (admin **only**),
    deliberately narrower than INSERT — matches `delete_truck`/
    `delete_trailer`'s own existing role check exactly, so the RLS
    backstop can't be looser than the app's already-shipped behavior.
  - UPDATE: RLS itself is untouched (still company-scoped only). A new
    `enforce_equipment_status_only_update()` `BEFORE UPDATE` trigger on
    both tables does the actual column-level split — Postgres RLS
    policies can't compare OLD vs NEW columns in a bare USING/WITH CHECK
    expression, only a trigger can see both rows. Allow-lists the ~6
    confirmed-live status columns (`to_jsonb(old) - allowed` vs
    `to_jsonb(new) - allowed`) rather than deny-listing "core spec"
    columns — deliberately, since this repo's own "Architecture reality"
    section already documents `trucks`/`trailers` having several live
    columns (`vin_number`, `make`, `model`, `year`, every
    `reg_*`/`inspection_*`/`ifta_*`/`phmsa_*`/`alliance_*`/
    `fleet_ins_*`/`hazmat_lic_*`/`inner_bridge_*`/`tank_*`/
    `trailer_reg_*`/`trailer_inspection_*` pair, `notes`) never confirmed
    complete or present in any migration file — an allow-list of the
    known-safe status columns can't be broken by an unconfirmed column
    turning out to exist (or not), a deny-list could.
  - Staff (admin/lead/dispatch) bypass the trigger entirely via the same
    `is_company_staff()` check, so their saves are unaffected.

  **UI changes** (`lib/ui/driver/EquipmentDetails.tsx`), needed alongside
  the migration — without them, a driver editing any of the many fields
  the modal already let them touch (VIN, plate, make/model/year, every
  permit date/notes field, general notes, Active toggle) would now hit
  the new trigger's exception as a raw, unhandled-feeling Supabase error
  on Save, since the modal's existing `canEditRestricted` gate (added
  2026-08-06) only ever covered Unit #/cap/compartments, leaving
  everything else wide open to any role:
  - `PermitEditRow`/`TankEditRow` gained an `editable` prop (default
    `true`, mirroring `CompartmentEditor`'s existing pattern) — disables
    every date/notes input and hides the add/remove controls when false.
  - `TruckModal`/`TrailerModal`: VIN/plate/make/model/year, every permit
    row, the inspection-shop/issue-date "extra" inputs, tank rows, and
    the general Notes field are now all gated on the existing
    `canEditRestricted` flag exactly like Unit#/cap already were — not a
    new flag, just extending the one that existed.
  - Delete button gated to a new, narrower `canDelete = myRole ===
    "admin"` (not the broader `canEditRestricted`) to match the RLS/RPC
    admin-only rule exactly, rather than the admin/lead/dispatch set used
    everywhere else in this modal.
  - Deactivate/Reactivate button gated to `canEditRestricted` — `active`
    isn't in the trigger's status-column allow-list, so a driver toggling
    it would also trip the new restriction.
  - The Save button itself is now hidden (not just disabled) for
    `!canEditRestricted` — with every field already read-only there's
    nothing left for a driver to submit, and hiding it avoids a
    click-that-does-nothing.
  - **The "+ Add Truck/Trailer" (`isNew`) entry point needed no change.**
    Confirmed via code read that it's only reachable from two places:
    `/admin/page.tsx`'s Equipment section (already gated
    `myRole === "admin" || myRole === "lead"` at the section level,
    predating this pass) and `SoloEquipmentModal.tsx`'s add-new flow
    (only ever used by solo companies, whose sole member is always
    `role = 'admin'` by the existing solo-provisioning design). No path
    exists for a plain driver to reach `isNew` mode today, so
    `canEditRestricted`'s existing `isNew || …` bypass stays correct
    as-is — it was already effectively unreachable-by-drivers before this
    change and still is now.

  **Both migrations applied 2026-08-07/08, partial live verification —
  see gap noted below.** Typecheck clean throughout.

  **Real bug found and fixed during this pass**: the trigger's
  `is_company_staff(new.company_id)` check resolves against `auth.uid()`,
  which is `NULL` for any write made through a service-role Postgres
  connection — exactly how `app/api/admin/setup/route.ts`'s
  `serviceSupabase` client operates (already gated by its own
  `verifyAdmin()` check at the API layer, so this is a fully-trusted
  path). With `auth.uid()` null, `is_company_staff()` returned false, so
  the trigger would have incorrectly blocked any *future* service-role
  update to `trucks`/`trailers` touching a non-status column, regardless
  of who was really behind it — caught only because verifying an
  unrelated coupling flow happened to route through this same API and
  exposed it. Fixed via
  `supabase/migrations/20260808000000_equipment_status_trigger_service_role_fix.sql`
  (applied): the trigger now returns early (bypasses entirely) when
  `auth.uid() is null`, treating a null caller as an already-authorized
  system/service context rather than an unprivileged driver. Confirmed
  today's actual `claim_combo`/`set_primary_truck`/etc. operations (the
  ones that surfaced this) don't even touch `trucks`/`trailers` directly
  (only `equipment_combos`, `user_primary_trucks`, `user_primary_trailers`)
  — so this specific bug wasn't actually firing in that flow, but the
  fix is real and necessary for any future service-role write that does
  touch these tables' non-status columns.

  **Live-verified**: admin save path — opened an existing truck
  (`25512-A`) via `/admin`'s Equipment section, changed Make to a test
  value, saved with no error, reopened and confirmed the new value
  persisted, then reverted it. Confirms the trigger's `is_company_staff()`
  bypass works correctly for a real authenticated admin session and the
  new INSERT/DELETE policies don't collaterally break normal admin
  writes.

  **Not verified — a real gap, not silently skipped**: the actual
  driver-role restriction (UI read-only rendering *and* the trigger
  rejecting a non-status change) was not exercised end-to-end with a
  genuinely authenticated driver session. Attempted via the existing
  "Set up planner for X" admin-impersonation feature (temporarily
  reassigning a real company member to `driver`, then impersonating
  them) — but this is a display-only overlay: `shell.role` correctly
  reflects the impersonated user's role for client-side rendering
  (so the read-only UI gating *would* render correctly), but any actual
  `supabase.from(...).update(...)` call still authenticates as the real
  signed-in admin's own JWT, never truly assuming the target's identity
  — so this demo environment cannot exercise the trigger's rejection
  path at all; only a genuine driver-role login could. Both real accounts
  in the shared demo/QA company are admins, and creating a genuine
  third, disposable driver-role test account was judged not worth the
  session's remaining scope. Worth a real check if a driver-role login
  ever becomes available. (Role was cleanly reassigned back to admin
  after this attempt, confirmed via a fresh `/admin` load — no lasting
  side effect.)

  **Also confirmed, incidentally**: attempting this test surfaced a
  separate, pre-existing, unrelated bug — coupling equipment for an
  impersonated user via "Browse fleet & couple equipment" creates the
  `equipment_combos` row correctly (company combo count went 1 → 3
  across two attempts) but the claim doesn't surface as "my equipment" in
  that impersonated Planner session. Confirmed this is unrelated to
  today's migration (the coupling RPC only touches `equipment_combos`,
  never `trucks`/`trailers`) — flagged here rather than chased further,
  since it's outside this pass's scope.

## 2026-08-17 glitch/feature batch (Planner + Admin + Reports)

User compiled a list of glitches and feature requests from a real day of
using the app: refresh/stale-state bugs, an incentive-system UX pass, an
admin page layout redesign, and a Reports page overhaul. Planned via a full
Plan Mode pass (3 research agents + 1 design agent, cross-checked directly
against the real files before writing anything) — approved plan preserved
at the time in `wild-discovering-plum.md`. Nine items, done in dependency
order (isolated bug fixes first, then the interacting planner-flow fixes,
then layout, then the two bigger feature builds last). `tsc --noEmit`
clean after every item.

**1. Load button stuck on "Load started"** — `useLoadWorkflow.ts`'s
`activeLoadId` was set at load-begin but only ever cleared inside
`cancelActiveLoad`, never in the successful-completion path
(`onLoadedFromLoadingModal`). Added `setActiveLoadId(null)` right after
`setLoadingOpen(false)` in that success path — the button now correctly
falls back to RELOAD/LOAD immediately after a real completed load instead
of sticking until a full page reload.

**2. Removed the 🎉 emoji** from the driver-facing "you earned X points on
this load" confirmation line (`app/planner/page.tsx`) — text/styling/
conditional otherwise unchanged; item 7 below adds a separate persistent
card alongside it.

**3. Credentials card dark-on-dark color bug** — `app/planner/reports/page.tsx`'s
`credSummary` was using `cardTheme.ts`'s `EXP_COLOR`, a palette designed
for a light "pearl card-wallet" background (that file's own doc comment
says so) — `valid`/`not_set` were both near-black, effectively invisible
on this page's dark graphite surface. Fixed with the same `DARK_EXP_COLOR`
override pattern already used in `FleetCardsModal.tsx`/
`FleetCredentialsModal.tsx`/`dispatch/page.tsx` for the identical class of
bug.

**4. Preset dial restoring the wrong letter on refresh** — real root cause,
distinct from the earlier preset-corruption bug fixed the same week
(see the `usePlanSlots.ts` timestamp-comparison fix elsewhere in this
history): `PresetDial.tsx` fires `onActiveChange` on *every* dial change,
including pure scroll-centering, not just an explicit tap-to-load — and
`page.tsx` wired that same value straight into `load_log.plan_slot` at
load-begin and `loadReport.plan_slot` at completion. So a driver merely
scroll-previewing a different letter before tapping LOAD could tag the
completed load with the wrong slot, even though the submitted plan
content was correct — on the next refresh, the dial then highlighted the
wrong letter. Fixed by separating "cosmetic dial position"
(`activeSlotLetter`, still drives the Save-plan button, unchanged) from
"the preset a real load action actually applied" (new `lastLoadedSlot`
state, set only inside `PresetDial`'s/`PresetActionSheet`'s `onLoad`
callbacks, never inside `onActiveChange`) — `useLoadWorkflow`'s
`activeSlotLetter` argument now receives `lastLoadedSlot`, and the
restore-on-refresh resync effect's guard changed from the fragile
`activeSlotLetter === 1` to `lastLoadedSlot == null`.

**5. Fuel temp could go stale while the app sat open** — two real bugs in
`page.tsx` plus one gap in `useFuelTempPrediction.ts`:
- The "mark as user-adjusted" effect only checked whether
  `predAppliedForRef.current` was non-empty, which was already true right
  after any auto-apply — so the auto-apply's own `setTempF` call
  immediately, incorrectly flagged itself as a manual edit on the very
  next render, permanently blocking any later re-application of a fresher
  prediction. Fixed by comparing the new `tempF` against
  `predictedFuelTempF` itself before flagging it as user-adjusted.
- The auto-apply effect's guard (`predAppliedForRef.current === key`)
  never re-fired once applied for a given city/state, even if a later
  fetch returned a genuinely different number. Changed to check the
  *value* (`Math.abs(tempF - predictedFuelTempF) < 0.1`), not just the key.
- No polling existed at all — `useFuelTempPrediction.ts` only re-ran on
  location changes. Added a 10-minute `setInterval` inside the existing
  fetch effect that resets the dedup refs and re-runs, so a driver who
  leaves the app open all day gets a fresh temp automatically instead of
  loading on a stale morning reading. Not addressed: a LOAD tapped in the
  brief window between mount and the first prediction resolving could
  still use the stale localStorage-hydrated value — accepted, not a hard
  gate, since the ask was "keep it fresh automatically," not "block
  loading during a fetch."

**6. Admin header redesign** — `app/admin/page.tsx`'s action buttons were a
mobile-only horizontal-scroll pill strip that ran off the right edge on
narrow screens; `NavMenu` was a trailing sibling instead of sitting next
to the company name. Replaced with a universal (not mobile-only) 3-column
CSS grid (`.admin-header-tile`, `aspect-ratio: 1`, square large tap
targets) and moved `NavMenu` inline with the company name on the header's
left side.

**7. Incentive system: renamed away from "payroll," new averaging-period
setting + Planner card.** Per explicit direction: "don't relate anything
to pay anywhere... just periods," while keeping the existing feature
fully functional (rename copy only, same precedent as the `/calculator`→
`/planner` rename — internal files/symbols/DB columns unchanged):
- `app/admin/page.tsx`: button label `Payroll` → `Period Report`.
- `app/admin/PayrollReportModal.tsx`: modal title → `Period Report`, CSV
  filename `payroll_...csv` → `period_report_...csv`. Component/file name,
  state vars (`payPeriodType`/`payPeriodAnchorDate`), and the
  `pay_period_type`/`pay_period_anchor_date` DB columns are all
  deliberately unchanged.
- `app/admin/IncentiveSettingsModal.tsx`: `PAY PERIOD` → `REPORT PERIOD`,
  `ANCHOR DATE` → `PERIOD ANCHOR DATE`, helper text updated to say
  "Period Report."
- **Planner running-average card, keyed off the SAME report period** —
  first built same-day as a fully independent, anchor-less
  "averaging period" concept (new `incentive_settings.averaging_period_type`
  column + a separate calendar-aligned date-math module), then explicitly
  simplified via same-day follow-up ("if we are keeping the report period
  and anchor date thing we can just match the averaging period for the
  planner card to that same period") — reversed before the migration was
  ever applied, so no schema change was needed in the end.
  `app/planner/utils/incentiveAveragingPeriod.ts` and its unapplied
  migration were both deleted; the Planner card instead reuses
  `app/admin/payPeriods.ts`'s existing `generatePayPeriods()` (already
  driving the Period Report) — `generatePayPeriods(payPeriodType,
  payPeriodAnchorDate, 1)[0].start` gives the period containing today for
  all four period types, no new date math needed. `IncentiveSettingsModal.tsx`
  no longer has a second period dropdown at all; its existing Report
  Period/Anchor Date fields now drive both the Period Report AND the
  Planner card, and its helper text was updated to say so.
- New card on the Planner (`app/planner/page.tsx`), directly after the
  existing Load Summary card, visible only when
  `incentive_settings.enabled`: left side shows this load's points
  (`loadReport.recovered_points`), right side shows the running average
  for the current report period (queries `load_points` filtered by
  driver/company/period start, grouped by `load_id` and averaged — same
  pattern `PayrollReportModal.tsx` already uses for its own totals).

**8. Product catalog picker reused for benchmark entry** —
`IncentiveSettingsModal.tsx`'s old benchmark search was a bare `<input>`
with client-side filtering, nothing shown until you typed ("kinda hard to
use," per the user). `ManageTerminalProductsModal.tsx` gained an optional
`mode: "rack" | "pick"` prop (defaults `"rack"`, existing rack-curation
behavior untouched) — in `"pick"` mode it skips the `rack_product_status`
fetch entirely (no rack context needed) and tapping a product calls
`onPick(product)` instead of toggling `active`, with the existing
"✓ Active"/"+ Add" styling reused via a `pickedProductIds` set. Modal
stays open across multiple picks (most companies only benchmark a
handful of products) with a Done button to close.
`IncentiveSettingsModal.tsx` now opens this in pick mode via a
"+ Add a benchmark product" button; since the shared modal's
`CatalogProduct` type deliberately doesn't carry `api_60`/`alpha_per_f`
(incentive-only columns, kept out of the shared modal on purpose), its
`onPick` handler re-looks-up the full row from the already-fetched
`productById` map before calling the existing `addProduct()`.

**9. Reports page overhaul** (`app/planner/reports/page.tsx`):
- **Role-aware Loads + driver picker.** `canViewOthers = role === "admin"
  || role === "dispatch"` — matches the existing "other drivers' loads"
  permission-matrix precedent exactly (dispatch+admin, not lead). New
  `viewedUserId` state (defaults to `effectiveUserId`, resets whenever it
  changes) drives `useLoadHistory`; a new switcher pill above the Loads
  section (reuses the existing `DriverPicker.tsx` component, wrapped in a
  `FullscreenModal` here since it's normally rendered inline on the
  Dispatch tab) lets admin/dispatch pick any company member, including
  themselves. Section/tile title reads "My Loads" whenever
  `viewedUserId === effectiveUserId`, else "Loads."
- **Compliance moved up**, now directly after Loads (was last). Its
  Credentials fetch (profile/license/medical/twic) is now scoped to
  `viewedUserId` instead of `effectiveUserId`, so an admin viewing another
  driver's loads sees that same driver's credentials. Terminal Cards
  needed no change — already company-wide, no per-user scoping.
- **New equipment selector**, admin/dispatch/lead only
  (`canPickEquipment` — deliberately a *wider* set than
  `canViewOthers`, and a narrower read-only carve-out from the general
  equipment-edit permission matrix, per explicit user instruction for
  this specific feature). New `app/planner/components/EquipmentComboPicker.tsx`
  — no existing lightweight "pick any combo" component existed
  (`EquipmentModal`/`SoloEquipmentModal`/admin's `CoupleModal` are all
  coupled to claim/couple RPCs); this is a pure read-only picker over the
  already-fetched `equipment.combos` array, no RPCs. A privileged role's
  pick (`reportComboId`) overrides which combo Scale/Service/Wash History
  reports on; everyone else keeps seeing their own Planner-selected
  equipment, unchanged.
- **Differentiated sub-labels**, replacing one shared generic
  "equipment label" string across all three history tiles: Scale History
  now shows tare weight (`Tare {tare_lbs} lbs`, straight off the resolved
  combo); Service History shows next service due, computed via
  `SoloEquipmentModal.tsx`'s existing `computeUnitServiceDue` (now
  exported, along with its `UnitServiceDue`/`ServiceRecordLite` types,
  rather than reimplemented — same due-computation the driver's own
  equipment modal report line already uses); Wash History shows the most
  recent `wash_records.washed_at` for the combo's truck (or trailer, if
  the combo has no truck).

**Not live-verified this pass** — same category of gap this project has
flagged repeatedly for role-matrix work: no real dispatch/lead-role login
was available to exercise the Reports page's driver/equipment pickers
end-to-end. No new migration is needed for item 7 after the same-day
simplification above, so the Planner's running-average card is verifiable
against the existing demo/QA company like everything else in this batch.

**Follow-up same day: removed the admin header's "Credentials" (Fleet
Credentials) button entirely.** User live-tested it and hit a display bug
(a second company member's name rendered as literal "Unknown" instead of
their real name) and, in the same breath, pointed out `MemberCard.tsx`'s
existing expanded per-member view already covers this — and covers it
better: real license class/number/state/endorsements, examiner name, TWIC
card number, Port IDs, and terminal groups with attachments, not just a
flat expiry-date list. Confirmed via code read before removing anything:
`FleetCredentialsModal.tsx` was only ever imported by `app/admin/page.tsx`
(the two other file hits were doc-comment references in
`app/planner/reports/page.tsx`/`app/planner/dispatch/page.tsx`, not real
usages) — safe to delete outright rather than leave as unreachable dead
code. Removed the button, its `fleetCredsOpen` state, the import, and the
modal render call from `app/admin/page.tsx`; deleted
`app/admin/FleetCredentialsModal.tsx`. The admin+dispatch RLS read grant
those credential tables got in `20260806000000_dispatch_credential_visibility.sql`
is untouched and still needed — `app/planner/dispatch/page.tsx`'s own
Credentials section reads the same tables under the same grant,
independent of this modal.

**Follow-up same day: nav menu panel anchoring fixed for Admin's new
left-side hamburger.** `NavMenu.tsx`'s dropdown panel picked which side to
anchor on (`left:0` vs `right:0`) by checking `isPlanner` (a pathname
check) — a proxy for "is the hamburger button on the left of the header,"
which was true for every non-Planner route until today's admin header
redesign (item 6 above) moved `/admin`'s own `<NavMenu />` from the
header's trailing-right position to sit inline with the company name on
the left. `isPlanner` stayed false for `/admin`, so the panel kept
anchoring `right:0` (opens leftward) against a button now on the far
left — pushing the whole 240px panel off the left edge of the viewport.
Fixed with a new optional `anchor?: "left" | "right"` prop, explicit
callers win over the old route guess (`anchor ?? (isPlanner ? "left" :
"right")`) — `app/admin/page.tsx` now passes `anchor="left"` since it
knows its own layout; every other call site (`CalculatorLayoutClient.tsx`,
`app/profile/page.tsx`, `app/superadmin/page.tsx`) is unchanged and keeps
the exact same behavior it always had.

**Follow-up same day: invite email — fixed the consuming-link bug and the
duplicate/broken second email.** User tested onboarding a real second
driver via a webmail client and hit two real bugs at once: the invite
link showed "Link expired or already used" / "No token found in this
link" on first tap, and two separate emails arrived — the intended
custom-branded one (logo not rendering, an ugly long `supabase.co` URL
visible next to the link button) and a second, differently-worded,
visibly broken one with a missing company name and a non-functional-
looking link.

Root cause, confirmed by reading `app/api/admin/invite/route.ts` end to
end: both bugs trace to the same design gap already fixed once before for
the Magic Link *sign-in* email (see "magic link / login reliability"
history above) but never carried over to this separate *invite* code
path. (1) **Consuming link**: both branches built `confirmUrl` from
Supabase's raw `action_link` — a GET request straight to
`<project>.supabase.co/auth/v1/verify` that consumes the one-time token
the instant anything (a link-scanner, Outlook Safe Links, a corporate
mail gateway) requests it, before the human ever taps. Fixed by building
`confirmUrl` from `linkData.properties.hashed_token` instead, pointed at
our own `${redirectTo}?token_hash=...&type=...` — `/auth/confirm/page.tsx`
already expects exactly this shape and only consumes it via an explicit
client-side `verifyOtp()` call, so this was a drop-in fix, not a new
mechanism. This also directly explains the "long ugly URL" complaint —
the raw Supabase action_link is long and points at the `supabase.co`
project domain; the new `token_hash` link is short and points at
`protankr.com`. (2) **Duplicate broken email**: the new-user branch called
`inviteUserByEmail()` (which creates the account) *and then* a second,
separate `generateLink()` call just to get a link for the custom Resend
email — but `inviteUserByEmail()` unavoidably triggers Supabase's own
built-in "Invite user" email as a side effect of creating the account (no
parameter suppresses it), which is exactly the second, differently-styled
email the user received — its broken company-name interpolation and
missing/empty logo are Supabase's own default template, not anything in
this repo. Fixed by dropping `inviteUserByEmail()` entirely and calling
`generateLink({type: "invite", ...})` directly — Supabase's own docs
confirm `generateLink` with `type: "invite"` both creates the account
*and* returns the link, without ever sending Supabase's own email, which
is the standard pattern for "invite without their default email." Also
gave the branded email's logo `<img>` a real `alt="ProTankr"` (was empty)
so a client that blocks remote images from an unrecognized/new sender —
plausible here, since the untrusted-sender warning shown in the user's
screenshots suggests `noreply@protankr.com` hasn't built up mail-client
reputation yet — shows readable text instead of a blank box; this is a
mail-client trust/rendering behavior outside what server-side code can
force, not something to keep chasing further without more evidence.

Not live-verified this pass (no way to trigger a real invite email and
inspect webmail rendering from this session) — `tsc --noEmit` and `next
build` both clean; worth a real re-test of the invite flow with a
disposable second account before considering this fully closed.

**Follow-up same day: incentive points now calculate unconditionally,
`enabled` only gates display.** User asked whether turning on Incentives
retroactively calculates existing loads or only starts from that moment
(only from that moment — `calculate_load_points` no-op'd entirely whenever
`incentive_settings.enabled` was false, so any load completed before the
toggle flips on never gets a `load_points` row, permanently). Backfilling
that gap was technically straightforward (the density math it needs,
`actual_lbs / actual_gallons`, is already stored per compartment on every
historical load — nothing live-sensor-dependent), but the existing RPC is
owner-gated (`v_user_id != auth.uid()` raises `unauthorized`), so a real
bulk backfill would've needed a new admin-triggered variant, plus real
product decisions (how far back, one-shot vs. automatic, whether it
retroactively flags already-exported Period Reports as stale).

User's own follow-up proposal sidesteps needing a backfill mechanism at
all: **always run the calculation, and let `enabled` control only whether
the data is surfaced.** Migration
`supabase/migrations/20260817010000_incentive_calc_always_runs.sql`
(**not yet applied** — Supabase SQL editor, as always) replaces
`calculate_load_points`'s early-exit guard from `if not found or not
v_enabled` to just `if not found` — it still requires an
`incentive_settings` row to exist at all (so `weight_cap_lbs` has a real
value to calculate against; a company that's never opened Incentive
Settings still has nothing to compute), but no longer skips calculation
just because the driver-facing toggle is off. The function's own returned
`enabled` field was changed from a hardcoded `true` to the real
`v_enabled` value, since `useLoadWorkflow.ts` already reads exactly that
field (`if (pointsRes?.enabled) recoveredPoints = ...`) to decide whether
to populate `loadReport.recovered_points` at all — this one-line change is
what keeps the driver-facing "You earned X points" banner correctly gated
even though `load_points` itself is now always kept current underneath.
Every other display surface was already independently gating on
`incentive_settings.enabled` rather than inferring it from data presence
(`UnderloadingDashboardModal.tsx`'s own `incentivesEnabled` check, the
Planner's running-average card's `incentiveEnabled` state) — confirmed via
code read across all four `recovered_points`/`load_points` consumers
(`app/planner/page.tsx`, `app/admin/PayrollReportModal.tsx` — deliberately
ungated, an admin tool that should show real numbers whenever they exist,
`app/admin/UnderloadingDashboardModal.tsx`, `app/admin/IncentiveSettingsModal.tsx`
— doesn't display point data at all), so no client-side changes were
needed anywhere else.

**Explicitly does not backfill loads that completed before this migration
ships** — `calculate_load_points` only ever runs once, right after
`complete_load` succeeds; a load that already finished in the past already
had its one and only chance to call it. This change only makes future
gaps impossible (an admin can now configure benchmarks/weight cap with the
toggle off and have real data waiting the moment they flip it on) — a true
historical backfill for loads that already happened before today would
still need the separate admin-triggered RPC described above.

**Follow-up same day: that historical backfill, shipped.** User asked for
it directly. Migration `supabase/migrations/20260817020000_incentive_backfill.sql`
(**not yet applied**) refactors the split-load formula out of
`calculate_load_points` into a private, unauthenticated
`_calculate_load_points_core(p_load_id, p_user_id, p_company_id,
p_tare_lbs)` — deliberately extracted rather than duplicated a second time
inline, per this project's own established "duplicating this is how the
bug creeps back in" precedent (`CustomSelect.tsx`/`ServiceTypeManager.tsx`).
`calculate_load_points(p_load_id)` keeps its exact existing public
signature/behavior (owner-only — `auth.uid()` must match the load's own
driver), just delegates its math to the core after that check.
`_calculate_load_points_core` has `execute` revoked from
`public`/`anon`/`authenticated` so it's unreachable via PostgREST directly
— only the two auth-checked wrappers (as function owners) can call it.

New `backfill_incentive_points(p_company_id, p_since default null)` —
admin-gated (role checked inside the function, same pattern
`recalculate_load_points` already established), loops every `load_log`
row with `status = 'completed'` belonging to a *current* member of
`p_company_id` (join through `user_companies`, since `load_log` itself has
no `company_id` column — confirmed by reading its actual definition in
`20260222172537_remote_schema.sql` rather than assuming) and calls the
core for each, using the caller's chosen company as the calc context
directly rather than each row's own `get_active_company_id()` (irrelevant
here — the admin already explicitly scoped this to their own company).
`p_since` defaults to null (whole history), matching "calculates all the
loads" as literally asked; a caller could pass a cutoff for a narrower
re-run later, though nothing in the UI exposes that yet. Idempotent
(same upsert-on-conflict the core always had), so safe to tap again after
adding a benchmark that didn't exist on an earlier pass.

New "Backfill Historical Loads" button in `IncentiveSettingsModal.tsx`
(bottom of the modal, its own "Historical data" section) — confirm
prompt, then calls the RPC and shows "{N} loads processed, {X} total
recovered gallons" or surfaces the error inline, same pattern the rest of
this modal already uses for its own save errors.

Not live-verified this pass (no DB write access from this session to
apply either migration or trigger a real backfill) — `tsc --noEmit` and
`next build` both clean. Both `20260817010000_incentive_calc_always_runs.sql`
and `20260817020000_incentive_backfill.sql` need to be applied, in that
order, before either the always-calculate behavior or the backfill button
work against live data.

**Applied 2026-08-18** (`20260817010000`/`20260817020000`, via the DB
password the user shared this session — same `pg`-npm-package approach
documented in this session's own memory, pooler host
`aws-1-us-east-1.pooler.supabase.com` / user
`postgres.oqeucfiyrgbymmtkiatg`; confirmed live via `pg_proc` and
`pg_get_functiondef` matching exactly what was pushed) — but the very
first real-world tap of "Backfill Historical Loads" against a company
with genuine load history came back "0 loads processed," a real bug, not
a data problem.

Added `20260818010000_incentive_backfill_diagnostics.sql` (applied by the
user directly via the SQL editor) to `backfill_incentive_points`'s own
return payload (`company_members`, `member_loads_any_status`) rather than
guess blind, since this session had no live DB access at that specific
point to inspect directly — surfaced in `IncentiveSettingsModal.tsx` as a
diagnostic line whenever `loads_processed` comes back 0. Re-running it
confirmed real load history existed for the company's members, just none
matching the filter — pointing straight at the actual root cause: the
backfill's `load_log.status = 'completed'` filter was copied from the
**dead** 4-arg `complete_load(p_load_id, p_completed_at, p_lines,
p_product_updates)` overload (already flagged as dead code, never called
by the client, in this doc's own "Fuel temp prediction system
(architecture)" section) — not the overload the app actually calls
(`lib/supabase/load.ts`'s `complete_load({ payload })`), which sets
`status = 'loaded'`, confirmed directly against its live definition in
`20260722000000_product_canonical_grouping.sql`. Every real finished load
in this app has `status = 'loaded'`, never `'completed'` — a status value
that, per this discovery, is essentially unused by the live system.

Fixed in `20260818020000_incentive_backfill_status_fix.sql` — only the
status filter changed, same loop/core/diagnostics otherwise.
`calculate_load_points`/`_calculate_load_points_core` were never affected
by this bug — neither filters by status at all, since the normal per-load
path is only ever called by `useLoadWorkflow.ts` right after a real
`complete_load` success, with no need to re-check status. **Applied and
live-verified 2026-08-18** — user re-ran the backfill against the same
real company and confirmed it now processes real loads instead of
returning zero.

### Nav menu links caused a full page reload, breaking dark mode on non-tab destinations (2026-08-18)

User report: turning on Dark Mode, then tapping a hamburger-menu
destination (Reports, Company Admin, "anything") made the shared in-app
header band (behind the hamburger/bell/gear icons) revert to its light
default — while Settings' own Dark Mode toggle still correctly showed
"on." Confirmed via `AskUserQuestion` that this was specifically the
in-app header band, not the OS status bar strip (a different, already-
fixed class of theme-color bug from 2026-08-06 — see "Terminal tab:
clickable location header" section above).

**Root cause**: `NavMenu.tsx`'s `NavLink` (used for every hamburger-menu
item — Reports, Company Admin, Back to Planner, Super Admin, Learn, Sign
Out) rendered a plain `<a href>` tag, not Next.js's `<Link>` or
`router.push()` — unlike the tab bar (`TabBar` in
`CalculatorLayoutClient.tsx`), which already navigates via `router.push`.
A plain `<a href>` triggers a full browser page reload rather than a
client-side transition. On a full reload, the page is server-rendered
first — and the server has no access to `localStorage` (where
`useTheme.ts` persists dark mode/accent color) — so the fresh HTML always
paints the light default; client-side hydration is what's supposed to
correct it afterward, but this is exactly the same "flash of default"
mechanism this project already fixed once for the *status bar* specifically
(the 2026-08-06 `theme-color` work) — this was the same underlying class
of bug in a different, still-unfixed spot (the in-app header itself,
reached via a different navigation path that fix never touched).

**Fixed**: `NavLink` now renders Next.js's `<Link>` instead of a plain
`<a>` — real client-side navigation, no full reload, no server-render-
without-localStorage flash. For routes sharing the Planner's layout
(Reports, in particular — a `/planner/reports` sub-route under the same
`app/planner/layout.tsx`), this also means `CalculatorShellProvider`
never unmounts/remounts at all when navigating there via the hamburger
menu, matching how tab-bar navigation already behaved.

Not live-verified this pass (no authenticated session available from this
side) — `tsc --noEmit` and `next build` both clean.

**Follow-up same day: dark mode/accent didn't survive closing and
reopening the app at all** — the `<Link>` fix above covers in-app
navigation, but the user's next report was about a genuinely cold load
(closing and reopening the app entirely): Settings' Dark Mode toggle
still correctly showed "on," but the header stayed permanently light —
not a brief flash, stuck.

**Real root cause**: `useTheme.ts`'s own 2026-08-06 fix (reading
`DEVICE_KEY` **synchronously inside its `useState` lazy initializer**, to
avoid a flash on in-app navigation) is exactly what breaks a fresh page
load. That hook also runs during SSR, where `localStorage` doesn't
exist, so the server always renders `darkMode=false`. Reading it
synchronously in the client's own lazy initializer then produces a
*different* value on the client's first (hydration) render than what the
server sent — a genuine hydration mismatch, not just a flash — and
depending on how React resolves it, the already-painted server DOM
(light) can end up stuck rather than reliably patched to match the
(correct) client state, which is exactly "the toggle says on but the
header stays light."

**Fixed** (`app/planner/hooks/useTheme.ts`) using the same pattern this
codebase already established for an identical SSR/client mismatch in
`useNow()`: `darkMode`/`accentColor` now both start at the neutral
default (identical on server and the client's first render — nothing to
mismatch), and get resolved for real in a client-only `useEffect` that
never runs during SSR. This reintroduces a brief flash of the default on
a genuinely cold load — the same tradeoff already accepted for the
status-bar `theme-color` meta tag — but guarantees the header eventually
lands on the *correct* value instead of being able to get permanently
stuck disagreeing with what Settings shows.

Not live-verified this pass either (same reason). `tsc --noEmit` and
`next build` both clean.

**Follow-up same day: a third, related bug, this time the status bar
specifically.** With the previous two fixed, the user's next report was
narrower and specific: navigating (via the now-client-side hamburger
menu) to Reports left the strip *behind the clock/status bar* white while
the in-app header band itself was correctly dark — and a pull-to-refresh
while already on Reports fixed it.

**Root cause**: the Header's `theme-color`-sync effect
(`CalculatorLayoutClient.tsx`) only re-ran when `darkMode`/`accentColor`
*changed value* (`useEffect(..., [darkMode, accentColor])`). That was
deliberate — the 2026-08-06 pass reasoned "Next's own per-route metadata
already re-applies whatever static `viewport.themeColor` a *different*
layout declares once the user navigates away from `/planner`," so the
effect only needed to stay in sync while mounted, never reset itself. That
reasoning had a real gap: Next re-applies the **current route segment's**
own static metadata on *every* client-side navigation — including
navigation between two routes that share the *same* layout, like
`/planner` → `/planner/reports`. Since `Header` never unmounts for that
transition (confirmed in the previous fix — same shared layout, no
remount), its effect had no reason to re-run (dependencies unchanged),
so Next's freshly-reapplied static white default (`app/planner/layout.tsx`'s
own declared baseline) sat there uncorrected. A pull-to-refresh is a full
reload — a brand new `Header` mount, whose effect runs fresh regardless of
dependency comparison — which is exactly why that "fixed" it.

**Fixed**: added `pathname` (via `usePathname()`, already imported in this
file for `TabBar`) to the effect's dependency array, so it re-asserts the
real theme-color on every route change too, not just every theme-value
change — cheap and idempotent when the color hasn't actually changed.

Not live-verified this pass (same reason as the two fixes above). `tsc
--noEmit` and `next build` both clean.

### Reports page overhaul: two real bugs found on a follow-up review pass (2026-08-19)

User asked for a general check of the Reports page after the dark-mode
fixes above. Read through `app/planner/reports/page.tsx` and its newer
supporting pieces (`EquipmentComboPicker.tsx`) end to end rather than
waiting for another live report — found two real, concrete bugs from the
2026-08-17 overhaul itself, not the dark-mode work:

1. **Wash History's preview subtitle silently ignored the trailer.** The
   sub-label effect resolved a single `idField`/`idValue` (`truckId ?
   "truck_id" : "trailer_id"`) and used it for BOTH the service-due query
   and the wash query — correct for Service (the original spec explicitly
   asked for "next **truck** service due"), wrong for Wash, which has no
   such truck-only carve-out. A combo whose trailer has real wash history
   but whose truck has none would show "No wash recorded" — flatly wrong,
   not just incomplete. The full Wash History modal itself was never
   affected (`RecordHistoryModal.tsx` already queries both `truck_id` and
   `trailer_id` for wash/service records — confirmed by reading it) — only
   this page's quick-preview text was broken. Fixed by querying wash
   records for both units when both exist and taking the most recent.
2. **Admin/dispatch viewing another driver's Loads got a working-looking
   Delete button that always fails, and a modal titled "My Loads" showing
   someone else's history.** `MyLoadsModal.tsx`'s own prop comment already
   documents exactly why this combination is wrong — `delete_load`'s RPC
   is owner-checked server-side (`user_id = auth.uid()`, no admin bypass
   at all, confirmed by reading `20260727000000_delete_load.sql`) and
   there's a separate `AdminLoadsModal.tsx` that deliberately omits both
   `onDeleteLoad` and `onRestoreLoad` for this reason — a precedent this
   page's initial build should have followed but reused `MyLoadsModal`
   unconditionally instead. Fixed without swapping components: `onDeleteLoad`
   is now only passed when `!isViewingOther`, and the already-existing
   (previously unused here) `headerOverride` prop is now set to
   `"{name}'s Loads"` when viewing someone else, so the modal's own title
   stops claiming "My Loads" while displaying another driver's data.

Not live-verified (no authenticated session available from this side).
`tsc --noEmit` and `next build` both clean.

### Backfilled loads all got today's date, breaking period sorting (2026-08-19)

User report: after running the historical backfill, every backfilled load
showed up with today's date, so period-based sorting (the Planner's
running-average card, Period Report's period filter) didn't work.

**Real bug, present since `_calculate_load_points_core` was first
written** (not something the backfill introduced on its own): the
`insert into load_points (...)` column list never included `created_at`
at all, so it silently fell through to the table's `default now()`. Every
period-based read in the app keys off `load_points.created_at` as "when
did this load happen" — the Planner's average card's `.gte("created_at",
...)` filter, and Period Report's own `.gte(...)/.lte(...)` filtering
*and* the date it displays per load line (`PayrollReportModal.tsx`:
`date: lines[0]?.created_at`). For a live load this bug was invisible,
since `calculate_load_points` fires right after `complete_load` succeeds
— "now" already approximated the load's own date closely enough not to
notice. Running the backfill against weeks of historical loads all at
once is what finally made it visible: every one of them got stamped with
the *backfill's own run time*, not its real date.

**Fixed** in `supabase/migrations/20260819000000_incentive_backfill_created_at_fix.sql`
(**not yet applied**) — `_calculate_load_points_core` gained a new
`p_load_date timestamptz` parameter (required dropping and recreating it,
since Postgres treats a changed parameter list as a different function
signature, not a replaceable one — the old 4-arg overload is dropped
explicitly so it doesn't linger as an orphaned, still-callable
duplicate), and both `created_at` and `updated_at` are now set explicitly
on **both** the insert and the `on conflict ... do update` path — not
just insert, since simply re-running the (already idempotent) backfill is
exactly how this migration corrects the already-wrong rows the previous
run created, not just prevents new ones. `calculate_load_points` now
reads `load_log.completed_at` (falling back to `now()` only if somehow
null) and passes it through; `backfill_incentive_points` does the same,
falling back to `created_at` and then `now()` in that order. Both
callers' own public signatures are unchanged — this is purely internal
plumbing.

**Applied and live-verified 2026-08-19** — user pasted the migration into
the SQL editor themselves, then re-ran "Backfill Historical Loads" (safe
to repeat — same idempotent upsert), which corrected the existing
wrong-dated rows in place per the fix's own design, and confirmed period
sorting now works.

### Departed drivers still showing up in Period Report / Underloading Dashboard, plus a region-grouped driver filter (2026-08-19)

Two related asks in one message: (1) a load kept showing up for a driver
who'd been removed from the company, and (2) a way to narrow both reports
down to a subset of drivers, grouped by region.

**Root cause of (1), confirmed by reading both modals**: removing a
driver only deletes their `user_companies` row — `load_points`/`load_log`
are never touched — and both `PayrollReportModal.tsx` (Period Report) and
`UnderloadingDashboardModal.tsx` (Underloading) queried `load_points`
filtered only by `company_id`, with no check against *current* roster
membership at all. A departed driver's historical rows persist forever
and keep showing up, correctly attributed by name (their `profiles` row
isn't deleted either), in every period regardless of whether they still
work there.

This is a real tradeoff, not an obvious bug fix — for Period Report
specifically (payroll-adjacent), a driver who worked and was owed pay for
a past period arguably *should* still show up there even after leaving,
the way real payroll reports work. Asked rather than assumed: user chose
**hide from both reports** — simplest, matches "get rid of that" literally.

**Shipped**: both modals now fetch the current roster via
`useCompanyRoster` (widened, see below) and filter `load_points` rows to
`currentMemberIds` before computing any driver summary, CSV export, or
totals — a departed driver's data is now excluded from both reports
entirely, without touching the underlying `load_points` data itself (nothing
is deleted; the row just isn't surfaced by these two specific reports).

**(2) New `app/admin/DriverGroupPicker.tsx`** — shared by both modals
(built once rather than copied twice, matching this project's own
established "duplicating this is how the bug creeps back in" precedent).
Region-grouped checkbox picker: `useCompanyRoster` widened to also return
`region` (already returned by `get_display_names_full` per this doc's own
earlier notes — just wasn't being read before), grouped with an
"Unassigned"/"No Region" bucket for anyone without one, each region has
its own select-all/indeterminate checkbox, plus top-level Select All/None.
Selection model: `null` means "everyone currently on the roster" (the
default — no filter), narrowing to an explicit `Set<string>` only once the
admin actually unchecks someone. Since the picker sources from
`useCompanyRoster` (current membership only), a departed driver isn't even
pickable — consistent with (1) above by construction, not a separate rule.
Both modals gained a "{N of M} Drivers" / "All Drivers" chip that opens
the picker; `driverFilter` is applied as an additional layer on top of the
roster-membership filter everywhere `load_points` rows feed into driver
summaries, totals, or CSV export.

Not live-verified this pass (no authenticated session available from this
side). `tsc --noEmit` and `next build` both clean.

### Visual polish: Cards tab + Admin header tiles now match the dark graphite theme (2026-08-19)

User feedback: the Reports page's tiles (`ReportTile`'s graphite gradient
+ border + colors) looked right; Admin's square header buttons and the
Cards tab's Terminals/Badges/Credentials "wallet card" tiles didn't —
"those ivory cards don't look like they belong."

**Cards tab redesign** (`cardTheme.ts`, `cards/page.tsx`,
`cards/badges/page.tsx`, `cards/credentials/page.tsx`) — this was a real
design call, not a quick color swap: the light "pearl card-wallet" look
(`TONES`/`toneFor`, a deterministic pastel color per terminal/badge name,
radial-gradient sheen) was a deliberate, well-built physical-card-in-a-
wallet metaphor, not an oversight. Replaced with the same
`GRAPHITE`/`GRAPHITE_DARKER` gradient used everywhere else in the app
(now exported from `cardTheme.ts` as `CARD_BG`/`CARD_BORDER`/
`CARD_BORDER_SELECTED`/`CARD_SHADOW`, matching `ReportTile`'s exact
values) — `TONES`/`toneFor` removed entirely, confirmed via grep that
nothing else referenced them. Every front/back card face across all three
sub-tabs (Terminals' `TerminalCard`, Badges' `BadgeCard`, Credentials'
`LicenseCard`/`MedicalCard`/`TwicCard`) had its dark-on-light inline
colors flipped to light-on-dark (name/number/labels, inactive badges,
category pills, confirm-remove boxes, Cancel buttons).

**`cardTheme.ts`'s shared tokens** (`fieldLabel`/`fieldInput`/
`btnPrimary`/`btnSecondary`/`btnDanger`) were also flipped to dark-
background versions, so every back-of-card edit form across all three
sub-tabs updated automatically from one place. `EXP_COLOR` (light-
calibrated) was deliberately left **unchanged** — `CredentialsReportModal.tsx`
genuinely renders a white printable page (hands off to the browser's
print dialog) and still needs dark-on-light text there, confirmed by
reading it before touching anything. Added a new `DARK_EXP_COLOR` export
alongside it instead — the same values that were already independently
redeclared as local consts in `FleetCardsModal.tsx`/`dispatch/page.tsx`/
`reports/page.tsx` for this exact reason; those weren't migrated to
import the new shared constant (out of scope for this pass, since they
already worked correctly), but could be in a future cleanup pass to
remove the duplication.

**Admin header tiles** (`app/admin/page.tsx`'s `.admin-header-tile` CSS) —
was already a flat dark fill (`rgba(255,255,255,0.06)`), not literally
ivory, but lacked the graphite gradient + shadow depth the user wanted to
match. Updated to the identical gradient/border/shadow values as
`ReportTile` (hardcoded hex since this is a plain `<style jsx global>`
block, not inline props with access to the `GRAPHITE` JS constant).

Not live-verified this pass (no authenticated session available from this
side) — `tsc --noEmit` and `next build` both clean.

**Follow-up same day: the Terminal tab's STUD button ignored dark
mode/accent entirely.** `app/planner/terminal/page.tsx`'s STUD button
(opens the rack-level Product Status Update modal) had a hardcoded
`background: "#fff", color: "#111"` — never wired to
`shell.theme.darkMode`/`accentColor` at all, unlike the Planner's Load
button (`theme.ts`'s own documented rule: dark mode/a custom accent
overrides the fill on "the Load button, compartment handles, and CG
puck" — this button belongs in that same themed-fill category and was
just missed when it was originally built). Fixed by applying the exact
same pattern the Load button already uses —
`themeFill(shell.theme.darkMode, shell.theme.accentColor, "#ffffff")` for
the background, `themeTextOnFill(shell.theme.darkMode)` for the text
color. Grepped the rest of `app/planner/terminal/` for the same
hardcoded-`"#fff"`-background pattern — no other hits, this was the only
one.

Not live-verified this pass (no authenticated session available from this
side) — `tsc --noEmit` and `next build` both clean.

### About page: sequential "keep reading" navigation between topics (2026-08-20)

User feedback: finishing a topic's deep-dive page (`/about/[slug]`) was a
dead end — back to `/about`, scroll to find where you left off, click the
next card. No way to move through topics in sequence.

Added prev/next navigation at the bottom of `app/about/[slug]/page.tsx`,
below the existing "Request Early Access" CTA (kept in its prime
position — the site's actual conversion goal — with "keep reading" as a
secondary path underneath, not competing for the same attention).
Position in `LEARN_TOPICS` (shared with the in-app Learn page and the
`/about` card grid — same file, same order) drives both links: a
"← Previous" card when not on the first topic, and either a "Keep
Reading" card to the next topic's `shortName`, or — on the last topic —
a "You've read them all → Back to Overview" link, closing the loop back
to `/about` rather than wrapping around to the first topic again (a
deliberate stopping point, not a forced loop).

Live-verified locally across all three states: first topic
(`equipment-setup`) shows only "Keep Reading → Temperature Prediction";
middle topic (`temperature-prediction`) shows both "← Previous →
Equipment Setup" and "Keep Reading → Weight Plan"; last topic
(`over-under`) shows "← Previous → Self-Correcting Network" and "You've
read them all → Back to Overview". `tsc --noEmit` and `next build` both
clean.

### Cards tab: some flip-cards render stuck at half height on first load (2026-08-20)

User report (screenshot from a real device): on the Terminals sub-tab,
some cards showed only their top half (name/city, with the card-number/
expiration row missing) — tapping the card to flip it always fixed it,
and flipping back left it rendering correctly from then on.

**Root cause**: `FlippableCard.tsx` (shared by Terminals/Badges/
Credentials — front and back are absolutely positioned for the 3D flip,
so neither can report its own height; a pair of off-screen clones measure
it instead) applies the measured height through
`transition: "height 360ms ..."` unconditionally, including the very
first time a real height is measured on mount. If that initial
measurement lands while the page is still busy — many cards laying out
at once, terminal/card data still streaming in — the CSS transition can
get interrupted partway, leaving the card's container visibly stuck at a
shorter height than its content actually needs. A user-driven flip
(`flipped` toggling true then false) always fixes it because it forces a
clean, deliberate height transition to a value that's stable by then (the
back face, already fully measured).

**Fixed**: the first non-zero height measurement now applies with
`transition: "none"` (snaps instantly, nothing to interrupt); every
height change after that — an actual flip, or the content itself
changing size — still animates normally via a `settledRef` flag. Also
added a defensive `requestAnimationFrame`-deferred second measurement
pass on mount, in case the very first synchronous read happened before
layout had fully settled (e.g. a web font still swapping in) in a way
the `ResizeObserver` didn't independently catch.

Not live-verified this pass (no authenticated session available from this
side to reproduce the original race) — `tsc --noEmit` and `next build`
both clean. Worth a real check on a real device before considering this
fully closed.

**Follow-up 2026-08-26 — user reported this still happening ("reverted, or
never got fully fixed").** The `transition: "none"` idea from the first
pass was right, but its implementation had a real bug: whether the first
settle counted as "settled" was tracked with `settledRef.current = true`
mutated **during render** (`if (isFirstSettle) settledRef.current = true;`
directly in the component body), which is against React's own rules —
React can invoke a component's render function more than once for the
same eventual commit (an interrupted/restarted render pass under
contention), and that's more likely on exactly the conditions this bug was
reported under: a slower real device with many cards laying out at once.
If a discarded render pass flipped the ref to "settled" before the render
that actually commits ever ran, the *real* first-paint render would see
`settledRef.current` already true and apply the animated (interruptible)
transition anyway — silently reintroducing the original bug on what was,
from the screen, still the very first paint. This fully explains "still
happens, but only sometimes, only on some devices."

**Fixed for real** in `app/planner/cards/FlippableCard.tsx`:
- `settledRef` (a ref mutated inline during render) replaced with
  `hasSettled`, genuine React state, flipped to `true` only from inside a
  proper `useEffect` (a real side effect, guaranteed to run only for
  commits that actually happened) via a `requestAnimationFrame` callback —
  never during render itself.
- The measurement effect itself changed from `useEffect` to
  `useLayoutEffect` — runs synchronously after the DOM commits but before
  the browser paints, so the very first real measurement is applied before
  the user can ever see an intermediate (zero or stale) height, rather
  than racing an already-happened paint. (`useLayoutEffect` already has
  one other precedent in this codebase, `app/marketing/FitHeading.tsx`, so
  this isn't a new pattern for the project.)

Not live-verified this pass either (same reason as above) — `tsc --noEmit`
and `next build` both clean. This is a stronger fix than the first pass
(the render-time ref mutation was a genuine bug, not just an unproven
theory), but still worth a real check on a real device, ideally the exact
one/scenario that showed the bug again, before calling this fully closed.

### ~~Loading modal split into Plan Review + Verify Against BOL~~ (2026-08-26) — Verify Against BOL step reversed 2026-08-27, see below

Multi-turn design conversation with the user, planned via Plan Mode
(approved plan preserved at `wild-discovering-plum.md`). Real workflow
described by the user: pulling up to a rack, seeing a stale-API warning,
walking over to another driver loading nearby, reading a fresher API/temp
off their BOL, and wanting to react to it *before* committing to load —
previously required backing out to the Planner entirely or submitting
blind, since `LoadingModal`'s API/Temp inputs had zero visible effect
until final submission and "Planned Compartments" gallons were read-only.

**Two mechanics were corrected/confirmed mid-planning, not assumed:**
- Compartment gallons edits inside the Loading modal must be **isolated**
  — editing one compartment must never cause siblings to gain gallons to
  compensate. Confirmed via reading `usePlanRows.ts`/`planMath.ts` that
  this is genuinely NOT what the existing compartment-cap-slider/
  `capOverride` path does (it triggers a binary-search reallocation across
  every compartment) — so this needed to be a **new**, separate mechanism,
  applied as a post-hoc override on top of already-computed `planRows`,
  never fed back into `planForGallons`'s allocation.
- The completion flow's `diff_lbs` previously preferred the server's
  number (`res.diff_lbs`, computed from `load_log`'s `begin_load`-time
  frozen DB snapshot) — since Phase 1 can now legitimately move the plan
  away from that snapshot, this would have silently disagreed with the
  recap's already-client-computed `planned_gross_lbs` right next to it.
  Fixed to always compute `actualGross - plannedGross` client-side.

**`app/planner/utils/planMath.ts`** — new `computeActualLbsForLine(gallons,
api, tempF, alphaPerF)`, extracted verbatim from `useLoadWorkflow.ts`'s own
submission-time math so the Loading modal's live weight preview and the
final `complete_load` submission can never drift apart — same function,
one call site each.

**`app/planner/components/ValueEntryOverlay.tsx`** (new) — generalizes
`PlannerControls.tsx`'s inline `capInput` overlay (centered card, 40px
bold input, Cancel/Set) into a shared 1-3-field component. `capInput`
itself now delegates to it (behavior unchanged). Reused for: Phase 1's
compartment-gallons tap (1 field), Phase 1's product API+Temp tap (2
fields), and Phase 2's per-compartment Gallons+Temp+API tap (3 fields).

**`app/planner/page.tsx`** — new `loadingGallonsOverride` state
(`Record<compNumber, gallons>`), applied as a post-hoc override producing
`effectivePlanRows`/`effectivePlannedGallonsTotal`/
`effectivePlannedWeightLbs`, which now feed `useLoadWorkflow` (replacing
the raw `planRows`/`plannedGallonsTotal`/`plannedWeightLbs`) — this alone
makes the recap card (already 100% client-computed) reflect Phase-1
overrides with no other change needed there. Reset to `{}` on every fresh
LOAD tap (`useLoadWorkflow.ts` calls `setLoadingGallonsOverride?.({})`
right after `setProductInputs`, same place/reason). Never persisted to
`compPlan` or presets — more ephemeral than `capOverride`. New
`livePreviewTotalLbs`/`livePreviewGrossLbs`/`livePreviewDiffLbs`, using
`computeActualLbsForLine` + `effectivePlanRows` + `productInputs` — same
math the final submission uses, passed into `LoadingModal` as plain props.
New `verifyBolOpen` state; `CancelLoadSheet`'s `onLogTheLoad` now opens
`VerifyAgainstBolModal` instead of calling `onLoadedFromLoadingModal()`
directly.

**`app/planner/modals/LoadingModal.tsx`** — reframed as a pure pre-loading
"Plan Review" phase (title changed accordingly). "Planned Compartments"
cards are now tappable buttons opening a 1-field gallons overlay, bounded
to `persistedCapForComp(comp)` (the compartment's real configured
ceiling — same "max" precedent `capInput` already used); the live preview
is the non-blocking feedback if an edit pushes gross weight over target.
"API + Temperature" rows restyled to match — tappable cards (no more
always-visible stacked `<input>`s) opening a 2-field API+Temp overlay,
same `setProductApi`/`setProductTemp` underneath. New live weight/diff-
vs-target display block above the Complete button.

**`app/planner/modals/VerifyAgainstBolModal.tsx`** (new) — Phase 2, opened
only via "Log the Load". Keyed **per compartment**, not per product
(confirmed: two compartments of the same product can end up with
genuinely different BOL-corrected values). One row per filled
compartment, tap-to-blow-up via the 3-field overlay (Gallons, Temp, API),
pre-filled from the finalized `effectivePlanRows`/`productInputs` — re-
seeded fresh every time the modal opens, not once at mount, so backing out
via Keep Editing and reopening always reflects the current plan. Confirm
button disabled until every compartment has valid values; calls
`loadWorkflow.onLoadedFromLoadingModal(verifiedByComp)`.

**`app/planner/hooks/useLoadWorkflow.ts`** — `onLoadedFromLoadingModal`
gained an optional `verifiedByComp?: Record<number, VerifiedLoadLine>`
parameter (`VerifiedLoadLine = { gallons, tempF, api }`, now exported).
When present, per-compartment BOL-corrected values are authoritative for
`actual_gallons`/`actual_lbs`/`temp_f` via `computeActualLbsForLine` —
the pre-existing no-arg path (legacy, reading `planRows`+`productInputs`
directly) stays intact as a fallback, not deleted, though `page.tsx` now
always routes through Phase 2 first. **Shared-reading resolution** for
`rack_product_status`'s per-product "last observed" write, when Phase 2
lets two compartments of the same product diverge: computes density
(`computeActualLbsForLine(1, api, tempF, alpha)`) per compartment and
keeps whichever pair is **heavier/denser** — never an average, never
last-write-wins. Confirmed with user as "err cold and heavy," matching
this app's own established safety principle (see the Over/Under Learn
topic: "we'd rather predict the product is colder and denser than it
turns out to be").

**Not in scope for this pass** (flagged, not silently decided): the DB's
raw `load_log.planned_gallons`/`planned_snapshot` stay frozen at whatever
was true the instant LOAD was tapped — `complete_load`'s payload has no
path to update them, and neither is ever surfaced in any current UI (the
recap is 100% client-computed). Treated as an acceptable immutable audit
trail ("what was true at LOAD-tap time"), not a gap to fix here.

**Not live-verified this pass** — this is an authenticated, deeply
stateful flow (equipment + terminal + plan + live `begin_load`/
`complete_load` RPCs) that can't be meaningfully exercised without a real
logged-in session, consistent with this project's own established
practice. `tsc --noEmit` and `next build` both clean throughout. Worth a
real device walkthrough before considering this fully closed: tap LOAD →
adjust one compartment's gallons in Phase 1 and confirm siblings don't
move → adjust a product's API/Temp and confirm the live weight preview
updates instantly → tap Complete → Log the Load → confirm Phase 2 shows
the finalized per-compartment values → correct one compartment's API on a
shared-product pair and confirm the "heavier" one wins in
`rack_product_status` afterward.

**Follow-up same day: direct "Back to Planner" exit on both phases.** User
feedback: getting out of the flow required tapping Complete first to reach
CancelLoadSheet's own Back to Planner row -- not discoverable, and "we
always want a way out regardless of the screen." Both `LoadingModal.tsx`
(Plan Review) and `VerifyAgainstBolModal.tsx` (Verify Against BOL) gained a
new required `onBackToPlanner` prop, rendered as a quiet text button below
the primary Complete/Confirm button. Both wire to the exact same
`handleBackToPlannerNoUpdate` in `page.tsx` that CancelLoadSheet's own row
already used (genuinely undoes the load + re-card, not just a dismiss) --
for the Verify Against BOL wiring, wrapped to also close `verifyBolOpen`
first, since that modal has its own open state separate from
`loadWorkflow.loadingOpen`. The existing paths (backdrop-click/Escape/
Complete → CancelLoadSheet) are untouched -- this adds a direct route, not
a replacement. `tsc --noEmit` and `next build` both clean; not live-
verified this pass, same reason as above.

### Plan slots: presets stopped saving cap overrides, and switching terminals wiped the live plan (2026-08-27)

Two related bugs reported after switching trailers and building out
presets A-E: (1) a cap override set on a compartment inside a preset
didn't survive tapping away to a different preset and back -- the product
selection was right, the cap wasn't; (2) the driver had to reconfigure
their whole plan again at every terminal, despite the 2026-08-06 rework
already making named presets (1-5) terminal-independent by design. Per
explicit direction: extend that same "one setup persists across all
terminals" decision to the live/autosave plan too, not just the named
presets -- "if that ever does really come up [different terminals needing
different products] the driver can do a temporary plan for just that one
terminal... I want to make the onboarding process as simple and
straightforward as possible."

**Bug 1, straightforward**: `buildSnapshot`'s `stripFillLevel` option
(added in the original 2026-08-06 rework, "presets store only the product
selection") dropped `capOverride` from every compartment before saving a
named preset -- a deliberate call at the time, but directly contradicted
by this new ask, and inconsistent with the CG reversal that had already
walked back the same "presets are lean" philosophy once (2026-08-04, see
"Presets rework" above). Removed `stripFillLevel` entirely --
`buildSnapshot` now always saves the full `compPlan` (product + cap
override), for every slot.

**Bug 2, a real architecture gap, not a config toggle**: named presets
(1-5) were already combo-scoped/terminal-independent in
`usePlanSlots.ts`, but slot 0 (the "live" plan -- what's actually on
screen, autosaved every 350ms) was still terminal-scoped, exactly as it
had been since before that rework. Two effects in `usePlanSlots.ts` react
to `selectedTerminalId` changing by re-reading and force-applying
whatever slot 0 draft was saved *for that specific terminal* -- often
empty, or old unrelated content from an earlier session at that terminal
-- silently overwriting whatever was currently on screen, including a
preset the driver had just tapped moments before. This is what actually
produced "I have to save them all over again at every terminal": it was
never that presets forgot their content, it's that switching terminals
kept swapping the live plan out from under them via this separate,
terminal-scoped slot-0 mechanism.

**Fixed** by extending the same combo-only scoping presets already had to
slot 0: `planScopeKey` (previously `user:terminal`) is now
`user:combo`, and `planStoreKey`, `scopeFor`, `serverFetchSlots`,
`canUseSlot`, and `loadFromSlot` were all simplified to treat every slot
(0 through 5) identically -- terminal_id pinned to the same
`UNIVERSAL_SCOPE` sentinel presets already used, combo_id real. The
"restore slot 0" effect's dependency changed from
`[selectedTerminalId, planScopeKey]` to `[selectedComboId, planScopeKey]`
(now combo-based) and its `raw.terminalId === selectedTerminalId` gate
was removed entirely -- it now only fires on a genuine combo change (or
fresh mount), never on a terminal switch, so tapping between terminals
mid-session no longer touches the live plan at all. `serverFetchSlots`
collapsed from two separate queries (slot 0 by real terminal+combo,
presets 1-5 by combo) into one query covering all six slots at
`terminal_id = UNIVERSAL_SCOPE`. The `selectedTerminalId`/`terminalId`
that remain in the file (autosave gate, snapshot metadata field,
`parsePlanPayload` fallback) are all now purely informational or
readiness gates, not scope-determining.

**Known, accepted one-time transition**: existing users' current
terminal-scoped slot-0 local/DB rows become orphaned by this change (never
read again) -- their in-progress live plan may appear empty once after
this ships, then behave correctly (combo-scoped) from then on. Nothing
structurally important is lost (an in-progress, uncommitted draft, not
completed load data), and this mirrors the same kind of one-time
transition the original 2026-08-06 presets rework itself went through.

Not live-verified this pass (no authenticated session available from this
side) -- `tsc --noEmit` and `next build` both clean.

### Verify Against BOL step removed -- "Log the Load" goes back to submitting directly (2026-08-27)

Per explicit user direction, one day after shipping: "I don't know what I
was thinking. That last verification step is unnecessary. If I set the
plan and get out and load then jump back in to verify I can just do it in
the same plan phase so tapping log the load should just do what it did
before, no extra verify screen." The Plan Review phase's own tap-to-edit
compartment gallons and product API/Temp (still fully intact, see above)
already covers the real workflow this whole feature was built for --
reacting to a fresher BOL reading before committing to load -- so the
extra confirm-after-the-fact step was solving a problem Plan Review
already solves, just one screen later than necessary.

**Removed entirely, not just hidden**: `app/planner/modals/VerifyAgainstBolModal.tsx`
deleted outright (matches this project's own precedent for genuinely
unreachable code, e.g. `FleetCredentialsModal.tsx`'s removal -- no reason
to leave a dead modal file around). `page.tsx`'s `verifyBolOpen` state and
the modal's mount were removed; `CancelLoadSheet`'s `onLogTheLoad` reverted
to calling `loadWorkflow.onLoadedFromLoadingModal()` directly (no argument)
-- exactly its pre-Phase-2 behavior. `useLoadWorkflow.ts`'s
`onLoadedFromLoadingModal` lost its `verifiedByComp` parameter and the
`VerifiedLoadLine` type entirely -- both branches it introduced (the
per-compartment BOL-authoritative actual-value path, and the "err cold and
heavy" heaviest-density collapsing for `product_updates`) were only ever
reachable from the now-deleted modal, so removed rather than left as dead
`if (verifiedByComp)` branches that could never actually run.

**Everything from the Plan Review half of the original change stays**:
tappable compartment gallons and product API/Temp cards (`ValueEntryOverlay`),
the live weight/diff-vs-target preview, the isolated `loadingGallonsOverride`
mechanism in `page.tsx`, and the `diff_lbs` client-computation fix (still
correct and still needed -- unrelated to Phase 2's existence, it was about
Phase 1 alone being able to move the plan away from `begin_load`'s frozen
DB snapshot). `computeActualLbsForLine` in `planMath.ts` is also still
used, by both the live preview and `onLoadedFromLoadingModal`'s own
(reverted-to-original) submission math.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass
(same reason as every authenticated-flow change this session).

### My Terminals modal showed a raw "JWT issued at future" error (2026-08-27)

User screenshot: `MyTerminalsModal.tsx`'s error banner showed the literal
string "JWT issued at future" -- a raw GoTrue (Supabase Auth) rejection,
not app copy. Root cause of the underlying error: the device's own clock
being set ahead of real time, which makes every request's JWT look like
it was "issued in the future" from the auth server's perspective and get
rejected -- a device-side problem, not something this app's code can fix
directly (told the user to enable automatic date & time on their phone).

**But the app-side bug is real and worth fixing regardless**:
`useTerminals.ts` sets `termError`/`catalogError` directly from
`error.message`/`e?.message` at every Supabase call site, and
`MyTerminalsModal.tsx` renders that string verbatim in a red banner --
any raw Supabase/PostgREST/GoTrue error, not just this one, would leak
straight to the screen. Added a `friendlyErrorMessage(raw, fallback)`
helper (matches known patterns like `issued at future`/`clock skew` to a
plain "your device's clock looks wrong..." message with an actual next
step, falls back to the original message for anything unrecognized --
better an unfamiliar-but-real error shown than one silently swallowed)
and wired it into every `setTermError`/`setCatalogError` call in the
file. Purely a display-layer fix -- doesn't change what triggers an
error, only how it reads.

Not live-verified this pass (no authenticated session available from
this side, and this specific error only reproduces with a genuinely
misconfigured device clock) -- `tsc --noEmit` and `next build` both
clean.

### Terminal outage banners: Out of Product + Out of Allocation (2026-08-27)

Planned via Plan Mode (approved plan preserved at
`wild-discovering-plum.md`) after a design conversation referencing an
earlier "terminal flagging/allocation" idea from a different session.
Real gap: if a driver arrives and the rack is genuinely out of a product,
or the terminal caps them below their planned gallons, there was no way
to warn other drivers heading to the same place -- the Terminal tab's
existing `rack_product_status.is_out` flag (STUD button) is a quiet,
persistent status a driver has to go looking for, not something that
surfaces proactively.

Two decisions made with the user before writing the plan (asked, not
guessed): **reuse `rack_product_status.is_out`** as the real Out-of-
Product flag rather than a fully separate system (so the Terminal tab
never disagrees with the banner), and a **split-load safety requirement**
the user raised unprompted -- a load can carry multiple products across
compartments, so tapping "Out of Product" must never blindly flag every
planned product just because one was actually unavailable. Both report
types open a checkbox picker over the load's own planned products instead
of a single blind action.

**Out of Product**: terminal-wide, visible to any driver at any company
heading to that terminal. Reuses `rack_product_status.is_out` (keeps the
Terminal tab in sync) plus a new lightweight report log for banner
attribution/timing that table doesn't carry. Behaves like "Back to
Planner" once submitted -- the driver got nothing, so the load is undone
and the terminal card reverted.

**Out of Allocation**: the terminal capped the driver below their planned
amount -- company-scoped (only same-company drivers heading to that
terminal see it). Posts its report but leaves the sheet's normal choices
(Log the Load / Update Card) available afterward, since the driver can
still adjust actual gallons in Plan Review and log what they did get.

Both clear on the same schedule: 6am/12pm/6pm/12am terminal-local
(confirmed with the user -- not a rolling 6-hours-from-post expiry, even
though "every 6 hours" and "4 fixed times a day" describe the same
interval).

**New migration** (not yet applied --
`supabase/migrations/20260828000000_terminal_outage_reports.sql`):
`terminal_outage_reports` (terminal_id, rack_id nullable, product_id,
report_type check-constrained to `'out_of_product'|'out_of_allocation'`,
company_id, reporter_user_id, truck_label snapshot, created_at). RLS:
Out-of-Product rows readable by anyone (matches `rack_product_status`'s
own wide-open precedent); Out-of-Allocation rows only by
`company_id = get_active_company_id()`. Insert is self-attributed only
(`reporter_user_id = auth.uid()`, `company_id = get_active_company_id()`)
-- can't spoof another user or company. No update/delete policy --
"clearing" is done by filtering `created_at` against the clearing
checkpoint in the read query, not by deleting rows (same pattern as the
still-unapplied orphaned-`load_log` cleanup migration already in this
repo); a periodic sweep to actually remove old rows is a reasonable later
addition, not needed now since the table stays small. Deliberately
doesn't store the composed message text, company prefix, or driver
initials -- only IDs + a `truck_label` snapshot; the banner resolves
`company_id`→name and `reporter_user_id`→display name at read time,
matching this app's existing "resolve names after finding IDs" pattern
(e.g. the trainee banner).

**`app/planner/utils/rack.ts`** (new) -- `resolveEffectiveRackId`,
extracted verbatim from `useLoadWorkflow.ts`'s own inline rack-fallback
snippet (2026-08-13's rack_product_status write-through fix) so it has
one implementation instead of being copied a second time for the new
Out-of-Product report path. `useLoadWorkflow.ts` now calls the shared
helper instead of its own inline copy -- behavior unchanged.

**`app/planner/utils/dates.ts`** gained `mostRecentClearingCheckpoint`
and `hhmmInTimeZone` -- both timezone-aware (same
`Intl.DateTimeFormat`-with-`timeZone` approach `useTerminals.ts`'s
`isoTodayInTimeZone` and `LoadingModal.tsx`'s `fmtLastApiLine_` already
use), converting a terminal's wall-clock local time to/from a real UTC
instant via the standard "format a guess, measure its offset, correct"
trick (JS has no native zoned-time conversion) -- accurate except within
a couple hours of a DST transition, an acceptable approximation for a
banner clearing schedule.

**`app/planner/hooks/useTerminalOutageReports.ts`** (new) --
`submitOutageReport(...)` (plain async function, not a hook -- called
from `page.tsx`'s new `handleSubmitOutageReport`, itself wired into
`CancelLoadSheet`'s new flow) does the `rack_product_status` upsert (Out
of Product only) + `terminal_outage_reports` insert, one row per selected
product. `useActiveOutageBanner(terminalId)` polls every 30s (matching
the existing trainee-banner precedent in `page.tsx`), resolves the
terminal's own timezone directly (rather than depending on whichever
tab's `useTerminals()` instance happens to be mounted, since this banner
renders in the shared header across every tab, not just the Planner),
filters to reports newer than the current clearing checkpoint, resolves
product/company/reporter names, and composes one joined ticker string.
RLS alone narrows Out-of-Allocation rows to the caller's own company, so
no extra client-side company filtering was needed on top of that --
simpler than the plan's original `activeOutageBanner(terminalId,
companyId)` signature.

**`app/planner/components/CancelLoadSheet.tsx`** reworked into a
stateful, multi-mode sheet (`"menu" | "reportType" | "reportProducts"`),
same pattern `PresetActionSheet.tsx` already established. New "Report
Terminal Issue" row on the main menu leads to an Out of Product / Out of
Allocation choice, then a checkbox picker over the load's own planned
products (deduped, same grouping `LoadingModal.tsx`'s own `productGroups`
already does), a "Submit Report" button gated on at least one selection,
and inline busy/error states matching `RackProductStatusModal.tsx`'s own
pattern. Stays presentational -- no direct Supabase calls -- calls the
new `onSubmitOutageReport` prop and branches on the result exactly as
decided: Out of Product closes the sheet and fires `onBackToPlanner()`;
Out of Allocation returns to the normal 3-choice menu.

**`app/planner/components/TerminalOutageBanner.tsx`** (new) -- mounted in
`CalculatorLayoutClient.tsx`'s `ShellChrome`, between `<Header/>` (nav
menu + tab bar) and the scrollable tab content, so it's visible across
every tab, not just the Planner. Renders nothing when there's no active
report for the current terminal. Scroll uses `left` (percentages relative
to the containing block's width) on an absolutely-positioned child rather
than `transform: translateX` (whose percentages are relative to the
element's own width, which would make "start fully off-screen" unreliable
for a short message) -- a CSS `@keyframes` animation with a held-flat
stretch partway through for the "scroll, pause, continue" behavior asked
for, looping continuously. Multiple simultaneously-active reports for the
same terminal join into one ticker string (not a rotating carousel).

**Message formats** -- Out of Product: `{company3} {truckLabel} - Out of
{productName} @ {hhmm}hr` (drops the literal word "Terminal" per the
user's own "maybe unnecessary" call -- easy one-line revert if wanted
back). Out of Allocation: `{driverInitials} {truckLabel} OOA {productName}
@ {hhmm}hr`.

**Not in scope for this pass** (flagged, not guessed): no entry point for
reporting an outage before ever tapping LOAD (a driver who finds zero
product and never starts a load at all) -- the user scoped this
explicitly to the post-Complete sheet; no periodic DB row deletion; no
rate-limiting/dedup of repeated/overlapping reports for the same
terminal/product.

Not live-verified this pass -- migration not yet applied, and this is an
authenticated, cross-account flow (posting from one driver, reading from
another) that can't be meaningfully exercised without two real logged-in
sessions at different companies, consistent with this project's own
established practice for this class of change. `tsc --noEmit` and `next
build` both clean throughout. Manual walkthrough once shipped: complete a
load → tap Complete → Report Terminal Issue → Out of Product → pick one
product → Submit → confirm the load is canceled/card reverted AND the
banner appears for that terminal; separately confirm a same-company Out
of Allocation report shows for a teammate but an Out of Product report
from a different company still shows too (cross-company), while a
different company's Out of Allocation report does not.

**Live-verified 2026-08-28**: user applied the migration and confirmed
the report flow works end-to-end (product picker → submit → error
surfaced correctly the one time the table didn't exist yet, then worked
once applied).

**Follow-up same day -- placement, styling, tap-to-detail + Clear
Issue.** Three asks: move the banner from between Header and the tab
content up into Header itself (above the tab bar, below the icon row);
restyle from a bordered/backgrounded strip to plain red text on the
header's own gradient; make it tappable (a trailing "›" chevron, the same
affordance this app already uses everywhere else for "this row opens
something" -- `SettingsModal.tsx`, `EquipmentModal.tsx`, etc.) to open a
detail view with each report's expiry time and a way to resolve it early.

- `TerminalOutageBanner` moved from `ShellChrome` (between `<Header/>`
  and the scrollable content) to inside `Header` itself, between the
  icon row and `<TabBar/>` -- no longer takes vertical space away from
  the page content area, sits in the header band instead.
- Ticker restyled: no background/border chip, `#f87171` text directly on
  the gradient, wrapped in a `<button>` (ticker area + trailing chevron)
  that opens the new `app/planner/modals/TerminalOutageDetailModal.tsx`.
- **`useActiveOutageBanner`** now also returns a structured `reports:
  ComposedOutageReport[]` (not just the joined ticker string) plus the
  resolved `timeZone` and a `refresh()` -- each report carries its own
  `expiresAtMs` (via new `nextClearingCheckpoint` in `dates.ts`, the
  checkpoint *after* `created_at` rather than the most-recent one before
  now) and `canClear` (`reporter_user_id === effectiveUserId` -- the same
  identity `submitOutageReport` wrote the row under, so it stays correct
  under admin impersonation).
- **New `clearOutageReport(reportId)`** — a plain delete, letting a
  driver resolve their own report early instead of waiting for the next
  checkpoint. New migration
  `20260829000000_terminal_outage_reports_delete_policy.sql` (**not yet
  applied**) adds one additive DELETE policy, `reporter_user_id =
  auth.uid()` -- deliberately reporter-only, not company-staff-wide (a
  broader "any admin can clear any report" moderation capability is a
  real, separate product decision, not guessed at here). The detail
  modal only renders a Clear Issue button on reports where `canClear` is
  true; a stray delete call against someone else's report would just
  affect 0 rows under RLS either way.

Not live-verified this specific follow-up (the DELETE migration isn't
applied yet, and the reposition/restyle wants a real device look) --
`tsc --noEmit` and `next build` both clean.

**Follow-up same day: brighter ticker color + a real question instead of
guessing what happens to the terminal card on Out of Product.** Two asks:

- Ticker text/chevron went from `#f87171` to a brighter `#ff3b30`.
- **The real one**: Out of Product's product picker used to submit
  straight into `onBackToPlanner` (cancels the load AND reverts today's
  terminal access date to whatever it was before this LOAD tap) the
  instant the report posted. Per explicit direction ("it is safe to
  assume I didn't get loaded... after selecting the products to report
  on, the next question is did my access card get renewed when I carded
  in or is this one of the terminals that requires a BOL") -- the load
  being canceled is certain, but whether the card ALSO reverts genuinely
  isn't: some terminals renew access the instant a driver checks in,
  others only renew it once a BOL is presented, which a driver who never
  loaded doesn't have. Guessing either way would be wrong for real
  terminals on the other branch.

  New `"cardRenewal"` mode in `CancelLoadSheet.tsx`, shown after a
  successful Out of Product report instead of closing immediately: "Did
  your card renew?" / "Some terminals renew your access the moment you
  check in. Others only renew it once you present a BOL -- which you
  won't have today." -- two buttons, "Yes, It Renewed" and "No, This
  Terminal Requires a BOL". Both route to props that **already existed**
  and already encoded exactly these two outcomes -- "Yes" reuses
  `onUpdateCardOnly` (cancels the load, leaves today's re-card alone,
  identical to tapping that row from the main menu), "No" reuses
  `onBackToPlanner` (cancels the load AND reverts the card) -- so no new
  page.tsx wiring was needed, just a new question routing to logic that
  was already correct for each case. Out of Allocation's own flow
  (return to the normal 3-choice menu) is untouched -- a capped-but-
  partial load is a different situation, the driver likely got something
  and may still want to log it.

Not live-verified this pass either -- `tsc --noEmit` and `next build`
both clean.

**Follow-up same day: ticker rework -- constant speed, per-message pause,
most-recent-only dedup, split into two rows.** Real feedback after
watching it scroll: speed visibly changed mid-animation (fast while
entering, slow during the exit stretch, since both phases traveled very
different container-relative percentage distances in the same fixed
18s), multiple reports for the same terminal all got crammed into one
joined string with no natural read-then-continue rhythm, and Out of
Product/Out of Allocation messages were visually mixed together despite
being semantically different (cross-company vs. company-only). Also
asked, and answered directly rather than guessed: "multiple entries
should resolve to the most recent" -- if several drivers report the same
product out, only the latest report shows, not a growing list of
duplicates.

**`MessageTicker.tsx`** (new, generic, reusable) replaces the old CSS
`@keyframes`-based scroll entirely -- percentage keyframes can't express
"constant pixels/second regardless of message length" or "cycle through
N messages, each with its own enter → pause → exit," without hardcoding
a message count into the animation itself. Runs one
`requestAnimationFrame` loop per mount that writes `transform:
translateX(...)` directly to the DOM (not React state, so it isn't
re-rendering 60x/sec) -- each message enters from fully off-screen-right
at a fixed `SPEED_PX_PER_SEC`, pauses for `PAUSE_MS` once its beginning
reaches a fixed left inset (the literal "pause at the beginning of each
message" ask), then continues at the SAME speed until fully off-screen
left, then starts the next message (looping back to the first, including
correctly re-looping a single message forever -- the loop restarts
itself internally rather than depending on React re-triggering the
effect on an unchanged message).

**`useTerminalOutageReports.ts`**'s `useActiveOutageBanner` now dedupes
fetched rows to the most recent per `(report_type, product_id)` before
composing anything (rows already come back newest-first, so "keep the
first one seen per key" is exactly "resolve to the most recent") --
applies identically to Out of Product (cross-company) and Out of
Allocation (company-scoped via RLS), matching the explicit "same for
allocation" follow-up. Returns two separate message arrays
(`productMessages`/`allocationMessages`) instead of one joined string.

**`TerminalOutageBanner.tsx`** now renders two independent `MessageTicker`
rows stacked vertically -- Out of Product on top, Out of Allocation below
-- per explicit direction ("we could put product on its own banner above
and below") instead of trying to visually space out a single mixed
ticker. Either row is still tappable (same trailing "›" chevron) and both
open the same shared detail modal. `TerminalOutageDetailModal.tsx` split
its flat report list into two labeled sections ("Out of Product" / "Out
of Allocation") to match.

Not live-verified this pass (the animation timing/feel in particular
wants a real device look, not just a typecheck) -- `tsc --noEmit` and
`next build` both clean.

### Recall Last Load: missing compartment caps + not scoped to the current terminal (2026-08-28)

User report: loaded Preset B (which now correctly saves `capOverride`,
see the 2026-08-27 fix above), switched terminals a few times, then
tapped "Recall Last Load" -- the caps were gone, product selection was
right. Tapping Preset B again brought the caps right back, confirming
they really were saved correctly; the bug was specific to the recall
path.

**Root cause**: `usePlanSlots.ts`'s `fetchLastLoadFromLog()` (the shared
function behind the passive slip-seat pre-fill, `refreshLastLoad`, AND
`recallLastLoad`) reconstructs `compPlan` from `load_lines` after a real
completed load, but only ever set `{ empty, productId }` per compartment
-- `capOverride` was never included at all, for any of its three callers.
This isn't a stored column gap (capOverride is planning-time-only, baked
into the allocation that produces `planned_gallons` at `begin_load` time,
never persisted as its own value) -- there was simply no code path
restoring it. Fixed by setting `capOverride: Math.round(planned_gallons)`
per compartment when reconstructing -- pinning the recalled cap to
exactly what was actually loaded is what makes "recall last load"
actually reproduce the same load again, and is the only available signal
for "what ceiling applied here" since no explicit cap value is stored.

**Second, separate ask**: "if I tap recall last load, it should recall
the last load for the terminal selected" -- the query behind
`recallLastLoad` had no terminal filter at all (`fetchLastLoadFromLog`
only ever filtered by `combo_id`), so it always returned the most recent
completed load anywhere, regardless of which terminal was currently
selected. `fetchLastLoadFromLog` gained an optional `{ terminalId }`
param; only `recallLastLoad` passes it (`selectedTerminalId`) -- the
passive slip-seat pre-fill (on combo claim) and `refreshLastLoad` (post-
completion residue refresh) are both deliberately left unscoped, since
those exist to answer "what's currently in this equipment," which is
legitimately terminal-independent, not "what did I load here." If this
combo has never completed a load at the currently selected terminal, the
button now correctly does nothing (same silent no-op already in place
for "no completed load exists at all") rather than falling back to some
other terminal's load.

Also added `selectedTerminalId` to `recallLastLoad`'s own `useCallback`
dependency array -- it's now a real input to the function, and omitting
it (the file's existing lint-suppressed pattern for several of these
callbacks) would have meant a driver switching terminals without any
other listed dependency changing could still be holding a stale closure
over the PREVIOUS terminal.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

**Follow-up same day: the fix above didn't actually fix it -- root cause
was reading the wrong column, plus a second, separate dial-highlight
bug.** User's next real test: standing on Preset C, tapped Recall Last
Load -- compartments correctly switched to reflect the recalled load's
products, but the caps were STILL wiped, and the dial stayed on C
instead of moving to whichever preset the recalled load actually came
from.

**Caps, real root cause**: the first pass reconstructed `capOverride`
from `load_lines.planned_gallons` -- but that column is written once at
`begin_load` time, BEFORE any Plan Review Phase-1 gallons adjustment a
driver might have made before tapping Complete. The true final figure
lives in `actual_gallons`, written separately by `complete_load`. Reading
`planned_gallons` could reconstruct the WRONG cap (or, whenever it
happened to equal the natural uncapped allocation, no visible cap at
all) -- which is exactly why the first fix looked like it did nothing.
Fixed by selecting `actual_gallons` too and preferring it
(`actual_gallons ?? planned_gallons`, falling back only for an older load
from before `complete_load` started writing that column).

**Dial highlight, a second, unrelated bug**: `page.tsx` already had a
mechanism syncing the preset dial's highlighted letter to
`loadReport.plan_slot` -- but it was guarded to fire only ONCE per
session (`presetDialSyncedRef.current`) and only while
`lastLoadedSlot == null`, i.e. only for the passive fresh-mount restore,
before any preset had ever been tapped. Once the driver had already
tapped Preset C earlier in the session, `lastLoadedSlot` was no longer
null, so that guard silently blocked the sync forever afterward --
including for the explicit "Recall Last Load" button, which is a
distinct, deliberate action that should always re-sync the dial,
independent of that one-time guard. Fixed directly in the button's own
`onClick`: when `recallLastLoad()` returns a report with a real
`plan_slot`, it now sets `lastLoadedSlot`/`activeSlotLetter`/
`presetDialSyncTo` itself, rather than relying on the passive effect.

Not live-verified this pass either -- `tsc --noEmit` and `next build`
both clean.

**Follow-up same day: still wrong -- every compartment showed a cap,
including ones that were never capped.** User's next report: recalled a
load that used Plan B, which normally only caps compartments 1 and 2 --
every compartment came back with a cap. Root cause, finally correctly
diagnosed: reconstructing `capOverride` from `load_lines` gallons AT ALL
was the wrong approach, not just which column it read from. A natural
(uncapped) allocation and a real cap produce indistinguishable numbers
after the fact -- there's no way to tell, from gallons alone, which
compartments were genuinely capped and which just happened to fill to
that amount.

**The actual fix**, per the user's own framing ("the idea is to recall
the last load exactly the way it was loaded using the same plan"):
`load_log.plan_slot` already records which named preset (1-5) was active
when the load began, and that preset -- since presets have saved full
`capOverride` correctly since the 2026-08-27 fix -- IS the exact plan
that was used. `fetchLastLoadFromLog()` now reads that preset directly
(`readSlot(presetSlot)`, the same local-cache read `loadFromSlot`/
`peekSlot` already use) when `plan_slot` points to one with real saved
content, and uses ITS `compPlan` verbatim instead of reconstructing
anything from `load_lines`. The `load_lines`-based reconstruction is kept
as a fallback only for loads with no `plan_slot` at all, or whose preset
has since been cleared/overwritten -- an approximation, same caveat as
before, but only reached in that narrower case now. CG/target-actual-diff
still come from `load_log` itself (the true values for that specific
load), unaffected by this change -- only the product+cap portion switched
sources.

**Known limitation, not fixed**: this reads the preset from local cache,
which could theoretically not be synced yet on a very fresh page load
(before the server pull effect completes) -- in that narrow race, it
would silently fall back to the approximate reconstruction. Not expected
to matter in practice (mid-session use, after presets have already
synced), flagged rather than built around.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

**Follow-up same day: recovered points missing from the recalled load's
running-average card.** With caps/dial both confirmed fixed, one last
gap: the Planner's "This Load" points figure (bottom-left of the
incentive running-average card) was blank after a recall.
`fetchLastLoadFromLog()`'s `loadReport` object never included
`recovered_points` at all -- not a bug in the caps/dial sense, just a
field that was never populated for any of this function's three callers,
since `calculate_load_points` only ever runs live at real completion time
(`useLoadWorkflow.ts`) and there's no column on `load_log` itself holding
the result. Fixed by summing `load_points.recovered_points` for the
load's `load_id` (one row per compartment/product on a split load, same
"sum per load" pattern `PayrollReportModal.tsx` and the running-average
card itself already use) -- zero rows (incentives were off, or no
benchmark matched) stays `null`, not `0`, so a genuine "earned zero
points" load isn't confused with "never calculated."

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

**Follow-up same day: the dial-highlight fix from earlier in this same
thread still didn't actually work.** User's next test: recalling a Plan
B load while on Plan C correctly changed the compartments and now showed
the right points -- but the dial itself stayed on C.

**Real root cause, one level deeper than the earlier fix**:
`page.tsx`'s `setActiveSlotLetter(report.plan_slot)` (added in that
earlier pass) updates page.tsx's OWN bookkeeping state, but
`PresetDial.tsx`'s visually-highlighted letter is a fully separate,
internal `active` useState that page.tsx has no direct control over --
the only channel INTO it is the one-shot `syncTo` prop. That prop was a
bare `number`, gated by an `appliedSyncRef.current === syncTo` guard
inside `PresetDial.tsx` meant to stop a redundant re-sync. This broke in
two compounding ways for a SECOND sync request to the SAME slot number
(e.g. recalling a load that used the same preset twice in one session,
or recalling after the passive mount-time sync had already landed on
that same slot once): (1) if `presetDialSyncTo` was already `2`, calling
`setPresetDialSyncTo(2)` again is a no-op to React itself -- an
unchanged primitive value never triggers a re-render for that state, so
the `syncTo` PROP passed to `PresetDial` never even changes, and the
child's `useEffect(..., [syncTo])` never re-runs at all; (2) even if it
had re-run, the `appliedSyncRef` guard would have blocked it a second
time regardless.

**Fixed** by changing `syncTo` from `number | null` to `{ slot: number }
| null`, with every setter constructing a **fresh object literal** on
each call (`setPresetDialSyncTo({ slot: n })`) rather than reusing/
reconstructing an equal value -- a new object reference is never `===` a
previous one, so React always re-renders `PresetDial` with a genuinely
different `syncTo` prop, and the effect's own `[syncTo]` dependency
always sees it as new. This also makes the `appliedSyncRef` guard
unnecessary (removed) -- there's nothing left to dedupe once every
legitimate sync request already arrives as its own unique object.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

### Recall Last Load: handling a terminal's last load done in different equipment (2026-08-28)

User raised a real gap proactively (not a bug report): "Recall Last Load"
is combo-scoped (see the terminal-scoping fix above), so if the terminal's
last load was actually done in DIFFERENT equipment than what's currently
selected, that combo-scoped query correctly finds nothing -- today this
was a silent no-op, not a wrong result, but also not helpful. Proposed
fix, confirmed via two quick scope questions before building (asked, not
guessed, since one of them touches real equipment-claiming semantics):
search the driver's own load history (not any combo in the company) for
a match, and if found, show a warning offering to switch equipment and
recall, or cancel.

**Search scope**: the driver's own `load_log.user_id` history at this
terminal, not any combo company-wide -- keeps "recall" personal to the
driver using it, doesn't surface another driver's activity.

**Switch behavior**: claims the other combo directly, no extra
confirmation step beyond the one warning sheet already asks -- reuses
`EquipmentModal.tsx`'s own `handleClaim` RPC call verbatim
(`supabase.rpc("claim_combo", { p_combo_id })`) rather than reinventing
equipment-claiming logic inline, so this can't leave the backend claim
state out of sync with what the UI shows.

**`usePlanSlots.ts`**:
- New `findLastLoadAtTerminalDifferentEquipment(terminalId)` -- looks up
  this driver's most recent completed load at the terminal (any combo),
  skips it if it's actually the SAME combo already selected (nothing
  "different" to report), resolves truck/trailer labels via
  `equipment_combos`/`trucks`/`trailers`.
- `recallLastLoad`/`fetchLastLoadFromLog` both gained an optional
  `comboId` override. Needed because after claiming the other combo,
  `equipment.setSelectedComboId(...)` hasn't propagated through a
  re-render yet -- this hook's own memoized `planStoreKey`/`readSlot`
  (closed over the CURRENT `selectedComboId`) would still read/write the
  OLD combo's local-storage keys if called immediately afterward. New
  module-level `buildPlanStoreKey`/`buildLegacyPresetKey` (pulled out of
  the memoized `planStoreKey` so there's one formula, not two) let both
  the preset lookup and the slot-0 write target the override combo
  directly, without waiting on the render.

**New `app/planner/components/RecallDifferentEquipmentSheet.tsx`** --
same graphite bottom-sheet pattern as `CancelLoadSheet.tsx`/
`PresetActionSheet.tsx`. "Switch to {truck} & Recall" / "Cancel."

**`page.tsx`**: `handleRecallLastLoad` tries the normal (current-
equipment) recall first; only on a miss does it check for a different-
equipment match and show the sheet. `handleSwitchAndRecallEquipment`
claims the combo, refreshes the equipment list, selects it, then calls
`recallLastLoad({ comboId })` with the explicit override. Both paths
converge on a shared `applyRecalledReport` (pushes the report into
`loadWorkflow` + syncs the preset dial), extracted from the inline
handler the previous two fixes had built up, since the switch-and-recall
path needed the exact same "apply the result" logic.

Not live-verified this pass -- this needs a real account with load
history at the same terminal under two different equipment combos to
exercise, which isn't available from this side. `tsc --noEmit` and `next
build` both clean.

**Follow-up same day: button showed the trailer being switched to too**
-- the confirm button only ever read "Switch to {truck} & Recall,"
silently dropping the trailer. Now shows both (`Switch to {truck} /
{trailer} & Recall`), and the description bolds the pair for a clearer
at-a-glance comparison.

### Fresh mount snaps to the last casually-browsed terminal, not the last real load (2026-08-28)

User found this while testing the different-equipment recall feature
above: switched to a terminal they knew they'd used different equipment
at, purely to test -- refreshing the page afterward kept that
test-browsed terminal instead of returning to wherever their actual most
recent load happened. "Refreshing the page, or closing the app and
reopening, should always open to the most recent load at whatever
terminal the most recent load was."

**Root cause**: `useLocation.ts`'s persisted-location restore
(`protankr_location_v2:{userId}` in localStorage) just replays whatever
state/city/terminal was last SELECTED in the picker, with zero
relationship to real load history -- merely browsing a terminal to look
around (without ever loading there) permanently became "home" until
manually changed again.

**Fixed**: new effect, gated to run once per hydration (same shape as the
existing persisted-location restore it runs alongside), looks up this
driver's own most recent completed load (any equipment -- combo-
independent, matching the literal ask) via `load_log` and, if found,
resolves its terminal's city/state and OVERRIDES whatever the naive
picker-history restore just set. A driver with no load history at all
(brand new, or simply never completed one) keeps whatever the existing
restore already produced -- nothing to override with. Also restores
`selectedRackId` from the load's own `rack_id` when present, so a
multi-rack terminal doesn't need to re-prompt unnecessarily.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

### Save Plan button showed up after Recall Last Load with nothing actually changed (2026-08-28)

Same testing session, second report: recalling a previous load
immediately made the "Save Plan" button appear, even though nothing had
been touched since the recall. Per explicit direction, it should only
appear once the driver actually changes something FROM the recalled
plan (a different product, the CG slider, a cap) -- not for the recall
itself.

**Root cause**: `page.tsx` already has a `captureBaselineNext` mechanism
built for exactly this class of problem -- every OTHER programmatic
plan-load (tapping a preset, the automatic restore on terminal/combo
switch) calls `setCaptureBaselineNext(true)` right after, so the
dirty-check's baseline re-captures against the just-applied plan instead
of whatever was on screen before it. "Recall Last Load" was the one path
that never called it -- `planSlots.recallLastLoad()` applies the
recalled `compPlan`/`cgSlider` same as any other restore, but nothing
told the baseline tracker this was a programmatic load, not a user edit,
so the dirty-check compared the recalled plan against the PRE-recall
baseline and (usually) found a difference immediately.

**Fixed**: `applyRecalledReport` (the shared function both the normal
recall and the switch-equipment-then-recall path already funnel through)
now calls `setCaptureBaselineNext(true)` too, matching every other
programmatic load exactly.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

### Different-equipment recall: the found combo can be stale/decoupled since (2026-08-28)

Live-tested right after shipping: tapping "Switch to {truck}/{trailer} &
Recall" surfaced a raw RPC error, `Combo not found or not active:
<uuid>`. Root cause, confirmed from the screenshot: the OLD test load's
combo paired the current truck with a DIFFERENT trailer that's since
been swapped out -- that specific `equipment_combos` row is no longer
`active` (decoupled), so `claim_combo` correctly refuses it. There's
nothing to switch TO for that specific historical combo_id anymore.

**Fixed** in `findLastLoadAtTerminalDifferentEquipment` -- now also
selects `active` and returns null (same as "nothing found at all") when
the matched combo isn't currently active, instead of offering a switch
button that's guaranteed to fail. Deliberately doesn't search further
back in history for an older, still-active combo at the same terminal --
out of scope for this pass, flagged not built.

Also hardened `handleSwitchAndRecallEquipment`'s error handling in
`page.tsx` for the residual race (decoupled by someone else between the
lookup and the claim attempt) -- a "not found or not active" RPC message
now shows as "That equipment isn't available anymore -- it may have been
reassigned since that load," not the raw error string with a bare UUID.

Live-verified the original bug via the user's own screenshot; the fix
itself not re-verified live this pass -- `tsc --noEmit` and `next build`
both clean.

### Different-equipment recall reversed: never claims equipment, links to Reports instead (2026-08-28)

User caught a real correctness/safety problem with the whole design one
step before it would have shipped for real: "someone else could be
running that equipment now. so switching or decoupling and recoupling or
really anything we do to present the previous load at this terminal
would be problematic." The active-combo check from the immediately-
preceding fix only guarded against a STALE/decoupled combo -- an ACTIVE
combo currently claimed by a different driver would have sailed straight
through `claim_combo`, genuinely yanking that equipment away from
whoever's actually driving it right now, all to satisfy a "let me peek
at my last load" convenience. Confirmed: this was a real, disruptive side
effect risk, not a hypothetical -- reversed entirely rather than patched.

**Removed**: all equipment-claiming from this flow.
`findLastLoadAtTerminalDifferentEquipment` is now a pure read -- no
`active` check needed either (that was only ever load-bearing for the
claim path), returns `loadId` instead of `comboId`.
`recallLastLoad`/`fetchLastLoadFromLog`'s `comboId` override parameter
(added specifically to let the claim-then-recall race avoid waiting for
a re-render) is gone along with the module-level `buildPlanStoreKey`/
`buildLegacyPresetKey` helpers it needed -- both fully reverted back to
their pre-this-feature form now that nothing calls them with an
override. `page.tsx`'s `handleSwitchAndRecallEquipment` (the
`claim_combo` RPC call) is deleted outright, along with the
`altEquipmentBusy`/`altEquipmentError` state it needed.

**Replaced with**: `RecallDifferentEquipmentSheet.tsx` is now a plain
informational sheet -- "View This Load in Reports" (navigates to
`/planner/reports?loadId=...`) or Cancel, nothing else. Reports
(`app/planner/reports/page.tsx`) reads that query param -- directly via
`window.location.search`, not `next/navigation`'s `useSearchParams`
(this repo's own `app/demo/ended/page.tsx` already documents a real
client/server hydration mismatch from that hook's Suspense-based
resolution; no reason to reintroduce it here) -- auto-opens `MyLoadsModal`,
and strips the param via `history.replaceState` once consumed so a later
reload of the same URL doesn't keep re-triggering it.

`MyLoadsModal.tsx` gained `initialExpandLoadId` -- forces the date range
to "All" (the target load could be arbitrarily old, the default 7-day
range would silently exclude it) and auto-expands the load once its row
actually resolves from that fetch, passing its own `planned_snapshot`/
`product_temp_f` into `onFetchLines` the same way a normal manual tap
already does, rather than firing blind before the row exists.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

**Follow-up same day: the deep link now actually filters to that one
load, not just expands it inside the full history.** Per explicit ask
("can the link filter to the specific load in my loads?") --
`initialExpandLoadId` previously only auto-expanded the target row while
still showing every other load in the list around it. New `focusedLoadId`
state in `MyLoadsModal.tsx`, seeded from `initialExpandLoadId` on open:
the `filtered` list shows ONLY that one load while it's set. Two explicit
escapes back to the full history -- typing anything into search clears
it immediately, and a "Showing this load only / Show All Loads" banner
above the search box gives a one-tap exit for a driver who wants to
browse without typing. Kept as separate state from the `initialExpandLoadId`
prop (fixed for the life of this deep-link open) specifically so exiting
focus mode doesn't need page.tsx or the Reports page to know or care.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

### Report Terminal Issue: product checkbox got a real checkmark (2026-08-28)

Per explicit feedback ("hard to tell you selected it... the box on the
right should get a check mark, maybe bright teal") -- the product picker
in `CancelLoadSheet.tsx`'s "Report Terminal Issue" flow (Out of Product /
Out of Allocation) used a plain filled/unfilled square with no glyph,
themed via the driver's own accent color -- which could render pale or
low-contrast depending on that setting, with nothing marking "selected"
beyond a subtle fill. Now a fixed, always-legible `#2dd4bf` (bright teal,
independent of accent/dark-mode settings) box with a real ✓ checkmark
glyph, plus a matching teal-tinted row border when checked instead of
plain white.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

**Follow-up same day: reverted the box redesign, kept a real checkmark
in it.** Per explicit direction ("go back the way it was and just add a
check in the black box... make the check more neon blue") -- the teal
box/border rework above is fully reverted (18x18, `themeFill`-colored
fill when checked, original white-ish border) -- only real change from
the pre-teal version is a `#00c2ff` (neon blue) ✓ glyph rendered inside
when checked, where there was previously no glyph at all.

**Also shipped in the same pass: skip the picker entirely for a
single-product load.** Per explicit ask -- if `productChoices.length
=== 1`, there's nothing to actually choose between, so tapping Out of
Product/Out of Allocation now submits directly for that one product
instead of opening the picker. New `submitReportFor(type, productIds)`
takes both explicit rather than reading `reportType`/`selectedProductIds`
off state, since `selectReportType` needs to submit in the same tick it
sets them (React state isn't synchronously readable that way). On a
submit error, still lands on the picker (pre-selected, error shown) so
there's a normal retry path even though the happy path never shows it.
Multi-product loads are completely unaffected -- always go through the
picker, which is the whole reason it exists.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

**Follow-up same day: Out of Allocation now matches Out of Product
exactly.** Per explicit direction ("it still goes back to the previous
windows to log a load or update card without loading... match the same
logic as the out of product process. Just report it and go back to the
planner") -- this reverses the original 2026-08-27 design call that Out
of Allocation should return to the normal 3-choice menu (reasoning: the
driver might still want to log a partial load). That distinction is
gone -- both report types now go straight to the `cardRenewal` question
after a successful submit and end there, with no path back to Log the
Load/Update Card for either one anymore.

Not live-verified this pass -- `tsc --noEmit` and `next build` both
clean.

### Terminal outage banner: trimmed message text, single-row layout, redesigned detail cards (2026-08-28)

Per explicit follow-up against the banner/modal built 2026-08-27:

- **Ticker text trimmed to just the essentials** -- was
  `"{co} {truck} - Out of {product} @ {hhmm}hr"` / `"{initials} {truck} OOA
  {product} @ {hhmm}hr"`; now just `"Out of {product}"` / `"OOA {product}"`,
  per explicit request ("Just show 'Out of Premium 93' and/or 'OOA
  Premium 93'"). Company/truck/timestamp moved into the detail modal's
  cards instead of living in the scrolling text. Uses the product's own
  `display_name` when set (falling back to `product_name`) for this short
  form -- `useTerminalOutageReports.ts`'s `productShortById` map, alongside
  a separate `productFullById` for the detail card's fuller name (prefers
  `product_name`, falls back to `display_name`).
- **Multiple simultaneous reports on one row now join into a single
  hyphen-separated string** ("Out of Premium 93 - Out of Regular 87"),
  scrolled as one continuous message -- not cycled as separate messages
  with their own enter/pause/exit, which is what `MessageTicker.tsx`
  already did for a `messages` array with more than one entry.
  `TerminalOutageBanner.tsx` now does `messages.join(" - ")` and passes
  that single joined string as a one-element array, per explicit request
  ("Separate each report in the banner by a hyphen").
- **Back to a single-row banner.** The 2026-08-27 version stacked Out of
  Product above Out of Allocation as two independent rows; per explicit
  follow-up ("put them back on the same row and remove space below so the
  banner splits right between the tabs and nav hamburger"), `TickerHalf`
  now renders both halves side by side in one 22px-tall flex row (a thin
  vertical divider between them only when both are active), with no extra
  top/bottom padding on the wrapping div -- the banner is exactly one thin
  strip between the icon/hamburger row and the tab bar, not two. Whichever
  half has no active reports isn't rendered at all (not an empty
  placeholder), so a single active report type naturally takes the full
  row instead of leaving blank space next to it.
- **Detail modal cards restyled to the app's own graphite theme, not the
  red-tinted treatment** -- per explicit request ("the cards should match
  our app theme instead of that red hue"). `TerminalOutageDetailModal.tsx`'s
  `ReportRow` now uses `cardTheme.ts`'s `CARD_BG`/`CARD_BORDER`/
  `CARD_SHADOW` (the same graphite gradient every other card in the app
  uses), and is restructured into 3 rows: `"{company or driver} Truck
  {unit}"` (full name, not the old 3-letter/initials abbreviation --
  e.g. "Gemini Truck 25184" instead of "Gem 25184"), then
  `"Terminal Out of {product}"` (Out of Product) or `"OOA {product}"` (Out
  of Allocation) using the fuller product name, and a third row combining
  "Marked out at {hhmm} hrs, clears at {hhmm} hrs" with the Clear Now
  button (renamed from "Clear Issue") on the same line via a wrapping flex
  row -- wraps to its own line on a narrow viewport rather than being
  forced to fit, since the ask was "if possible."
- **Product-colored product line, new `app/planner/utils/productColor.ts`**
  -- per explicit request ("make the product name the product color (red).
  or yellow if diesel, white for regular etc."). `productColorFor(name)`
  is a simple substring match against the product's own name (no separate
  "family" column exists on `products` to key off instead): contains
  "diesel" → `#eab308` (yellow), contains "premium" → `#ef4444` (red),
  everything else (regular, mid-grade/plus, and anything unmatched) →
  white, matching the "white for regular etc." fallback intent. Applied to
  the detail card's product-name row only -- the ticker text itself stays
  the existing plain red (`TICKER_COLOR`), which was never part of this
  complaint.
- `ComposedOutageReport` (the hook's shared shape) dropped its single
  pre-formatted `text` field in favor of structured fields the modal now
  needs directly: `productName` (full), `tickerText` (short), `personLabel`
  (full company or driver name), `truckLabel`, `createdAtMs`. The now-
  unused `initialsOf()` helper was removed along with the initials-based
  ticker format it only existed for.

Not live-verified this pass (no authenticated session available from this
side, same as every change in this thread) -- `tsc --noEmit` and `next
build` both clean.

## Equipment modal rework (2026-08-29, user's handwritten spec) — in progress

Planned via Plan Mode (approved plan preserved at
`wild-discovering-plum.md`) from a Samsung Notes export the user pasted in.
Real gap: `TruckModal`/`TrailerModal` (`lib/ui/driver/EquipmentDetails.tsx`,
already shared by solo and fleet tiers) showed every field flat in one long
form with no distinction between what's needed to get a unit on file and
what can wait, and there was no way to *edit* an existing unit's identity
fields from the main Solo picker (`SoloEquipmentModal.tsx`) at all — only
select (tap) or delete (long-press).

Four scope decisions clarified with the user via `AskUserQuestion` before
writing the plan (asked, not guessed):
- **File → Edit** stays wired to the Binder (`BinderModal.tsx`), not a new
  destination — Edit picks Truck or Trailer (skipping the pick when only
  one unit is currently selected), then opens that ONE unit's Binder
  instead of today's combined both-units-in-one screen. The Binder's
  required-fields block moves to a big, un-collapsed section up top.
  Attachments stay exactly as-is (already optional, already per-permit).
- **Region/Local Area** become real managed catalogs (new tables), not
  free text — mirrors the existing `service_types`/`permit_types` pattern
  in this exact codebase (company-scoped, soft-delete only, "future
  entries only" on rename/delete). `trucks.region`/`trucks.local_area`
  (and the trailer equivalents) stay plain text columns, unchanged — the
  catalog just feeds them instead of free-typing.
- **"Staggered" PM scheduling** needs no new scheduling engine — service
  types already carry independent intervals, and
  `computeUnitServiceDue` (`SoloEquipmentModal.tsx`) already picks
  whichever type is soonest due across every type with records for a
  unit. That's the staggering. Confirmed with the user rather than
  building a rotation/count-based engine that wasn't actually being asked
  for.
- **Scope applies to both tiers** — solo and fleet-tier admin/dispatch/
  lead. Fleet drivers (who can't add) get the same Truck→Trailer→Location
  order, but by *selecting* from the fleet's existing "Uncoupled
  Equipment" picker instead of creating new units.

**Two pre-existing, parallel permit systems stay parallel — not unified
this pass.** `EquipmentDetails.tsx`'s permit rows (`trucks.reg_expiration_date`
etc., the *old* hardcoded columns) power the new modal's **Details**
button ("the vin, plate, permits, notes we already have built" — literal
reuse). `BinderModal.tsx`'s `permit_types`/`equipment_permits` (the
*newer*, company-managed, attachment-capable system, per that file's own
header comment) powers **Edit**. Merging them is out of scope here.

Building in three dependency-ordered phases, each typechecked/built clean
before moving on.

### Phase A — Foundation (shipped this pass)

- **Migration** `20260829010000_equipment_regions_local_areas.sql`
  (**not yet applied**) — `equipment_regions` / `equipment_local_areas`
  (company_id, name, is_active, created_at), RLS mirrors `permit_types`/
  `service_types` exactly (company-scoped, no DB-level role check — UI
  gates add/edit/remove to admin/dispatch/lead in Phase B/C's Filter
  modal). Backfills existing distinct `trucks.region`/`local_area` (and
  trailer equivalents) into real catalog rows per company, so nothing
  already on file disappears from the new picker once this ships.
- **New `lib/ui/driver/RequiredEquipmentFields.tsx`** — the shared 6-field
  block (Unit #, Year, Make, Model, Region, Local Area), parametrized by
  `kind: "truck" | "trailer"` for placeholder copy. Region/Local Area are
  small custom pickers (not a plain `<select>`) reading from the new
  catalog tables, with an inline "+ Add new" — deliberately does NOT do
  rename/soft-delete here (that stays the Filter modal's job in Phase
  B/C, gated to privileged roles, so there's one place to manage the list
  instead of two that could disagree). Deliberately self-styled (own
  inline style constants) so it looks identical wherever it's mounted,
  regardless of the host file's own styling conventions — this component
  is shared across `lib/ui/driver/` (plain `<select>`+tokens convention)
  and `app/planner/modals/` (`CustomSelect` convention) files.
- **`TruckModal`/`TrailerModal` restructured** (`EquipmentDetails.tsx`):
  a `screen: "front" | "details"` state (default `"front"`) now gates two
  views inside the same modal/form — no new save flow, no second `Modal`
  wrapper, just what's currently visible. **Front page**:
  `RequiredEquipmentFields` + (trailer only) Compartments, kept visible
  here per explicit spec ("keep the section for compartments") + a
  **Service Schedule** button + a **Details →** button + **Save & Close**
  (renamed from the old isNew-conditional "Add Truck"/"Save" label,
  same underlying `save()`). **Details**: everything else, unchanged —
  VIN, plate, all permit rows, Other Permits, Notes, Sensitive Info,
  Delete, Deactivate — just relocated, not rewritten, behind a "← Back"
  link. Trailer's `save()` gained a `comps.length === 0` guard ("At least
  one compartment is required"), matching the front page's own claim.
  Both `save()` payloads now include `region`/`local_area` for the first
  time — confirmed via reading `save()` that these fields were **never
  actually written** by this modal before (present on the `Truck`/
  `Trailer` types and already read/filtered elsewhere in the app, e.g.
  `EquipmentModal.tsx`'s fleet region filter, but nothing ever set them
  through this modal) — a real, pre-existing gap, not something this pass
  broke.
- **Real, pre-existing inconsistency found and fixed in passing**:
  `TrailerModal`'s Save button was never gated by `canEditRestricted` at
  all (unlike `TruckModal`'s, which always was) — a driver viewing a
  trailer they can't edit would still see an enabled Save button. Fixed
  as a natural side effect of unifying both into one shared
  `saveCloseBtn` — now consistently gated on both.
- **`ServiceSection` renamed to `ServiceLogModal`, externally controlled**
  (`open`/`onClose` props instead of owning its own button+state) — the
  new front-page "Service Schedule" button now drives it directly for an
  existing unit (`!isNew`). For `isNew` (no real `truck_id`/`trailer_id`
  yet), the same button opens the new **`ServiceTypeListModal`**
  (`ServiceTypeManager.tsx`) instead — a lighter "list + edit + + New
  type" view reusing the existing `ServiceTypeEditorModal`/
  `fetchServiceTypes` (no second copy), since service types are
  company-wide, not per-unit, and never actually needed a real unit id to
  manage — only *logging* a service against one does.

### Phase B — Main modal wiring (shipped this pass)

- **New `app/planner/modals/UnitPickerSheet.tsx`** — small themed "Truck or
  Trailer?" sheet, styled to match the existing confirm-dialog pattern
  already used elsewhere in `SoloEquipmentModal.tsx` (commandeer/remove
  confirmations), not a separate design system — that's what "match our
  theme" means in the context this sheet actually appears in.
- **New `app/planner/modals/RegionLocalAreaFilterModal.tsx`** — the Filter
  button's destination: two big options (Region / Local Area), each
  opening a list of the company's catalog entries to pick from (plus
  "All Regions"/"All Areas"). `canManage` (always `true` for solo, since
  a solo company's sole member is always `role: 'admin'`) gates inline
  rename/soft-delete controls and a "+ Add" row — drivers (a later,
  fleet-tier consumer of this same component) get select-only. This is
  the ONE place the `equipment_regions`/`equipment_local_areas` catalogs
  get renamed/removed; `RequiredEquipmentFields.tsx`'s own picker can only
  add a brand-new entry, never rename/delete, so there's a single editor
  per catalog.
- **`SoloEquipmentModal.tsx` — Edit (was File)**: `openEdit()` skips the
  new `UnitPickerSheet` entirely when only one unit is currently selected
  (same "don't ask when there's nothing to choose between" precedent as
  the outage-report product picker, 2026-08-28) and opens that unit's
  `BinderModal` directly; with both selected, the sheet asks first.
  Neither selected falls through to `BinderModal`'s own existing "Select
  equipment first" empty state, unchanged.
- **`SoloEquipmentModal.tsx` — Filter button**: added via
  `FullscreenModal`'s existing `headerRight` slot (top right, per spec).
  `filteredTrucks`/`filteredTrailers` (new `useMemo`s) narrow the grid to
  matching Region/Local Area; a currently-selected unit that gets
  filtered out of view stays selected (filtering is a display
  convenience here, not an implicit deselect) -- only the list of other
  options shrinks. `trucks`/`trailers` queries now also select
  `region, local_area` (previously not fetched at all in this modal).
- **`SoloEquipmentModal.tsx` — onboarding**: a new effect defaults straight
  into Add Truck (then Add Trailer, once a truck is selected and no
  trailer exists) when `trucks.length === 0`/`trailers.length === 0`,
  instead of showing an empty grid with just a "+". Deliberately not a
  literal unescapable trap -- canceling out of Add Truck just leaves the
  empty grid+"+" visible (the effect's own dependency array doesn't
  change from a cancel alone, so it won't immediately reopen) -- but
  `SetupGate.tsx`'s own pre-existing hard gate (`comboSelected`) still
  refuses to let the driver past the Equipment step at all until a real
  combo exists, and reopening this modal from there re-runs the effect
  and nudges again. `handleTruckAdded`/`handleTrailerAdded` auto-select
  the just-added unit when it was the equipment's first one (captures
  `wasEmpty` from the still-stale closure before `loadEquipment()`
  refetches, so a genuinely-first add always has exactly one row to grab
  -- no ordering/`created_at` column needed), continuing the forced
  Truck → Trailer → Location sequence into `SetupGate`'s own next step
  automatically.
- **`SoloEquipmentModal.tsx` — report section**: Tare and Target merged
  onto one row ("Tare / Target — 34,800 / 80,000 lbs", no "weight"/"gross
  weight" wording), tap-anywhere still opens Scale History exactly as
  either used to individually. Trailer's own report line is back, using
  the new `mostRecentServiceForUnit()` helper (backward-looking last
  date + type, e.g. "08/12/26 · Check & Inspect" — deliberately NOT the
  truck's forward-looking `computeUnitServiceDue()`, since the spec asks
  for what was done, not a due prediction) — `loadServiceAndWash` now
  also queries the trailer's own `service_records`, which it previously
  skipped entirely per the prior "truck-only" decision this reverses.
- **`BinderModal.tsx` — single-unit mode + required fields**: already
  structurally ready for one-unit-at-a-time (`UnitSection` already
  rendered independently per `truckId`/`trailerId`) — `SoloEquipmentModal`
  now simply never passes both at once. New `RequiredFieldsBlock`
  (reuses `RequiredEquipmentFields.tsx`, the same component the Add/Edit
  Truck/Trailer front page uses) renders always-visible, un-collapsed,
  above the existing `UnitInfoRow` — which is trimmed down to just VIN/
  Plate/Notes ("the rest, behind buttons" — already collapsed-then-edit,
  needed no UX change, just no longer duplicating Year/Make/Model/Unit #
  now that `RequiredFieldsBlock` owns those). `UnitDetail`/`detailCols`
  extended with `region`/`local_area`. Modal title now reflects the
  single unit shown (`"Truck · 25184"` / `"Trailer · 3151"`), falling
  back to the generic "Equipment File" for the (now theoretical) both-or-
  neither case. Known, accepted gap: renaming a Unit # here doesn't
  refresh the caller's own `truckName`/`trailerName` prop within the same
  Binder session (only picks up the new name once the caller's equipment
  list reloads) — not worth a new callback chain for this cosmetic case.

### Phase C — Fleet tier + dual-unit service (shipped this pass)

- **`ServiceTypeManager.tsx` — `SimpleServiceModal` dual-unit-type rework**:
  "Both" previously forced the exact same `service_type_id` onto both the
  truck's and trailer's rows. Per explicit spec ("a user might put wet
  service for the truck and check and inspect for the trailer type"),
  each unit now has its own fully independent type picker (new
  `UnitServiceFields`, one instance per visible unit) — "an additional
  area for the trailer shows up below" when servicing both together,
  exactly as described. Date/Shop/Location/Notes stay one shared set for
  the visit (the spec never asked those to split per-unit). Each unit's
  own picker is filtered to types actually applicable to it (`applies_to`
  truck/both or trailer/both) independent of the overall Unit selector —
  previously "Both" showed every type regardless of fit. `typeEditor`
  now carries a `target: "truck" | "trailer"` so "+ New type"/edit-type
  from either sub-section resolves back into the right picker instead of
  a single shared `typeId`.
- **`EquipmentModal.tsx` (fleet tier) — Filter button**: added via the
  same `headerRight` slot pattern, now threaded through `ModalShell` (new
  optional prop, forwarded to `FullscreenModal`). Filters "My Equipment"
  (`filteredMyEquipmentCombos`, new `useMemo`) by looking up each combo's
  own truck and comparing its `region`/`local_area` — trucks/trailers'
  fetch queries and their local `TruckRow`/`TrailerRow` types gained
  `local_area` for the first time (previously only `region` was fetched
  here at all; Local Area filtering didn't exist anywhere in this file).
  Reuses the same `RegionLocalAreaFilterModal` Solo already uses — one
  Filter UI, not two independently-drifting copies.
- **`EquipmentModal.tsx` — onboarding sequencing**: new effect fires only
  for a genuinely fresh company (`coupledCombos.length === 0` company-
  wide, not just "this driver hasn't claimed anything yet" — an
  established fleet with real coupled equipment never gets nudged just
  because the current viewer's own "My Equipment" happens to be empty).
  Admin/dispatch/lead (`canAddEquipment`) get defaulted into Add Truck,
  then Add Trailer (reusing the exact same shared `AdminTruckModal`/
  `AdminTrailerModal` the new minimal front-page flow already uses — see
  Phase A), then handed off to `FleetModal`'s own already-built
  Uncoupled Equipment picker to actually couple them, rather than
  reimplementing that coupling flow a second time. Drivers (who can't
  add) get dropped straight into `FleetModal` itself — "select from the
  fleet" — the exact same Browse Fleet UI that was already reachable via
  a manual tap, just opened automatically instead of requiring the
  driver to notice and tap it themselves; no new permission surface.

**Full pass complete** across all three phases. `tsc --noEmit` and `next
build` both clean. Not live-verified this pass — same reason as every
authenticated equipment-flow change this session (no logged-in session
available from this side). Migration
(`20260829010000_equipment_regions_local_areas.sql`) not yet applied —
Region/Local Area pickers, and the Filter button's catalog management,
won't have real data to show until it runs.

**Manual walkthrough once the migration is applied** (per the plan's own
verification section): add a truck through the new minimal flow → tap
Service Schedule pre-save (confirms `ServiceTypeListModal` works with no
real unit id yet) → Save & Close → tap Edit on the main modal → pick
Truck → confirm its Binder shows just that one unit with Required Fields
big and un-collapsed up top → log a "Both" service with different truck/
trailer types → confirm the report section shows the truck's next-due
line and the trailer's own last-serviced line, independently → try the
Filter button's Region/Local Area add-then-select path, including the
add/rename/remove controls as an admin and select-only as a plain driver
→ (fleet tier) confirm a brand-new company's admin gets nudged into Add
Truck → Add Trailer → Browse Fleet in sequence, while a driver on that
same fresh company gets dropped straight into Browse Fleet instead.

### Binder (Edit) restructured to match the Add/Edit Truck/Trailer modal's own shape (2026-08-29, same day follow-up)

Live screenshot from the user showed the real gap: "Edit" (the picker →
`BinderModal.tsx` flow from Phase B) landed on a screen with Required
Fields up top (correct, from Phase B) but then went straight into a flat
list -- VIN/Plate/Notes row, then every permit row with its paperclip/
attachment icon, no Service Schedule button, no Details step, no Save &
Close -- structurally nothing like the Add Truck modal's front-page/
Service-Schedule/Details/Save-&-Close shape, even though `RequiredFieldsBlock`
already reused the same component. Per explicit direction ("match the
edit truck modal to the add truck modal? it should be the same thing
with service Schedule etc. just a different name. same for trailer").

`BinderModal.tsx`'s `UnitSection` gained the identical `screen: "front" |
"details"` pattern `EquipmentDetails.tsx`'s TruckModal/TrailerModal
already uses: **front page** = `RequiredFieldsBlock` (unchanged) +
**Service Schedule** + **Details →** + **Save & Close**; **Details** =
everything that used to be always-visible -- `UnitInfoRow` (VIN/Plate/
Notes), `CompartmentsSection` (trailer only), the full permit +
attachment list, "+ Add permit type" -- behind a "← Back" link.

Service Schedule reuses `SimpleServiceModal` directly (fetches
`serviceTypes`/`authUserId` inline, same shape as `EquipmentDetails.tsx`'s
own `ServiceLogModal` wrapper, which isn't exported from that file so
couldn't be imported directly) -- Binder is only ever opened for an
**existing** unit, so there's no `isNew`/pre-save branch to handle here
the way `ServiceTypeListModal` covers on the Add side.

"Save & Close" is deliberately just `onClose()` (threaded down as a new
`UnitSection` prop) -- everything on the Details screen already autosaves
per-field (`RequiredFieldsBlock`'s own conditional Save, each permit
row's own Save/Delete, `UnitInfoRow`'s own Save), so there's nothing left
to batch-commit and no separate Cancel needed either (nothing uncommitted
to discard) -- styled identically to the Add/Edit modal's own button for
visual consistency, per the "just a different name" framing.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass
(no authenticated session available from this side) -- worth a real
click-through on the same device that caught the original gap.

### Service Schedule clarified: types/intervals only, never logging a service (2026-08-29, same day follow-up)

Real bug in the Binder restructure just above, caught by explicit
clarification before it was ever tested live: "the [Service Schedule] is
where we determine service types and the intervals for the various
services. we record the service from the main modal service button. so
in the new equipment and edit modal service Schedule we set the type.
then determine the intervals (miles/hours/time)... then add, remove, edit
each type option." Phase A had built exactly this for `isNew`
(`ServiceTypeListModal`) but wired the **existing**-unit case (`!isNew`)
to the wrong thing entirely -- `ServiceLogModal`, the actual log-a-service
form (pick unit, type, date, reading, shop, notes, submit a
`service_records` row). Same mistake carried into `BinderModal.tsx`'s
same-day restructure, which reused `SimpleServiceModal` directly for its
own Service Schedule button.

Fixed in both places: `EquipmentDetails.tsx`'s TruckModal/TrailerModal
now always open `ServiceTypeListModal` for Service Schedule, no more
`isNew` branching -- the now-unreachable `ServiceLogModal` wrapper
(and its now-unused `SimpleServiceModal`/`ServiceType`/`fetchServiceTypes`
imports) were deleted rather than left as dead code.
`BinderModal.tsx`'s `UnitSection` does the same -- `ServiceTypeListModal`
instead of a `SimpleServiceModal` wrapper, dropping the `authUserId`/
`serviceTypes` state it no longer needs. Recording an actual service is
completely untouched -- still exactly the main equipment picker's own
"Service" button (`SoloEquipmentModal.tsx`'s action row →
`SimpleServiceModal`), which was never part of this Phase A/B/C rework
at all.

Also tightened `ServiceTypeEditorModal`'s interval-value field (the one
place "that selection determines the field type for the value" was still
a bit soft) -- the label and placeholder now read "Every how many
miles/hours/days" instead of a generic "Interval value," driven directly
by the Interval kind picked just above it.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass.
(Also caught and fixed in the same pass: my own previous edit to this
file had accidentally dropped the "## Pre-launch cleanup" section heading
below -- restored, no content was actually lost, just its own heading.)

### Report section polish: wash-date alignment, truck service line label (2026-08-29, same day follow-up)

Two small fixes to `SoloEquipmentModal.tsx`'s report section, per explicit
follow-up:
- **Washed-on date wasn't right-aligned** -- the wash lines' wrapping
  column `<div>` (holding one row per unit when Truck/Trailer washed on
  different days) had no explicit width, so as the sole child of the
  report row's own `justifyContent: "space-between"` container it just
  shrank to its content's width and sat at the left edge -- each row's own
  `space-between` then only had that narrow width to work with, squeezing
  the date in tight next to the label instead of pushing it to the row's
  actual right edge the way the Tare/Target and Truck service rows already
  do. Fixed with `width: "100%"` on that wrapper.
- **Truck's service line relabeled** from "Next Service · {type}" to
  "Truck - {type}" (e.g. "Truck - Dry"), matching the "Truck"/"Trailer
  Serviced" naming convention the trailer's own line already uses,
  hyphen instead of the middle-dot separator. The no-data fallback
  ("No service recorded") now labels its row "Truck" too, for the same
  reason.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass.

### Terminal outage banner: single continuous line, tighter spacing, filtered to the driver's own plan (2026-08-31)

Three explicit follow-ups against a live screenshot of the two-half
banner:

- **Space under the banner removed.** The visible gap wasn't the banner's
  own -- `CalculatorLayoutClient.tsx`'s `TabBar` had a hardcoded
  `marginTop: 18` left over from before the banner existed (originally
  meant as breathing room between the icon row and the tab strip); once
  the banner sat between them, that same 18px applied AFTER the banner
  too, on top of the banner's own height. `TabBar` gained a `compact`
  prop (`marginTop: 2` instead of `18`); `Header` now fetches the outage
  data itself (`useActiveOutageBanner`, moved up from
  `TerminalOutageBanner.tsx`) so it can pass `compact={!!tickerMessage}`
  to `TabBar` -- the only way to know "is anything above the tab bar right
  now" without either hardcoding an assumption or querying twice.
  `TerminalOutageBanner.tsx` is now a plain presentational component
  (`tickerMessage`/`reports`/`timeZone`/`refresh` props), no hook of its
  own.
- **Merged into one continuous line, one arrow.** Was two independent
  `MessageTicker` halves side by side (Out of Product / Out of
  Allocation), each with its own chevron and a vertical divider between
  them. Per explicit direction ("these are two distinct issues... make
  this read like one continuous line. Only one arrow"),
  `useActiveOutageBanner` now composes a single `tickerMessage` string --
  each type's own entries still join with " - ", but the two groups (when
  both present) now join with a wider "   ---   " separator into ONE
  string, rendered as one `MessageTicker` with one trailing chevron. The
  two-section split in the detail modal (`TerminalOutageDetailModal.tsx`)
  is unchanged -- only the collapsed ticker line merged, the expanded
  detail view still clearly separates the two report types.
- **Filtered to the driver's own current plan.** Per explicit direction
  ("We only want to show people it is out of product or out of allocation
  if they are trying to load that specific product... If my plan is
  calling for regular or premium, don't show it"). New
  `CalculatorShellContext.tsx` state, `plannedProductIds: Set<string>` +
  setter -- lives in the shell (not local to `page.tsx`) specifically
  because the banner is mounted in the shared `Header`, visible on every
  tab, not just Planner. `app/planner/page.tsx` gained a small effect
  syncing `compPlan`'s non-empty compartments' product IDs into
  `shell.setPlannedProductIds` on every change. Since `page.tsx` itself
  unmounts when the driver navigates to a sibling tab (confirmed via this
  file's own prior architecture notes on tab routing), this is a
  last-known snapshot while elsewhere, not a live subscription -- correct
  here, since the driver is still going to load that same plan when they
  return to Planner. `useActiveOutageBanner` gained a third
  `plannedProductIds` argument and now filters fetched rows to only
  matching `product_id`s before dedup/composition; an empty or unset set
  (no plan yet this session) shows nothing at all rather than guessing at
  relevance -- a driver who never opens Planner in a session won't see
  the banner, a known/accepted edge case given how central Planner
  already is to the app's own flow.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass
(no authenticated session available from this side) -- worth a real
check with a planned product that matches an active report, one that
doesn't, and no plan at all.

### Real regression from the above, reported live: Planner opened to empty ("MT") compartments (2026-08-31, same day)

User report right after the outage-banner pass shipped: "that wiped the
plans. it now opens to mt compartments." Not fully root-caused yet (no
live session to reproduce against), but a real, plausible mechanism was
found and mitigated immediately rather than left unaddressed.

**The mechanism**: `CalculatorShellContext.tsx`'s own `value` object
(everything `useCalculatorShell()` returns) is a plain object literal,
never wrapped in `useMemo` -- a pre-existing pattern, not introduced this
pass, but one that means ANY state change inside the provider re-renders
every consumer of the shell, including `page.tsx` itself. The new
`plannedProductIds` sync effect (previous section) originally called
`shell.setPlannedProductIds(...)` on **every** `compPlan` change --
including cap-override edits and fill-level drags, which change
`compPlan`'s object reference without changing which products are
selected -- meaning a routine plan edit now triggered an extra
shell-wide re-render cycle that didn't exist before this feature. If any
other effect in `page.tsx` or `usePlanSlots.ts` depends on `equipment`/
`location` as whole objects (fresh references every unmemoized-provider
render) rather than their specific fields, that extra churn could
plausibly cause a hydration/restore effect to re-fire at the wrong
moment and land on empty state -- consistent with "opens to MT
compartments."

**Mitigated**: the sync effect now computes a stable signature (sorted,
joined product-id string) and only calls `shell.setPlannedProductIds`
when that signature actually changes -- a cap/fill-only edit no longer
triggers a shell-level state update at all, eliminating most of the
churn this feature introduced. This does NOT fix the underlying
unmemoized-context pattern itself (a bigger, separate, real cleanup --
wrapping that large `value` object in `useMemo` needs its own careful
dependency-array pass, not something to rush during an active incident)
-- flagged here as a genuine follow-up, not silently deferred.

**Not yet confirmed**: whether this was actually the true root cause, or
whether the underlying saved plan data was ever actually at risk (nothing
in this pass's diff writes an empty `compPlan` anywhere -- the far more
likely explanation is a display/hydration timing issue, not real data
loss, consistent with this project's own repeated prior incidents in this
same category -- see "Presets rework" and "Equipment selection broken"
elsewhere in this file, both of which turned out to be non-destructive
once root-caused). Needs a real live re-test after this fix, and if it
recurs, the unmemoized shell context value is the next thing to fix
properly, not re-guess around.

`tsc --noEmit` and `next build` both clean.

### Terminal outage detail modal: drop the truck number from Out of Product (2026-08-31, same day)

Per explicit direction ("the out of product should maybe not show the
truck number since it is public. only the company name") --
`TerminalOutageDetailModal.tsx`'s `ReportRow` top line now branches by
report type: Out of Product (visible cross-company, to any driver at any
company heading to that terminal) drops the truck number entirely and
shows just the company name; Out of Allocation (still RLS-scoped to the
reporter's own company) is unchanged -- `{driver} Truck {unit}`, since
that's same-company-only context, not public exposure.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass.

## Terminal tab pivot: Lane Map removed, Insights (Volume/Trends/Recovery) added (2026-08-31)

Planned via Plan Mode (approved plan preserved at
`wild-discovering-plum.md`) per explicit direction: "get rid of the whole
lane map and status update system. this will be way too involved and
complicated for every terminal across the country." Replaced with a bar
chart of gallons loaded per product over a selectable time period ("like
stock analysis"), with room to grow into other analytics via the same
sub-tab mechanic every other tab in this app already uses.

Two scope decisions confirmed with the user before writing the plan
(asked, not guessed):
- **Racks stay, the Lane Map doesn't.** `rack_id` is load-bearing for
  more than the grid -- rack-aware terminal selection, the per-rack
  product list, and the Out of Product outage flag all key off it. Only
  the *visual* lane/arm grid and its manual per-arm status update UI were
  removed; the rack picker and rack-level product list/STUD are
  unchanged.
- **Recovery-rate comparison stays company-scoped.** No cross-company
  ("global") driver comparison -- flagged as a real, separate privacy/
  business decision for later, not built alongside this reshuffle.

**Removed**: `RackLaneGrid.tsx` and `LaneStatusModal.tsx` deleted
outright. `EditTerminalModal.tsx` lost its entire Lane/Arm Layout view
(`LayoutView`/`LaneRow`/`LaneArmProductsView`/`ArmProductPickerModal`,
~600 lines) and the "Edit Lane/Arm Layout" button that opened it, along
with the now-unused `letterFor`/`iconBtnStyle`/`MAX_PRODUCTS_PER_ARM`/
`displayLabel`/`CustomSelect` imports that only that view needed.
**Kept, unchanged**: `RacksView` (rack name/create/delete, Renewal Days),
`ProductsView` (rack-level product list curation), `RackProductStatusModal.tsx`
(the rack-level STUD -- feeds `terminal_products`/`terminal_temp_bias`,
unrelated to the per-arm grid). `rack_arms`/`rack_lanes` tables and their
live data are untouched in the DB, just no longer rendered -- cheap to
resurrect later, nothing destructive here.

**New `app/planner/terminal/page.tsx`** (full rebuild): terminal identity
header (unchanged) + a new **This Terminal / All Terminals** toggle, then
4 sub-tabs via `CenteredSubTabs` (the same "dial" mechanic already used
for this page's own rack picker, Cards' sub-tabs, etc. -- exactly what "a
dial like every other tab" meant):
- **Status**: everything this page used to be -- rack picker, product
  list, STUD, Edit Terminal -- verbatim, just one of four views now
  instead of the whole tab. Shows a placeholder while All Terminals is
  selected (racks are inherently per-terminal).
- **Volume** (the one fully-built chart this pass): new
  `app/planner/terminal/VolumeChart.tsx` -- a grouped bar chart, one
  cluster per time bucket, gallons per product within each, colored via
  the existing `productColorFor()` (same palette the outage banner's
  detail cards already use, so a product reads the same color everywhere
  rather than a second invented palette). Period control reuses this
  app's own established 7d/30d/90d/All lookback-chip convention (already
  duplicated across `MyLoadsModal`/`ScaleHistoryModal`/
  `RecordHistoryModal`/`UnderloadingDashboardModal` -- no shared component
  exists to import, same as those). Bucketing is adaptive ("like stock
  analysis") -- daily bars for 7d/30d, weekly for 90d, monthly for All
  (new `bucketLoads()`/`bucketKeyFor()` in `page.tsx`) -- so the chart
  stays legible instead of one bar per day over a year of history.
- **Trends / Recovery**: honest "coming soon" placeholders (reusing the
  page's existing `PlaceholderPanel`) -- not guessed-at functionality.
  Recorded for the next pass: Trends = seasonal API/temp charts from
  `terminal_temp_bias`/`load_lines.actual_api`; Recovery =
  `load_points.recovered_gallons` comparison across the driver's own
  company (same source `UnderloadingDashboardModal.tsx` already
  aggregates), explicitly not cross-company.

**Volume's data source**: `load_log` has no `company_id` column (this
file's own prior notes) -- scoped via `useCompanyRoster(shell.companyId)`
(already-shared hook, same one `UnderloadingDashboardModal.tsx` uses) to
get member `user_id`s, then `load_log` filtered to those ids +
`status = 'loaded'` (real completed loads, not `'completed'` -- confirmed
the hard way earlier this project, see the incentive-backfill history in
this file) + the lookback window, then `load_lines` joined by `load_id`.
Fetched client-side and aggregated in JS, same pattern
`PayrollReportModal.tsx`/`UnderloadingDashboardModal.tsx` already use --
no new RPC, no new migration. **Visibility deliberately reuses whatever
RLS already permits per role** -- a plain driver's chart is scoped to
their own loads, staff roles see fleet-wide via the same grants
`UnderloadingDashboardModal.tsx` already relies on. Widening plain-driver
visibility to fleet-wide totals (so "how much *we've* loaded" reads
company-wide for every role) is flagged as a real, separate RLS decision,
not made here.

**Tab label renamed** "Terminal" → "Insights" in
`CalculatorLayoutClient.tsx`'s `TERMINAL_TAB` -- label only, `id`/`href`
(`/planner/terminal`) deliberately unchanged, same "route/label only,
internal identifiers untouched" precedent as the `/calculator` →
`/planner` rename.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass
(no authenticated session available from this side, and Volume needs real
completed loads at a real terminal to show anything meaningful) -- manual
walkthrough once live: open Insights, confirm Status (rack picker/product
list/STUD/Edit Terminal) still works exactly as before, switch to Volume,
confirm a real terminal with completed loads shows a believable chart,
toggle All Terminals, cycle the 7d/30d/90d/All chips, confirm Trends/
Recovery show clean placeholders.

## Performance pass #1: Driver Training removed, outage-banner poll slowed (2026-08-31)

Kicked off by a full-app performance/reliability audit (read-only,
CalculatorShellContext/data-fetching/polling patterns across the whole
app) requested by the user, who's noticing real load-time and tab-switch
delays. Top findings from that audit, for reference: (1)
`CalculatorShellContext.tsx`'s `value` object is a plain literal, never
memoized -- any shell state change re-renders the whole tree; the
biggest single architectural fix available, but risky to rush, not done
this pass. (2) Zero data-fetching cache anywhere in the app (no React
Query/SWR, one hand-rolled `Map` for ambient temp) -- every tab/modal
refetches from scratch on every mount, including things like the
`products` catalog independently fetched by several different files.
(3) Several always-on polling loops running for every user regardless of
whether the feature behind them is ever used. This entry addresses the
first two concrete, low-risk items from that list; the context
memoization and a real caching layer are flagged as their own separate,
dedicated passes -- not attempted here.

**Driver Training removed entirely**, per explicit direction ("not
worth it and kinda adds to the clutter on the planner tab") -- this also
directly kills one of the two always-on 30s polls the audit flagged (the
trainee-side "Training with X" banner check in `page.tsx`, which ran
for literally every user every 30 seconds regardless of whether they'd
ever be a trainee). Removed: `canDriverTrain`/`traineeId`/`traineeName`/
`trainingModalOpen` state, the "Driver Training" button + "Loading with
X" banner + trainee-side "Training with X" banner + its 30s poll
`useEffect`, the `DriverTrainingModal` mount, and
`useLoadWorkflow.ts`'s `trainingTraineeId` prop + the fire-and-forget
`trainee_id` UPDATE after `begin_load`. `app/planner/components/DriverTrainingModal.tsx`
deleted outright (no other importers). `DriverPicker.tsx`/
`useCompanyRoster.ts` are unaffected -- both have other real callers
(Dispatch tab, Period Report/Underloading Dashboard's driver-group
filter) and their stale doc-comment references to Driver Training were
updated, not left dangling.

**Deliberately NOT touched**: `load_log.trainee_id` (the column) and its
`load_log_select_trainee` RLS policy are left in the DB, unused --
same "leave it, don't drop it" precedent this project already uses for
other abandoned columns (see `lane_alpha`/`arm_alpha`,
`terminal_racks.lane_count` etc. elsewhere in this file). Nothing reads
or writes it anymore; harmless to leave, no migration needed.

**Outage banner poll slowed from 30s to 90s** (`useTerminalOutageReports.ts`,
new `OUTAGE_POLL_MS` constant) -- this poll runs in the shared `Header`
for every user on every tab the whole time the Planner layout is
mounted, so it was the other concrete, low-risk win available immediately:
cuts that query's aggregate volume by two-thirds with no real loss of
freshness, since the underlying data itself only changes on a 6-hour
checkpoint schedule anyway.

**Not done this pass, flagged for dedicated follow-ups**: memoizing
`CalculatorShellContext`'s value object; adding a real caching layer
(React Query) for repeatedly-fetched near-static data (products catalog,
terminal catalog, company roster); auditing for other duplicate fetches
once that caching layer exists to actually consolidate them into.

`tsc --noEmit` and `next build` both clean. Not live-verified this pass
(no authenticated session available from this side).

### Performance pass #2: `CalculatorShellContext` memoized (2026-08-31, dedicated branch)

Item #1 from the audit above -- "biggest single fix for the re-render
churn, needs care not haste." Done on a dedicated branch
(`perf/memoize-shell-context`, off `main` at `c9896ae`, the last known-
good pushed commit) rather than directly on `main`, per explicit user
request about backup/recovery safety before a change in this specific
risk class: a wrong `useMemo`/`useCallback` dependency array produces
silently stale UI, which neither `tsc --noEmit` nor `next build` can
catch, and this session has no way to live-test it.

**The bug**: `CalculatorShellContext.tsx`'s `value` object (everything
`useCalculatorShell()` returns -- consumed by `Header`, `TabBar`, and
whichever tab's `page.tsx` is currently mounted) was a fresh plain object
literal on every render. Since a new object is never `===` a previous
one, EVERY state change anywhere in the provider -- a modal opening, a
card being tapped, the outage-banner poll ticking -- re-rendered every
consumer of the shell, not just the piece that actually changed. This is
also the mechanism flagged (but not confirmed) as a possible contributor
to the "wiped the plans" incident earlier this session -- an unmemoized
context value make that class of bug easier to trigger, even though the
user's own follow-up suggested that specific incident may have been
unrelated.

**The fix, in two layers** (each verified safe on its own before moving
to the next, via `tsc --noEmit` after each layer):

1. **Every shell sub-hook's own return object memoized first**
   (`hooks/useEquipment.ts`, `useLocation.ts`, `useTerminals.ts`,
   `useExpirations.ts`, `useTerminalFilters.ts`) -- each already returned
   only `useState` values/setters (React-stable by construction) or
   already-`useCallback`/`useMemo`'d fields, so this step was a pure
   wrap: `return useMemo(() => ({...fields}), [...fields])`, mechanically
   safe since no individual field's own reactivity changed, only the
   returned object's identity stabilized.
   `useTheme.ts` needed a real (behavior-preserving) refactor, not just a
   wrap -- `persist`/`setDarkMode`/`setAccentColor` were plain functions
   recreated every render, converted to `useCallback` with their genuine
   dependencies (`persist` depends on `userId`; `setDarkMode`/
   `setAccentColor` each depend on the OTHER field's current value, since
   both are persisted together as one `StoredTheme`).
2. **The outer `value` object itself**, in `CalculatorShellContext.tsx` --
   two more unstable pieces found by inspection and fixed first
   (`cityKey`/`isCityStarred`/`toggleCityStar` and
   `setCardDataForTerminal_`, all plain functions converted to
   `useCallback` with their real dependencies), THEN the full ~44-field
   `value` object wrapped in `useMemo`, dependency array listing every
   field. This step only works correctly because of step 1 -- `equipment`/
   `location`/`terminals`/`expirations`/`terminalFilters`/`theme` (the 6
   sub-hook results) are now themselves stable references; without step 1,
   memoizing just the outer object would have been a no-op (a fresh
   `equipment` object every render would still bust the memo every time).

**Not done this pass**: `chooseTerminal`/`resolveRackPick` (already
`useCallback`-wrapped with pre-existing, intentional
`eslint-disable-line react-hooks/exhaustive-deps` comments) were left
exactly as they were -- their dependency arrays predate this pass and
weren't touched, on the theory that a working-but-lint-suppressed
callback is lower-risk left alone than "corrected" without being able to
verify the correction live.

`tsc --noEmit` and `next build` both clean throughout (checked after the
hook-level layer and again after the outer `value` layer). Sitting on
`perf/memoize-shell-context`, not yet merged to `main` at the time this
was written -- see the live-verification pass immediately below, done the
same day.

### `perf/memoize-shell-context` live-verified via the demo login route (2026-09-01)

This session gained real browser access for the first time (`preview_start`
against the local dev server, on this same branch) and used it to run the
live click-through the memoization work above was waiting on, via
`/api/demo/start?persona=alpha` -- a purpose-built shareable demo-login
route already in the codebase (mints a fresh magic link for one of two
fixed demo accounts, no email/password needed).

**Found and fixed a real, unrelated bug on the way in**: the demo route
failed twice in a row with "Link expired or already used" /
"No token found in this link." Root cause: `app/api/demo/start/route.ts`
still redirected through Supabase's raw `action_link`
(`<project>.supabase.co/auth/v1/verify`), which consumes the one-time
token on the very first GET -- the exact bug already found and fixed for
the admin-invite email (see "invite email -- fixed the consuming-link
bug" earlier in this file), just never ported to this route. Any
prefetch/preflight against that URL (this session's own browser tooling,
in this case) burns the token before the "real" navigation completes.
Fixed identically: build `confirmUrl` from `hashed_token` pointed at our
own `/auth/confirm?token_hash=...&type=magiclink` instead of the raw
`action_link` -- `/auth/confirm/page.tsx` already handles this shape via
an explicit client-side `verifyOtp()` call, so no other file needed to
change. Live-verified immediately after: the demo login now completes on
the first try, landing on `/planner` as the demo admin.

**With that fixed, ran the actual verification checklist** against the
real demo/QA company's live data (the persistent one referenced
throughout this file's own history -- Seth Perry/Test Testerson, real
equipment, real terminal cards):
- Selected equipment via the Equipment modal (25184-A / 3151-A) -- real
  Tare/Target populated correctly.
- Dispatch tab: picked a driver (Test Testerson) -- identity, equipment,
  schedule, and terminal cards (correct expiry colors, including a real
  -71-day expired-red card) all rendered.
- Switched to Cards tab -- correctly stayed scoped to "Viewing Test
  Testerson's terminal cards," confirming the shared `selectedDriverId`
  survived the tab switch under the now-memoized shell value.
- Insights tab -- rack picker, product list (real API/temp readings),
  and the new Volume chart (shipped this same session, never live-
  tested until now) all rendered correctly; "All" range showed a real
  grouped bar chart (monthly buckets, correct diesel=yellow/regular=white
  coloring, real gallon totals) against actual historical load data --
  first live confirmation the Terminal tab pivot's chart genuinely works
  end to end, not just typechecks.
- Vault tab rendered its first-time PIN-setup screen correctly (didn't
  set a PIN -- not needed for this check).
- Back on Planner: opened/closed the Compartment product picker cleanly;
  switched terminals (Fort Lauderdale -> Global South) -- plan correctly
  re-synced (stale "N/A" flags cleared to "MT"), predicted temp updated,
  and the multi-rack picker correctly triggered ("Global South has more
  than one rack"); picked South Rack -- state updated correctly.
- **The exact scenario behind the earlier "wiped the plans" scare**:
  navigated away (Insights) and back to Planner -- terminal/rack selection
  (Global South · South Rack) and the auto-restored plan (real D2
  product, real gallons, dial back on the correct preset) both survived
  the round trip with nothing wiped. Strong evidence that incident either
  wasn't caused by the unmemoized shell context, or (more likely, given
  this pass) is now fixed as a side effect of memoizing it.
- Equipment modal: opened, attempted a switch to a truck with no prior
  pairing (correctly prompted "New Pairing, enter tare weight"), canceled
  -- selection correctly reverted to the original truck/trailer with no
  stale state.
- One stale-looking console 400 was observed but not chased -- consistent
  with this project's own documented "console never resets for the tab's
  lifetime" behavior (see `browser_console_messages_never_resets` in this
  session's memory), and nothing in the UI showed any corresponding
  error at any point in the walkthrough.

No visible re-render bugs, no stale UI, no lost state anywhere in the
walkthrough. This is the first genuinely live-tested confirmation for
this branch -- ready to merge to `main` on the strength of this pass, not
just the clean build.

### Performance pass #3: React Query added as a shared catalog cache (2026-09-01)

Item #2 from the audit, done on its own branch (`perf/react-query-catalog-cache`,
off `main`'s post-item-#1 commit) per the same safety precedent just set.
Full research pass confirmed the original audit's impression concretely:
7 independent `supabase.from("products")` call sites (`app/admin/page.tsx`,
`IncentiveSettingsModal.tsx`, `PayrollReportModal.tsx`,
`ManageTerminalProductsModal.tsx`, `EditTerminalModal.tsx`,
`terminal/page.tsx`, `useTerminalOutageReports.ts` -- the last refetching
on every 90s poll tick for as long as the Planner layout is mounted), and
`useCompanyRoster` (already a shared hook, 5 call sites) with zero
internal caching -- its `excludeUserId` option confirmed to be a pure
post-fetch filter, never part of the query.

**Added `@tanstack/react-query` v5** -- `app/providers/QueryProvider.tsx`
(new, `"use client"`, `useState(() => new QueryClient())` per the
standard Next.js App Router pattern) mounted in `app/layout.tsx` at the
true root, not scoped to `CalculatorShellProvider` -- `/admin` sits
outside the `/planner` tree entirely and needed to share the same cache.
Global defaults: `refetchOnWindowFocus: false` (a PWA backgrounds/
foregrounds constantly; the library default would cause surprising
refetch storms), `retry: 1`, no global `staleTime` override (set per-query
instead, so nothing not yet migrated to `useQuery` changes behavior).

`lib/queries/useProductsCatalog.ts` (new) -- one canonical fetch (union of
every column any of the 7 sites needed, no `active`/id filter, sorted by
`product_name`), `staleTime: 10 min`. Each consumer applies its own
filter/lookup client-side via `useMemo` (e.g. `admin/page.tsx`'s
`.eq("active", true)` became `.filter(p => p.active)` post-cache) --
preserves every site's exact prior behavior. Also exports
`fetchProductsCatalogCached(queryClient)` for `admin/page.tsx`'s
`loadAll()`, a plain async function (not a component render path) that
can't call a hook directly -- goes through `QueryClient.fetchQuery`
instead, same cache/key/staleTime.

`useCompanyRoster.ts` -- internals only, swapped to `useQuery` keyed
`["companyRoster", companyId]` (no `excludeUserId` in the key, confirmed
unnecessary above). Exported signature unchanged, so all 5 call sites
(`DriverPicker`, `PayrollReportModal`, `UnderloadingDashboardModal`,
`DriverGroupPicker`, Terminal tab) needed zero edits.

**Real bug found and fixed during live verification, not just
typechecked**: after migrating all 7 products call sites, a fresh
`/planner/terminal` load threw React's "Maximum update depth exceeded" in
the console. Root cause: several consumers destructured
`const { data: x = [] } = useProductsCatalog()` -- a bare `[]` default is
a NEW array literal on every render while `data` is still `undefined`
(before the catalog's first fetch resolves), which is normally harmless,
but `useTerminalOutageReports.ts` specifically feeds that value through a
`useMemo` (`productFullById`/`productShortById`) into a `useCallback`
(`fetchAndCompose`) that's itself a `useEffect`'s only dependency -- each
render produced new Maps, a new callback identity, re-firing the effect,
which calls `setState`, triggering another render, forever. Fixed at the
source in the hook itself rather than patching every consumer's
destructuring: `useProductsCatalog()` now returns `query.data ??
EMPTY_CATALOG` where `EMPTY_CATALOG` is a single module-level stable
array -- `data` is never `undefined` for any consumer, so the unstable-
default problem can't recur for this hook, including future consumers
that haven't been written yet.

**Live-verified end-to-end** via the demo login route (`/api/demo/start`)
against real "Test Company Alpha" data: `/admin`'s Incentive Settings
(real ULSD/B100 benchmarks) and its "Add a benchmark product" picker
(`ManageTerminalProductsModal` in pick mode, grouped catalog rendering
correctly) both confirmed working -- two independent consumers nested
three levels deep, same cache. Period Report rendered its correct empty
state for the current period with no errors. `/planner/terminal`'s Status
view (real rack product list with live API/temp readings) and its Edit
Terminal -> Edit Product List (`EditTerminalModal`'s `ProductsView`) both
confirmed rendering the full real catalog correctly. Dispatch tab's
driver picker (`useCompanyRoster` via `DriverPicker`) showed real names.
After the infinite-loop fix, re-verified via a genuinely fresh browser
tab (not just a reload, to rule out any console-buffer staleness) across
`/planner/terminal` and `/planner` -- zero console errors, `Header`'s
outage-report poll (the hook that was looping) mounted and ran clean.
One pre-existing, expected 404 (the not-yet-applied `company_subscriptions`
table -- matches this file's own documented "fails open" design) was the
only console noise seen anywhere in this pass, on `/admin`, before or
after the fix.

`tsc --noEmit` and `next build` both clean throughout every phase.

**Explicitly deferred, not bundled into this pass**: the `terminals`
catalog's own duplication (5+ sites beyond the shared `useTerminals()`
hook, itself mounted twice independently) -- `useTerminals.ts` was just
carefully memoized in the immediately preceding pass; touching its
internals again this soon was judged not worth the added risk before this
pass's own pattern had been proven live. Natural next follow-up, not
started.

**Dev-workflow gotcha, same category as this file's earlier "Dev-server
stale-content trap"**: right after merging to `main` and hot-reloading the
already-running dev server (not a fresh start), the very first live check
threw `Uncaught: No QueryClient set, use QueryClientProvider to set one`
-- alarming, since the merged code was already live-verified clean on the
branch. A genuine dev-server restart (stop + start, not just a page
reload) made it disappear completely, confirmed clean across two
independent fresh-tab checks afterward. Root cause not chased further,
but the pattern matches this app's own prior finding: Turbopack's
Fast Refresh doesn't reliably re-establish a module-level singleton
provider (here, the `QueryClient` created via `useState(() => new
QueryClient())` in the new root-level `QueryProvider`) when the change is
to `app/layout.tsx` itself, the one file HMR can't hot-patch as cleanly
as a leaf component. **Takeaway for next time**: after adding or changing
anything at the root layout / provider level, restart the dev server
before trusting what it shows, don't debug the app code first.

**Recurred the same day, pass #4, with no layout/provider file touched
this time** -- the exact same "No QueryClient set" 500 appeared on a
dev server that had been running continuously through a `git checkout
main` + merge (a lot of file churn under an already-live server, not a
provider edit specifically). A restart fixed it identically. Broadens
the takeaway above: it's not really about *which* file changed, it's
about *how much changed on disk while the dev server kept running* --
after a branch checkout or merge, not just a provider edit, restart
before trusting what's shown.

### Performance pass #4: terminals catalog consolidation (2026-09-01)

The deferred follow-up from Performance pass #3, done the same day on its
own branch (`perf/terminals-catalog-cache`) once the products/roster
caching pattern had been proven live. Fresh research confirmed
`useTerminals()` really is mounted twice independently
(`CalculatorShellContext.tsx` and `app/planner/cards/page.tsx`'s
dispatch-context instance), plus 3 more full-catalog duplicate sites
(`app/admin/page.tsx`, `FleetCardsModal.tsx`, `AdminLoadsModal.tsx`) and
one `.in(terminalIds)` lookup worth folding in
(`app/planner/dispatch/page.tsx`).

`lib/queries/useTerminalsCatalog.ts` (new) -- same pattern as
`useProductsCatalog.ts`, including the stable-`EMPTY_CATALOG`-reference
fix applied from the start this time (no need to rediscover last pass's
infinite-loop bug). `useTerminals.ts`'s own `loadTerminalCatalog()` was
the one clearly separable piece of that hook (everything else --
`loadMyTerminals`, `refreshTerminalAccessForUser`,
`setAccessDateForTerminal`, `deleteAccessDateForTerminal`, `doGetCarded`,
`toggleTerminalStar`, `terminalDisplayInfo` -- is per-user/mutable and
untouched); replacing just that piece with the shared hook means both
mount sites now share one fetch automatically, with **zero changes
needed in `cards/page.tsx`** since it only ever consumed `useTerminals()`,
never queried `terminals` directly itself.

**A second, real pre-existing bug found and fixed as a byproduct of
centralizing, not new scope creep**: `admin/page.tsx`'s own terminals
fetch already had a documented fix for PostgREST's 1000-row cap (the live
catalog is 1,238+ terminals) via paginated `fetchAllRows` -- but
`useTerminals.ts`'s driver-facing fetch, `FleetCardsModal.tsx`, and
`AdminLoadsModal.tsx` never got that same fix, silently capped at 1000
rows the whole time. Centralizing into one canonical fetch meant picking
the *correct* implementation for everyone -- `fetchTerminalsCatalog()`
now paginates for every consumer, not just admin's.

Migrated: `app/admin/page.tsx`'s `loadAll()` (via
`fetchTerminalsCatalogCached(queryClient)`, mirroring
`fetchProductsCatalogCached`), `FleetCardsModal.tsx`,
`AdminLoadsModal.tsx` (all three via the `useTerminalsCatalog()` hook
directly), and `dispatch/page.tsx`'s `.in(terminalIds)` lookup (now a
client-side filter over the cached catalog instead of a network round
trip). `service_types`' own 4-site duplication was investigated and
**deliberately left out** -- unlike products/terminals/roster it's
genuinely mutable per-company data (admin create/edit/deactivate), and
one call site (`SoloEquipmentModal.tsx`) has an existing comment
explaining it deliberately refetches fresh to avoid a same-tick
staleness bug after a save -- consolidating it correctly needs real
`invalidateQueries` wiring into every mutation site, a distinct,
appropriately-scoped later pass.

**Live-verified** via the demo login route against real "Test Company
Alpha" data, after a full dev-server restart (not just a reload, per the
HMR gotcha documented in pass #3): `/admin`'s Fleet Cards (real terminal
search + driver card statuses), the Planner's My Terminals modal (real
card status list), Dispatch tab's terminal-cards section (the migrated
`.in()` lookup, city-grouped, correct dates), Cards tab in dispatch
context (the second `useTerminals()` mount, "Viewing Test Testerson's
terminal cards" with real data), and `AdminLoadsModal` (real load history
with dates/gallons/lbs) all rendered correctly. The admin page's own
"TERMINALS 1238 ACTIVE" count is a concrete confirmation the pagination
fix works -- it would have silently read ≤1000 if the fix were broken.
Confirmed clean (zero console errors beyond the one pre-existing expected
`company_subscriptions` 404) on a genuinely fresh tab.

`tsc --noEmit` and `next build` both clean throughout every phase.

### Card numbers no longer forced into credit-card grouping (2026-09-02)

Per explicit feedback: terminal card numbers were rendering forced into
groups of 4 ("4111 2222 3333 4444") regardless of how the driver actually
typed them in. Root cause was narrower than it looked -- confirmed via a
repo-wide search that `user_terminal_cards.card_number` was **never**
stored or input-formatted with forced spacing at all; the raw string the
driver types is exactly what's saved (`Cards tab`'s back-of-card `<input>`
and the "Add Terminal Card" sheet both pipe `onChange` straight into
state, no mask). The grouping only ever came from one function,
`formatCardNumber()` in `cardTheme.ts`, called from exactly one place --
the Cards tab's front-of-card display (`app/planner/cards/page.tsx`).
`MyTerminalsModal.tsx` already displayed the raw stored value directly,
so the app was already inconsistent with itself (grid view forced-
grouped, terminal-picker view didn't).

Fixed by removing the one call site (render `draft.cardNumber` directly)
and deleting the now-dead `formatCardNumber()` function entirely --
matches this project's own "duplicating/half-fixing this is how the bug
creeps back in" precedent for exactly this kind of half-applied
formatting. Every card number in the app now reads exactly as the driver
entered it, everywhere, no exceptions.

**Live-verified**: a real Chevron card stored as `4111222233334444` (no
spaces) now renders identically on both the Cards tab grid and its own
back-of-card edit view -- previously the grid alone forced it to
"4111 2222 3333 4444". No console errors beyond the one pre-existing
expected `company_subscriptions` 404. `tsc --noEmit` and `next build`
both clean.

## Vault redesign: pattern lock, email recovery, Work/Personal categories (2026-09-02)

Per explicit direction: the numeric PIN "stood out like a sore thumb"
color-wise (the plain 🔒 emoji's native gold/yellow rendering was the one
colorful thing in an otherwise monochrome app), the layout felt generic,
and there was no real recovery flow. Full plan preserved at
`wild-discovering-plum.md`. Confirmed with the user before building:
pattern-only, no PIN fallback.

**Pattern lock** (`app/planner/vault/PatternLock.tsx`, new) -- a
monochrome 3x3 dot grid (plain `<svg>`, Pointer Events for unified mouse/
touch/pen), minimum 4 dots (the real Android minimum), two modes:
`"confirm"` (draw twice, must match -- used for set/reset) and
`"verify"` (draw once, emits the path -- used to unlock). Security model
is byte-for-byte unchanged from the PIN it replaces:
`user_vault_pin.pin_hash` is reused as-is (no column rename), now hashing
a joined dot-path string (`"0-4-8-6-2"`) through the exact same
`sha256Hex()` the old PIN used. The 🔒 emoji is replaced with a small
inline monochrome SVG padlock (`LockIcon`, single fill color, no color
rendering at all) -- directly fixes the "stands out" complaint by
construction.

**A real bug found and fixed during live verification, not just
typechecked**: the component originally gated its pointermove handler on
`drawing` (React state) and read `path` (React state) directly inside
the handlers. Dispatching a fast down+move+move+move+up burst
synchronously (which is exactly how this was caught -- via scripted
`PointerEvent` dispatch, since a 3x3 grid's longest straight line is only
3 collinear dots, short of the 4-dot minimum, so testing needed a real
multi-segment drag) left every handler in that burst reading the
PRE-gesture closure values, since React hadn't committed a render
between them -- `handleMove`'s `if (!drawing) return` silently no-op'd
for every move, so only the initial down's dot ever registered. Real
touch/mouse input naturally spaces events across separate browser tasks
(a render commits between each), so this likely wouldn't reproduce with
a slow real drag, but a fast one could hit the same gap. Fixed by moving
the actual gating/hit-test logic onto refs (`pathRef`, `drawingRef`,
`stageRef`, `firstPathRef`) -- refs update synchronously and can't go
stale regardless of render timing; the React state variables now exist
purely to trigger the visual re-render (dot fill, connecting line).
Live-verified after the fix: a scripted 5-dot zigzag (`0-4-8-6-2`)
correctly registers all 5 dots, transitions to "Draw it again to
confirm," and a matching second draw completes the real Supabase
`user_vault_pin` upsert and unlocks -- confirmed end-to-end against live
data, not just the component in isolation. A wrong second draw shows
"Patterns didn't match"; a wrong unlock attempt shows "Incorrect
pattern," both correctly staying on their respective screens.

**Email-confirmed recovery**, replacing the old instant/unverified
"Forgot PIN -> immediately pick a new one" bypass: new
`app/api/vault/request-reset/route.ts` and
`app/api/vault/confirm-reset/route.ts`, mirroring
`app/api/admin/invite/route.ts`'s exact shape (service-role client,
caller identity verified via `Authorization: Bearer <access_token>`, same
Resend `fetch` pattern). New `vault_reset_tokens` table
(`supabase/migrations/20260902000000_vault_reset_and_website.sql`,
**written, not yet applied**) -- deny-by-default RLS (enabled, zero
policies), only ever touched by these two service-role routes. Neither
route touches `vault_entries` or writes `user_vault_pin` -- confirm-reset
only validates/marks a token used; the client performs the actual
pattern upsert afterward through the same authenticated path pattern
setup always used, so entries are structurally never in this write path
at all. Deliberately does NOT auto-consume the token on page load (a
bare GET, which an email client's own link-scanner could trigger) --
only an explicit tap does that, the same lesson this codebase has
already learned three times for magic links (invite emails, the demo
login route).

**Categories**: Work / Personal preset chips + a "+ Custom" free-text
option (still the same free-text `category` column, no schema change
beyond `website`). Entries now render grouped by category (Work,
Personal, then custom categories alphabetically, then Uncategorized)
instead of one flat list. Card theming keyed off category via one
`themeFor()` helper: Work gets a light card (off-white background, black
text) -- the one deliberate exception to the app's dark theme; Personal
and any custom category share the app's existing dark graphite/white-text
styling, deliberately not a third color scheme (matches `cardTheme.ts`'s
own 2026-08-19 precedent of removing a pastel "card-wallet" palette that
clashed with the dark theme).

**Fields reordered to read like a real password manager**: Label ->
Website (new) -> Username -> Password (renamed from "Password / PIN /
account #") -> Category -> Notes.

**A second real bug found and fixed during this same pass**: both
`saveEntry()` and `deleteEntry()` threw/discarded their Supabase error
without ever surfacing it to the user -- a failed save left the modal
open with no visible feedback (an actual unhandled promise rejection,
caught live while testing against the not-yet-applied migration below);
a failed delete would have optimistically removed the row from local
state while it silently still existed server-side. Fixed with proper
`try/catch` + a visible error banner in both cases (`formError` in the
add/edit modal, `listError` in the entry list) -- a real robustness fix
independent of the migration gap that surfaced it.

**Live-verified** via the demo login route against real data, after a
dev-server restart: pattern set/confirm/verify/wrong-attempt (see above,
full round trip against the real `user_vault_pin` row); "Forgot Pattern"
correctly calls `request-reset` and surfaces a clean, readable error
("Could not find the table 'public.vault_reset_tokens'...") instead of
crashing, confirming the route/error-handling path works even before the
migration exists; saving a Work-category entry correctly surfaces
("Could not find the 'website' column...") the same way. Confirmed clean
(no stray console errors) on a genuinely fresh tab both before and after
the error-surfacing fix.

**Migration applied 2026-09-02** (user ran it in the Supabase SQL
editor). Full follow-up live-verification pass against real data,
same demo/QA account:
- Added a real Work-category entry (label, website, username, password)
  -- saved successfully, rendered with the light card/black-text
  treatment exactly as designed, grouped under a "WORK" section header.
  Expanded it: website line, masked password with a working Show/Hide
  toggle, Edit/Delete buttons all correctly re-themed for the light
  background (previously only ever styled for the dark theme).
- Added a Personal entry and a custom-category entry ("Retirement") --
  both correctly grouped into their own sections (Work, then Personal,
  then custom categories alphabetically) and both share the app's
  existing dark styling, confirming custom categories deliberately do
  NOT get a third color scheme.
- Re-tested "Forgot Pattern" post-migration: the token row now
  genuinely inserts into `vault_reset_tokens` (confirmed by the failure
  point moving from "table doesn't exist" to `RESEND_API_KEY not set` --
  this local dev environment doesn't have Resend credentials, same
  long-standing limitation already documented for the early-access
  form; Production has them). This confirms the auth + token-creation
  path works end-to-end, just not literal email delivery from this
  session.
- Tested `/planner/vault?resetToken=<bogus>` post-migration: lands on
  the informational confirm screen without auto-consuming anything (URL
  correctly stripped via `history.replaceState`, confirmed via
  `window.location.href`); tapping Continue now runs a REAL query
  against the live table and correctly returns "This reset link is
  invalid," with the "Send another email" fallback appearing.
- Test entries cleaned up afterward (deleted via the real UI, using the
  same Delete/Confirm-delete flow -- also verified live) -- demo account
  left at 0 entries, matching its state before this pass.
- Console clean throughout (only the two deliberately-triggered test
  failures above, both already handled with visible error UI, no
  unhandled rejections).

**Merged to `main`** the same day, on the strength of this pass -- the
one remaining gap (literal email delivery) is an environment limitation
this project has always had for testing Resend-based flows locally, not
something left unverified by choice.

`tsc --noEmit` and `next build` both clean throughout every phase.

### Vault reset flow: real bug from the user's first live email test, fixed same day (2026-09-02)

The user's actual first real-world use of the reset-email flow (email
genuinely arrived and worked -- the one piece that couldn't be tested
from this session) hit a real bug: tapping "Continue" on the reset-
confirm screen correctly moved to "Set a new Vault pattern," but
immediately bounced back to "Vault Locked" instead of staying put for
the two-step confirm draw.

**Root cause**: the lock-resolution `useEffect` was keyed on
`[userId, resetToken]`. `confirmResetTap()` clears `resetToken` (via
`setResetToken(null)`) as part of moving to phase `"create"` -- which
re-triggered that same effect (since `resetToken` was one of its
dependencies), and since a `pin_hash` row from *before* the reset still
existed in the DB, the effect's own DB-driven branch fired, re-fetched
it, and overwrote the just-set `"create"` phase back to `"locked"` --
all within what read to the user as a single tap.

**Fixed**: the effect now depends on `[userId]` only. Whether to show
the reset-confirm screen is decided once, from a `resetTokenRef` set
synchronously by the URL-detection effect (which runs first, in the same
initial commit) -- not from the `resetToken` *state*, so clearing that
state later can no longer re-trigger the DB-driven branch. From
`"reset-confirm"` onward, phase transitions are driven entirely by
explicit calls in `confirmResetTap()`/`handlePatternSet()`, never
re-derived mid-flow. The DB-driven resolution itself was extracted into
a shared `resolveLockState()` function, also called directly by
`cancelReset()` (previously relied on the same effect re-firing when
`resetToken` cleared -- would have gone silent/inert under the fix above
without this).

**Live-verified** (since a real token can't be produced from this dev
environment without triggering an actual email send): navigated to
`/planner/vault?resetToken=<mock>`, confirmed the reset-confirm screen
renders, then mocked `window.fetch` to return a successful
`/api/vault/confirm-reset` response (isolating exactly the client-side
race that caused the bug, independent of server-side token validity) --
tapping Continue now lands on "Set a new Vault pattern" and **stays
there** (re-checked after a 2s wait, previously would have already
bounced by then). Completed the full two-step draw -- correctly showed
"Draw it again to confirm," matched, saved, and unlocked. Confirmed the
new pattern is genuinely live in the DB: the OLD pattern was rejected
("Incorrect pattern"), the NEW one unlocked successfully. Also
re-verified `cancelReset()` in both states it can be reached from
(sessionStorage already unlocked -> lands on "unlocked"; freshly locked
-> lands on "Vault Locked") -- both correct. Console clean on a
genuinely fresh tab throughout. `tsc --noEmit` and `next build` clean.

## Landscape layout for the Planner (2026-09-02)

Per explicit direction: rearrange to use the space better when the screen
is wider than it is tall, instead of just stretching the portrait layout
sideways. Confirmed via a full grep first that this was genuinely
greenfield -- zero orientation detection anywhere in the app, no
`matchMedia`/`innerWidth`/orientation `@media` queries outside the
marketing site and one unrelated iOS-zoom fix in `/admin`, and
`public/manifest.json` hard-locked the installed PWA to
`"orientation": "portrait"` -- so an installed app couldn't reach
landscape at all regardless of what the CSS did.

**Scoped to the Planner page only** (`app/planner/page.tsx` +
`app/planner/sections/PlannerControls.tsx`) -- the app's main screen, and
the one with both a real rearrangement opportunity (compartments and the
info-card stack have no reason to be one long vertical column) and an
actively-wrong-for-landscape formula already in the code (compartment bar
height was `vw`-based, which grows exactly backwards once width is
abundant and height is scarce). Cards/Vault/Terminal stay simple vertical
lists for now -- not broken in landscape, just not optimized -- flagged
as natural follow-ups once this pattern proves out, not built
speculatively here.

`public/manifest.json`: `"orientation": "portrait"` -> `"any"`. Can only
be verified on a real installed PWA on a physical device, not from this
session -- same category as other things (like real email delivery) this
project has always had to leave unverified from here.

`app/planner/hooks/useOrientation.ts` (new) -- `useIsLandscape(minWidth =
640)`, following the exact SSR-safe pattern already established for
`useNow()`/`useTheme.ts` (neutral default on server and the client's
first paint, resolved only in a client-only effect) to avoid the same
class of hydration mismatch this project has hit and fixed twice before.
Uses `matchMedia("(orientation: landscape) and (min-width: 640px)")` with
a `change` listener so a real device rotation is caught, not just a
resize. The 640px floor is a deliberate addition beyond the literal
"wider than tall" ask -- a small phone in landscape (~650px CSS width) is
often too cramped for two columns to actually look better than the
existing stack; easy to loosen later if it proves too conservative.

`app/planner/page.tsx`: wrapped `<PlannerControls>` + the CG-slider block
in one new "compartment column" `<div>`, and added conditional flex
sizing to the existing info-card stack's `<div>` (already a single
returned element, no new wrapper needed there) -- both sit inside one new
parent `<div>` whose `flexDirection` is `isLandscape ? "row" : "column"`.
In portrait, `gap: 0` and each child keeps its own pre-existing
`marginTop` values, so the rendered output is provably identical to
before this change (same DOM structure, same styles, just now reached
through one pass-through wrapper) -- no JSX was extracted or duplicated,
which is what makes this safe on the app's single most-used screen.

`PlannerControls.tsx`: new `isLandscape` prop (computed once in
`page.tsx`, passed down -- not a second `matchMedia` call). Only the bar-
height formula branches on it: `isLandscape ? "clamp(70px, 22vh, 130px)"
: <existing vw formula, untouched>`. The file's other `vw`-based font-size
`clamp()`s were left alone -- font size scaling with viewport width is a
normal, harmless pattern; height was the one thing landscape actually
broke.

**Live-verified** via the demo login route, using the Browser pane's
`resize_window` at a real iPhone-landscape dimension (844×390): portrait
(`mobile` preset, 375×812) confirmed pixel-identical to the pre-change
stacked layout; landscape correctly shows compartments (left, ~55%) and
the info-card stack (right, ~45%) side by side, with the RELOAD button
and Recap card both fully visible and correctly positioned (`x:468.6,
width:347.4`, confirmed via `getBoundingClientRect()` -- fits cleanly
inside the 844px viewport) and zero horizontal overflow
(`document.body.scrollWidth === clientWidth`). Confirmed the bar-height
fix is genuinely active, not just present in the code: measured compart-
ment bar height at 85.8px, exactly `22vh` of the 390px viewport height
(within the `clamp(70,...,130)` range) -- the old `vw` formula would have
produced a different value (110px) at this width, so this proves the
landscape branch is really the one executing, not a coincidence.

A stale Turbopack parse-error message appeared in one long-lived test
tab's console buffer after these edits, surviving even a `.next` cache
wipe and full dev-server restart -- but the *page itself* rendered
completely and correctly (a genuine unrecovered parse error blocks the
whole page, not just logs a console line) both in that tab and,
conclusively, in a brand-new tab with zero console errors at all. Same
category as this project's other documented dev-server staleness
quirks -- not a real regression, `tsc --noEmit` and `next build` were
clean throughout and after.

### Landscape layout refinement, per marked-up screenshot (2026-09-02, same day)

User sent a screenshot of the freshly-shipped landscape layout with red
hand-drawn markup and four concrete asks: narrow the active-tab underline
(and make it more visible), shift the preset dial so the active letter
sits under the Planner tab, move compartments to the right (info-cards
left) with the compartment section's height matching/filling the info-card
column's height, and narrow the info-card column so compartments get more
of the room -- "everything can scale up dynamically to fit the screen."

**Tab underline** (`CalculatorLayoutClient.tsx`'s `TabBar`) -- was three
`flex:1` segments (dim/bright/dim) spanning the full tab width, only the
middle third actually lit. Replaced with a fixed `flex:"0 0 120px"` bright
segment (matching each tab's own 120px width) between two dim `flex:1`
fillers, `height` 2px->3px, `marginTop:-4` to nudge it up nearer the tab
label. Since every tab is scroll-snap-centered to the same horizontal
center `centerTab()` always targets, a fixed-width bar centered in the row
below it lands under whichever tab is active without any per-tab position
tracking.

**Compartments moved right / info-cards narrowed** (`page.tsx`,
`PlannerControls.tsx`) -- the landscape row's split changed from ~55/45 to
`flex:"1 1 62%"` (compartments, `order:2`) / `flex:"1 1 38%"` (info-cards,
`order:1`) -- `order` alone flips which side each renders on without
touching JSX/DOM position, unchanged from the original pass. Compartment
bars now genuinely fill the taller column instead of stopping at a fixed
clamp: a new `fillColumn` style (`display:flex, flexDirection:column,
height:"100%"`) threads down from `PlannerControls`'s `<section>` through
the bar-holder wrapper and the bar-columns row (`alignItems: isLandscape ?
"stretch" : "flex-end"`), and the bar `<div>` itself switches from a fixed
`height: barH` to `flex:1, minHeight:0` in landscape (portrait keeps the
exact prior fixed-height formula, `barH` is used nowhere else in the
file). `minHeight:0` sidesteps flex's own `min-height:auto` default, the
same class of gotcha this file already fixed once for grid-item
`min-width` (Product List row, 2026-08-06). Live-verified: both columns
measure equal height via `alignItems:stretch` (486px vs 480px, the small
diff being padding), and bars grow to 317px -- filling the column instead
of the old fixed clamp -- with product-code/CG-slider content correctly
occupying the remainder below the bars, not literal unused dead space.

**Preset dial "under Planner tab" -- a real, pre-existing bug found and
fixed, not just a positioning tweak.** The original pass's plan was to
relocate the dial into the (now narrower, right-shifted) compartments
column, reasoning its own scroll-snap centering would then center within
that column instead of the full page. Live-testing that reasoning found
two problems: (1) even correctly centered *within* the compartments
column, that column's own center (real x=576) doesn't align with the
Planner tab's center (x=422) -- the column is offset right, not
viewport-centered, so nesting the dial there was never going to land
under Planner regardless of the internal math; (2) `PresetDial.tsx`'s
`centerSlot()` was actually computing the scroll target from
`el.offsetLeft`, which is relative to the nearest *positioned* ancestor
(any `position: relative/absolute/fixed` element up the tree) -- not the
scroll container itself, which has no explicit `position` set (only
`overflow-x:auto`). Confirmed live in **both** orientations before
touching any layout code: the active slot (A) was scrolled fully
off-screen (portrait: `rect.x = -24`, literally negative/invisible) while
an unrelated middle slot (near C/D) sat centered instead -- a real,
already-broken bug, not something this landscape pass introduced.

Fixed `centerSlot()` to use `getBoundingClientRect()` deltas
(`container.scrollLeft + (elRect.left - containerRect.left) + ...`)
instead of `offsetLeft` -- viewport-relative regardless of positioning
context, matching the same (already-correct) approach `onScroll()` in the
same file already used to figure out which slot is centered after a
manual swipe. With that fixed, reverted the dial back to its original
single full-width location (above the two-column row, same spot in both
orientations) instead of nesting it in the narrower landscape column --
since that row spans the same width as the tab bar itself, centering the
active slot within it now lands under whichever tab is horizontally
centered in the header (Planner) automatically, in both orientations,
with no extra alignment math needed. The narrower-column relocation
(`isLandscape && <div>{presetDialEl}</div>` inside the compartments
column) was removed entirely -- one `presetDialEl` render site now, not
two.

**Live-verified** via the demo login route at 844x390: active letter (A)
now measures center-x 422.0, exactly matching the Planner tab's own
measured center-x 422.0, in landscape. Re-checked portrait (375x812) as a
regression check and found it *improved*, not just unaffected -- the same
underlying `offsetLeft` bug had A scrolled off-screen there too before
this fix; portrait now also correctly centers A under Planner. Screenshot-
confirmed the full visual: underline directly under "Planner", dial
letter A directly below it with its active-dot, compartments on the right
(wider), info-cards on the left (narrower), bars visibly taller/filling
the column. `tsc --noEmit` and `next build` both clean throughout.

### Landscape refinement, round two: compartments widened further, page padding trimmed (2026-09-02, same day)

Per explicit follow-up: "make the compartment section wider so it keeps
the same proportion it had in portrait mode but scale the button/report
section and the compartment section up so it fits the entire width of
the screen" -- read as two asks together: (1) compartments should carry
close to the same visual dominance they have in portrait, where they're
the only thing on the row (effectively 100% width) -- the 62/38 split from
the first refinement pass still left them feeling squeezed down toward
parity with the info-card column; (2) both columns should grow, not just
compartments at the info-card column's expense, by reclaiming whatever
outer margin was going unused instead of the row staying inset from the
true screen edges.

**Page padding** (`app/planner/page.tsx`): a new `pageStyle` override
trims the Planner root div's own side padding from 16px to 6px, but only
in landscape (`isLandscape ? { ...styles.page, paddingLeft: 6, paddingRight:
6 } : styles.page`) -- portrait's shared `styles.page` (used by every
other page too) is untouched. Kept symmetric on purpose: the preset
dial's own "center within this content width" math (see the round-one
fix above) only lands exactly under the Planner tab's viewport-center
because the page's left/right padding are equal -- shrinking both sides
by the same amount keeps that alignment intact while reclaiming ~20px of
total width for the row below.

**Split widened again, empirically bounded, not guessed**: tried 74/26
first -- reverted immediately, confirmed live via a `scrollWidth >
clientWidth` sweep of every `text-overflow:ellipsis` element that it
truncated the info-card column's own two-field rows (`"Card #
4111222233334444   Exp. 57 days"` on the Terminal card, the longest real
row on this page). Backed off in two more measured steps (68/32, then
65/35) re-running that same truncation sweep each time -- 65/35 was the
first split that came back with **zero** truncated nodes, so it's used
as the actual ceiling this specific page's real content allows, not a
round number picked by eye. Also trimmed the inter-column gap from 16 to
10 to reclaim a little more width for both sides. Comments at both split
sites in `page.tsx` record the 74/26 attempt and why it was reverted, so
a future pass doesn't rediscover the same ceiling by trial and error.

**Live-verified** via the demo login route at 844x390: info-card column
measured 279px wide (from 293px in the very first pass, but zero
truncation, vs. 207px/broken at the rejected 74/26 attempt), compartments
column widened correspondingly; Truck/Trailer, Terminal/card-number, and
temp-prediction rows all render fully un-truncated in both a raw
`getBoundingClientRect`-based sweep and a screenshot check. Preset dial's
active letter re-confirmed still centered exactly under the Planner tab
after the padding change (symmetric padding preserved the alignment, as
expected). Portrait re-checked at 375x812 and confirmed pixel-unaffected
-- the padding override and both flex-basis changes are landscape-only.
`tsc --noEmit` and `next build` both clean throughout.

### Recap/points cards relocated out of the info stack; new wide (desktop) tier fills vertical space too (2026-09-02, same day)

User's phone auto-rotate doesn't trigger this app's landscape layout at
all (confirmed this session it's very likely the installed-PWA manifest
cache, not a code bug -- `public/manifest.json`'s `orientation` was
already fixed to `"any"` earlier this session, and a repo-wide grep found
zero `screen.orientation.lock()` or other JS-side lock anywhere in the
app; Android/iOS caches a PWA's declared orientation at *install* time,
so an existing home-screen shortcut keeps the old portrait-locked
behavior baked in until removed and re-added -- told the user to try
that). With rotation unavailable, desktop became the only real test
surface this session -- and at genuine desktop width the two-column
layout from the round-one/round-two passes looked wrong for a different
reason: proportions that read fine on a narrow phone-landscape strip
looked cramped and empty-feeling on a much wider window.

User's own proposed fix, implemented close to verbatim: drop the RECAP +
incentive-points cards out of the info-card stack entirely (their combined
height is roughly what made that stack taller than the compartments
needed to match, per the user's own observation comparing portrait's
compartment-strip height to the stack "without recap and points"), place
them side by side in their own row under the two-column layout on a
normal phone-landscape width, then relocate that same side-by-side pair
into a third column next to compartments once the screen is genuinely
wide ("really wide screens... fill up the empty space... zoom the whole
thing in").

**New `isWide` tier** (`app/planner/page.tsx`): a second call to the same
`useIsLandscape(minWidth)` hook from the round-one pass, just a bigger
threshold -- `useIsLandscape(1024)` -- no changes needed in
`useOrientation.ts` itself. 1024px was picked because the largest real
phones still land under ~930px in landscape, so this tier can only ever
be reached by a genuine tablet or desktop window, never a phone turned
sideways.

**`recapPointsEl(mode: "row" | "column")`**: the RECAP card and the
incentive running-average card, extracted out of the inline IIFE that
builds the info-card stack into one render function taking a layout mode
-- one implementation instead of three independent copies (portrait's
original spot, the wide third column, the narrower-landscape below-row),
matching this project's own established "duplicating this is how the bug
creeps back in" precedent. The whole info-cards IIFE now returns a
Fragment (`<>{mainInfoStack}{isWide && <div order:3>...}{isLandscape &&
!isWide && <div order:4>...}</>`) instead of a single div, since it needs
to place up to three independent pieces into the row now, not one.

**A real, non-obvious CSS bug hit and fixed while wiring the below-row
in**: giving the row wrapper `flexWrap: "wrap"` (so the order:4 below-row
element, `flex-basis: 100%`, could fall onto its own line) at first broke
the two EXISTING columns too -- every column rendered full-width and
stacked on its own separate line instead of sharing one. Root cause:
percentage `flex-basis` values that sum to exactly 100% (65%+35%) still
overflow once the row's own `gap` is added on top, and a *wrapping* flex
container resolves an overflowing line by giving each item its own line
(shrink only applies within a line the browser has already decided on --
it doesn't get a chance to prevent the wrap in the first place). Fixed by
switching every column from a basis-driven `flex: "1 1 65%"` to a
grow-RATIO value with `flex-basis: 0%` -- `flex: "65 1 0%"` -- the
standard pattern for exactly this "N columns that split available width
by ratio, with gaps" case: a 0% hypothetical size always fits on the
current line regardless of gap, and the ratio still distributes the real
leftover width correctly once placed.

**Column split retuned for the new isWide tier**: compartments 50%
(down from 65, since there's now a third column competing for room),
info-card stack 27% (down from 35), new recap/points third column 23%,
vertically centered (`justifyContent: "center"`) rather than stretched --
two small cards stretching across a much taller matched row height would
otherwise leave an awkward gap, not fill it meaningfully.

**Filling the actual vertical dead space, the "zoom in" ask**: even after
the column relocation, wide mode still had a lot of empty space below the
row -- confirmed live at 1400x800, the row's own height (299px) was only
ever as tall as its shortest-content column (Equipment/Location/Temp/Load
button) naturally needed, regardless of how much taller the real
viewport was, leaving ~340px of dead black space underneath. Root cause:
`alignItems: stretch` only matches columns to each OTHER's natural
height within the row -- it says nothing about the row's own height
relative to the viewport. Fixed with a wide-only `minHeight: "calc(100vh
- 200px)"` on the row wrapper (200px approximates the header + tab bar +
bottom breathing room above/below the row, not an exact measurement of
either -- both vary with banners/content) -- combined with
`alignItems: stretch` and the compartments column's pre-existing
`flex: 1` chain (from the round-one pass's height-fill work in
`PlannerControls.tsx`), this is what actually grows the compartment bars
themselves to fill the reclaimed space, not just a taller empty div.
`mainInfoStack` gained `justifyContent: "center"` (wide only) so its
now-shorter-than-the-row card stack centers as a group in the extra
height instead of leaving all the slack pinned at the bottom.
Deliberately NOT applied to narrower landscape -- a real phone turned
sideways already has genuinely little vertical room and needs to scroll
normally; forcing it to stretch into a `100vh` that's already fully
occupied would just be wrong.

**Live-verified** via the demo login route: at 1400x800, the row's
height grew from 299px to 600px and the previously-~340px gap below it
dropped to 38px, with no scrollbar introduced (`document.body.scrollHeight
=== window.innerHeight`); compartment bars visibly much taller in the
resulting screenshot, RECAP/points column correctly positioned to the
right of compartments and vertically centered. Re-checked the narrower
845x390 landscape tier -- unchanged from the round-two pass, below-row
still renders correctly side by side under the two columns. Re-checked
right at the isWide boundary (1060x600) -- three columns fit without
truncation (0 truncated nodes in the same `scrollWidth>clientWidth`
sweep used for the earlier width-tuning passes). Portrait re-checked at
375x812 -- pixel-unaffected, RECAP/points render inline in their
original spot exactly as before. `tsc --noEmit` and `next build` both
clean throughout.

### The vertical-fill pass above was reverted the same day -- compartments stay fixed size, buttons shrink instead

User rejected the whole "zoom in / fill vertical space" direction from a
real desktop screenshot, with a hand-drawn reference mockup attached:
"we definitely don't want to stretch the compartment height at all. The
compartment section needs to stay in the same proportion, same ratio no
matter the screen size. In fact lets not even scale it, just shift it
over. Take space out of the buttons."

**`PlannerControls.tsx`** — the whole `fillColumn`/`flex:1` chain from
the round-three pass (`<section>` → bar-holder wrapper → bar-columns row
→ each bar) is gone. The bar `<div>` is back to a fixed `height: barH`
in every orientation, portrait and landscape alike — `barH`'s own
landscape branch (`clamp(70px, 22vh, 130px)`, from the very first
landscape pass) was already computing the right value all along, it just
wasn't being applied once the round-three fill-chain took over. `alignItems`
on the bar-columns row reverted from `isLandscape ? "stretch" : "flex-end"`
to always `"flex-end"`.

**`app/planner/page.tsx`**:
- The wide-only `minHeight: "calc(100vh - 200px)"` on the row wrapper is
  removed outright — the row is never forced taller than its content
  needs, on any screen size.
- Compartments' flex-basis is now a **flat, unconditional `"65 1 0%"`**
  — narrow landscape and isWide alike. It no longer drops to 50% to make
  room for the third column; per the user's own framing, whatever room
  the third column needs comes entirely out of the info-card column's
  share instead (35% → 18% on isWide).
- **A real, separate bug found while re-verifying, not introduced by
  this revert**: `styles.page`'s `maxWidth: 1100` (shared by every page
  in the app, untouched since before this whole landscape project) was
  never accounted for in any of the landscape passes. On a 1400px-wide
  viewport the row measured only ~1088px, `margin: "0 auto"` centering a
  page still capped at 1100 regardless of the padding fix from round two
  — confirmed live via `getBoundingClientRect()` before touching layout
  math further, not guessed at. `pageStyle` now also raises `maxWidth` to
  1800 on isWide (portrait and non-wide landscape keep the original 1100
  unchanged) — this, not the flex math, was the actual reason the
  three-column row looked cramped rather than merely "wrong proportions."
- **Real truncation hit and fixed while re-verifying, not shipped
  blind**: a flat 18% for the info-card column truncates badly at
  realistic wide widths ("Truck · 25184-A" → "Truck · 2...", confirmed
  live at 1400px) — a low percentage doesn't guarantee the same real
  pixel floor (279px, the ceiling already established in the round-two
  pass) at every viewport width the way it did when compartments were
  the ones giving up room. Fixed with `minWidth: 279` on isWide (not a
  bigger percentage, which would just re-shrink compartments) — below
  that floor, this column keeps more than its nominal 18% share and
  compartments' own unconstrained flex-grow ratio absorbs the
  difference, so compartments does end up narrower than a strict 65% at
  the tight end of isWide's range (e.g. 449px of a 1024px-wide row, ~49%,
  not 65%) but never below what's needed to keep the info-card column
  legible. Same real problem, same fix, for the third (recap/points)
  column: `minWidth: 240` (found by watching "7,785 gal" wrap onto two
  lines at a first-guess 190px floor, then raising it until a live
  height check confirmed a single 30px line instead of a 60px wrapped
  one).

**Known, explained tradeoff, not a silent compromise**: compartments is
only genuinely a fixed 65% throughout the *non-wide* landscape range and
at the wide end (e.g. 62% at 1400px, close to 65). Right at the isWide
threshold (1024px) it measures closer to 49%, since both neighboring
columns' pixel floors take a proportionally bigger bite of a narrower
row. This is deliberate — the alternative (a literal, unconditional 65%
at every width) reintroduces the truncation bug above, which is a worse
outcome than compartments being modestly narrower right at one edge of
one breakpoint's range.

**Live-verified** via the demo login route: bar height confirmed fixed
at 130px at 1400x800 and 85.8px at 844x390 (each exactly matching
`barH`'s own clamp for that viewport height, not stretched to match a
neighboring column) — the second, narrower value only after discovering
and working around a resize-tool quirk where `useIsLandscape`'s
`matchMedia` state didn't re-evaluate on a simulated viewport resize
without a full page reload (the underlying `matchMedia(...).matches`
itself was already correct; a real device resize event doesn't have
this gap, since it isn't going through this same simulated-resize path
at all). Re-swept for truncated/wrapped text at 1024px (boundary), 1400px,
and 844px — zero truncated nodes and no wrapped stat lines at any of the
three. Portrait re-checked at 375x812, pixel-unaffected. `tsc --noEmit`
and `next build` clean throughout.

### Landscape sizing rewritten again: fixed-width block + uniform CSS scale, replacing percentage-flex entirely (2026-09-02, same day)

The fixed-percentage-plus-fixed-height compromise from the previous
entry was itself rejected the same day, with two real desktop
screenshots as evidence: "we are still stretching the width and getting
the compartments out of proportion with different size screens... it is
a representation of the side profile of a trailer. If anything scales
up, everything scales up, buttons included." Root cause: compartments'
width was still a flex-grow RATIO (`"65 1 0%"`) with no upper bound,
while height was a plain fixed clamp (the previous entry's own revert)
-- on a genuinely wide desktop window, width kept growing to fill
available space while height stayed pinned, visibly flattening the bars
more the wider the window got. The two earlier landscape passes'
underlying model -- percentage-of-container sizing -- was the thing that
had to go, not just one more tuning pass on top of it.

**New model**: every column (compartments, buttons, and recap when
isWide) gets a fixed REFERENCE pixel width (`REF_COMPARTMENTS_W = 550`,
`REF_BUTTONS_W = 279` -- the no-truncation floor already established
live in the prior pass, `REF_RECAP_W = 240`), laid out in a
`naturalRowWidth`-wide flex row (839px for compartments+buttons, 1089px
with recap on isWide). That whole fixed-width row is wrapped in one CSS
`transform: scale(rowScale)` (`transformOrigin: "top center"`, so it
stays visually centered at any scale), where `rowScale =
availableWidth / naturalRowWidth`, clamped to [0.5, 1.6]. A uniform
transform can't distort anything -- bar width, bar height, font size,
gaps, all multiply by the exact same factor -- so the compartments keep
the same real-world-proportioned shape at every screen size, and
buttons/recap scale right along with them instead of being negotiated
independently through flex-grow. This also incidentally solves the
truncation problem the percentage approach kept fighting with minWidth
floors: text and its container now scale together by construction, so
whatever fits at the 1x reference size fits at any scale.

**`PlannerControls.tsx`**: `barH`'s landscape branch changed from
`clamp(70px, 22vh, 130px)` to a flat `"100px"`. The vh-clamp was a
SECOND, uncoordinated scaling mechanism (varies with viewport HEIGHT)
layered on top of the new WIDTH-driven outer scale -- exactly what was
still producing different bar aspect ratios at different screen sizes
even after the fixed-width rewrite above, confirmed live (aspect ratios
differed between 844px and 1400px viewports until this was fixed, and
matched exactly afterward). One fixed pre-scale reference value is all
the outer transform needs.

**`app/planner/hooks/useElementWidth.ts`** (new) -- measures the fixed-
width block's actual available container width live via a callback ref
(not a plain `useRef` + one-time `useEffect`, which would miss the
element being replaced by a different DOM node later) plus a
`ResizeObserver`. **A second real bug found and fixed while verifying
this against real values, not assumed working from a clean typecheck**:
in this session's own browser-automation test environment,
`ResizeObserver` fired exactly once (for the element's initial size) and
never again despite a real, confirmed subsequent resize of that same
element (page.tsx's `isLandscape`/`isWide` hooks resolve asynchronously
after their SSR-safe portrait-default first paint, and that resolution
changes the element's parent's `maxWidth`/padding -- a genuine layout-
affecting size change) -- debug-logged directly (`sync:1068` once, zero
`ro:` entries, ever) rather than guessed at. Worked around with two
redundant fallbacks matching this codebase's own established pattern
(`FitHeading.tsx` already uses a `window.resize` listener for exactly
this class of problem): a `window` `"resize"` listener, and a short
burst of settle-timers after mount (0/50/150/400/1000ms) that re-measure
regardless of whether `ResizeObserver` itself ever fires again. Confirmed
live this fully fixes it: the debug readout went from a permanently
stuck `avail=1068` (which is exactly what `styles.page`'s OLD
maxWidth:1100/padding:16 would produce at that viewport -- the
observer's one-and-only reading, taken before the corrected wide-mode
page style ever applied) to the correct, live `avail=1364` matching the
DOM's actual current `clientWidth` at that same moment.

**Live-verified** via the demo login route, the definitive check this
whole rewrite needed -- bar aspect ratio (width÷height) measured
identical to three decimal places across every tested width: 2.103 /
0.714 / 2.443 (three compartments) at 844px, 1024px (the isWide
boundary), AND 1400px, all matching exactly -- confirming genuinely
uniform scaling with zero distortion at any screen size, the actual
literal ask. Zero truncated nodes at any of the three widths either.
Portrait re-checked at 375x812, pixel-unaffected (untouched code path).
`tsc --noEmit` and `next build` clean throughout. Temporary debug
instrumentation (a visible on-screen readout, plus a
`window.__ewDebug` log array in the hook) was added to actually observe
the `ResizeObserver` bug directly rather than guess at it, then removed
before this was considered done.

### First real-device landscape test: auto-rotate fixed, dial repositioned, width measurement hardened (2026-09-02, later same day)

User's phone auto-rotate had never worked for this app all session --
resolved by asking two clarifying questions (install state, platform)
rather than guessing: installed to the home screen, Android. Confirmed
both prerequisites were already correct and already deployed to
production (Vercel auto-deploys `main`, confirmed the latest deploy was
~19 minutes old at the time) -- `manifest.json`'s `orientation: "any"`
(this session, earlier) and the service worker's network-first
`manifest.json` fetch (a pre-existing fix from 2026-08-11, well before
this session). Neither needed a code change; Android caches a PWA's
declared orientation at the moment "Add to Home Screen" is tapped, and
doesn't re-read the manifest for an already-installed shortcut just
because the site changed later. Fix was device-side: remove the home
screen icon, revisit the site, re-add it. Confirmed working -- this
produced the first-ever real-device screenshot of the landscape layout,
surfacing two real problems no amount of Browser-pane testing could
have caught.

**1. Header/dial consumed too much vertical space.** On a real phone's
actual landscape height (much shorter than this session's own
844x390/1400x800 test viewports, screenshot showed OS status bar + app
header + tab bar + the full-width preset dial all stacked before any
real content began -- roughly half the visible screen). The preset dial
being full-width (a deliberate choice from earlier in this session, so
its own centering landed under the Planner tab) was the reclaimable
piece: "the header portion takes up way too much space... keep the
header portion just above the left buttons only." `presetDialEl` (the
same element, unchanged) now renders in one of two spots depending on
`isLandscape` -- portrait keeps its original full-width slot; landscape
moves it inside `mainInfoStack`, as the first child above the Equipment
card, confined to that column's own `REF_BUTTONS_W`. This reverses the
under-Planner-tab centering from earlier in the session -- an accepted,
explicit tradeoff per this follow-up, not an oversight -- and lets
compartments start right at the top of the scaled row, immediately under
the tab bar, with no dial-height gap above it.

**2. Compartments appeared to run off the edge of the screen** -- the
screenshot showed Android's own on-screen navigation bar rotated to a
vertical strip on the right edge in landscape (a well-documented Android
behavior), with app content extending toward or under it. Two defensive
fixes to `useElementWidth.ts`, since this can't be reproduced or verified
from this session's own test environment (a real device's Android
Chrome, not the Browser pane):
- Measured width is now capped at `window.visualViewport`'s own width
  (via `Math.min(el.clientWidth, visualViewport.width)`) wherever
  `visualViewport` is available, not just the observed element's
  `clientWidth` alone -- `clientWidth` reflects the CSS layout viewport,
  which doesn't necessarily shrink for an overlapping nav-bar strip the
  way it does for an on-screen keyboard; `visualViewport` is specifically
  the API for "how much is actually visible right now." Also now
  re-measures on `visualViewport`'s own `resize`/`scroll` events, not
  just `window`'s.
- The settle-timer schedule (this session's own earlier fix for the
  `ResizeObserver`-not-firing-again bug) extended from ending at 1s to
  ending at 3s (`[0, 50, 150, 400, 1000, 2000, 3000]`) -- a real device's
  hydration/layout settle can plausibly run slower than this session's
  own test environment, and a schedule that ends too early just freezes
  on whatever the layout happened to look like at that moment, the exact
  same failure shape as the original bug.
- `app/planner/page.tsx`'s `rowScale` calculation now subtracts a fixed
  8px safety margin from the measured available width before dividing --
  an exact-fit calculation risks a 1px overflow from nothing more than
  subpixel rounding, which is a real horizontal scrollbar/clipped edge
  on a device, not just a cosmetic rounding artifact.

**Explicitly not done, flagged rather than guessed at**: a more
aggressive fix -- setting `viewport-fit: "cover"` plus explicit
`env(safe-area-inset-*)` padding, the standard PWA pattern for content
genuinely rendering *underneath* notches/nav-bars -- was considered and
deliberately not made. That's a global, page-wide viewport behavior
change (affecting every route, not just landscape Planner), and doing it
wrong risks the opposite regression (content that used to correctly
avoid unsafe areas suddenly extending into them without correct
compensating padding) -- a materially higher-risk change than hardening
this hook's own measurement, with no way to verify either direction from
this session. Worth revisiting specifically if the visualViewport-based
cap above turns out not to be enough on a real retest.

Not independently live-verified against a real device this pass (no
access from this session) -- re-checked at 844x390, 1400x800, and
375x812 in the Browser pane: dial correctly confined to the left column
in both landscape tiers (portrait unaffected), zero horizontal overflow,
zero truncated text, bar aspect ratio still exactly 2.103/0.714/2.443 at
every width (the uniform-scale fix from the previous entry still holds).
`tsc --noEmit` and `next build` both clean. Genuinely worth a second
real-device look once redeployed.

### Landscape layout, third pass: symmetric 3-column composition, inline header tabs, and a real centering bug found live (2026-09-02, later same day)

User's next follow-up (still working from the same real Android device)
gave a much more specific target layout, described in five numbered
points rather than a general complaint -- read and implemented close to
verbatim, not reinterpreted:

1. **Buttons (Equipment, Location, Temperature) shift LEFT.**
2. **Compartments remain centered** -- just the compartments and the CG
   slider, nothing else riding along with them.
3. **Plan Slots, Recap, Points, Reload Button shift to the right side.**
4. **Header**: "this allows a wide gap in the header between the nav
   hamburger and the bell/sprocket. Shift the Tabs up in between them by
   reducing the header height."
5. **Never let anything shift off the sides -- vertical scroll is fine,
   horizontal scroll is not.**

**`app/planner/page.tsx` -- symmetric 3-column composition, always.**
The isWide-conditional 2-vs-3-column split from the previous two passes
(a narrower landscape got compartments+buttons only, with recap either a
third column or a below-row depending on a 1024px breakpoint) is gone
entirely -- every landscape width now uses the SAME composition: left
column (Equipment/Location/Temp, `mainInfoStack`, order:1), center
column (compartments + CG slider, unchanged, order:2), right column
(Plan Slots/Load button/recap/points, new `rightStack`, order:3) -- just
uniformly scaled to fit via the same `transform:scale` mechanism from
the previous pass. `isWide` itself (the `useIsLandscape(1024)` call, and
every branch that read it) was removed outright as genuinely dead code
once nothing depended on it anymore -- including the now-pointless
`isWide` prop PlannerControls.tsx never actually used.

Two reference widths simplified to one: `REF_BUTTONS_W`(279)/
`REF_RECAP_W`(240) replaced by a single `REF_SIDE_W`(279) used for BOTH
side columns -- this is what makes point 2 ("compartments remain
centered") literally true rather than approximately true: two
differently-sized side columns can only ever make the center column
*appear* roughly centered depending on their size difference; two
IDENTICAL side columns make it centered by construction, regardless of
content differences (recap/dial content is simply top-aligned within its
column's fixed width, same as the left column, rather than sized to fit
its own content).

`loadButtonEl`, `loadBlockedMsgEl`, `footnoteEl` extracted as plain
consts (same pattern already established for `mainInfoStack`/
`recapPointsEl`) so the exact same elements render inside `mainInfoStack`
in portrait (unchanged position) or inside the new `rightStack` in
landscape, never both. `recapPointsEl` itself dropped its `"row" |
"column"` mode parameter -- "row" mode only ever served the now-removed
below-row layout; nothing calls it anymore, so the parameter and its
conditional styling were removed rather than left as a dead, never-taken
branch. Preset dial (`presetDialEl`) moved for a third time this session
-- full-width (round one) -> above the left column (round two, "keep the
header just above the left buttons") -> now inside `rightStack` (this
pass, "Plan Slots... shift to the right side"). Each move superseded the
last rather than layering on top of it.

**`app/planner/CalculatorLayoutClient.tsx` -- inline header tabs,
shared across every tab, not just Planner.** `TabBar` gained an `inline`
prop (alongside the existing `compact`): smaller per-tab slot (84px, not
120), smaller text, no `marginTop` (it's now a flex child of the icon
row itself, not a stacked block below it), and no underline row at all
(the active tab is still readable from its own bolder/brighter text
alone; the underline's own height was exactly the kind of space this
mode exists to reclaim). `centerTab`/`onScroll`'s own scroll-snap-
centering logic needed no changes -- both already read real element
rects rather than a hardcoded tab width, so they adapt automatically.
`Header` now calls `useIsLandscape()` directly and, when true, renders
`<TabBar inline />` in the SAME row as the hamburger/bell/gear (`flex:1`
between them) instead of rendering the full `<TabBar>` as its own row
underneath -- shrinking the header's total height, which is what
actually frees the vertical room point 1-3's column reshuffle needed.
Applies to every route under this shared layout (Dispatch/Insights/
Planner/Cards/Vault), not just Planner, live-verified on Cards too --
there was no reason a driver would want a taller header specifically
elsewhere.

**A real, separate centering bug found live while verifying point 2,
not assumed working from a clean typecheck**: the scaled block's own
`margin: "0 auto"` centering (in place since the sizing-model rewrite
two passes ago) turns out to only correctly center a box NARROWER than
its container. Once `rowScale` actually needs to shrink the block
(`naturalRowWidth` 1128px exceeding the available width -- the common
case on a real phone, not an edge case), the PRE-scale layout box is
WIDER than its parent, and CSS resolves that "negative auto margin"
case to zero rather than splitting the overflow evenly -- so the box
sat flush against its container's left edge instead of centered, and
`transform:scale()` then shrank it around THAT off-center point,
visibly shifting the whole block right. Confirmed by direct measurement
before touching anything: at 844px wide, the block's own rendered
center landed 160px right of the container's true center, with the
right (recap/points) column's edge extending to x=982 in an 844px
viewport -- silently clipped by `ShellChrome`'s own `overflow:"hidden"`
rather than producing a scrollbar (`document.body`'s own overflow
measurement read a deceptive 0 throughout, since the clip happens at a
nested ancestor, not `document.body` itself). This is almost certainly
what the previous pass's real-device "compartments shifted off screen"
report actually was, not (or not only) the Android-nav-bar theory that
pass defensively hardened `useElementWidth` against -- that fix wasn't
wrong to make, but this centering bug would have produced the exact
same symptom on its own, on any landscape width narrower than 1128px
reference-equivalent, nav bar or not.

Fixed with the standard `left: 50%` + `transform:
translateX(-50%) scale(rowScale)` pattern instead of `margin: "0 auto"`
-- `left:50%` resolves against the PARENT's width (always correct,
regardless of the element's own size), and `translateX(-50%)` shifts
back by half of the ELEMENT's OWN layout width (also always correct,
regardless of relative sizing) -- unlike margin:auto, this combination
centers correctly whether the box is larger or smaller than its
container.

**Live-verified** via the demo login route at 844x390 and 1400x800:
compartments' own measured center matches the viewport's true center
exactly at both widths (422.0 at 844px, 700.0 at 1400px); both side
columns measured symmetric (22px margin from each screen edge at both
widths); bar aspect ratio still exactly 2.103/0.714/2.443 (the uniform-
scale property from the previous pass survived this restructure, as
expected -- nothing about the scale math itself changed, only the
column composition and the centering method); zero truncated text,
zero horizontal overflow at either width. Inline header tabs confirmed
on both the Planner and Cards routes. Portrait re-checked at 375x812,
pixel-unaffected (both the page and the header's own inline-tabs branch
are isLandscape-gated). `tsc --noEmit` and `next build` clean
throughout. Not independently verified on a real device this pass --
worth a third real-device look once redeployed, specifically to confirm
the centering fix actually resolves what the device screenshot showed
(a stronger candidate explanation than the previous pass's nav-bar
theory, per the reasoning above, but still not proven on real hardware
from this session).

### Landscape layout, fourth pass: simplified back to 2 columns, header tabs revert to their own (thinner) row (2026-09-02, later same day)

Same real-device thread, one more follow-up -- the 3-column composition
from the immediately preceding entry didn't land: "lets try tabs
centered on screen, sub tabs/plan slots below them just like portrait
mode. just shifted up into a thin header row. then lets just keep all
the buttons and cards on the left including recap and points... landscape
mode will just shift the compartments to the right, center tabs, reduce
header height and remove space." Implemented as a deliberate revert-and-
refine rather than layering further changes on top of an already-
churned structure.

**`app/planner/page.tsx` -- back to 2 columns.** `rightStack` removed
entirely; `loadButtonEl`/`loadBlockedMsgEl`/`recapPointsEl()`/`footnoteEl`
all fold back into `mainInfoStack` unconditionally (previously split
between "portrait inline" and "landscape rightStack" branches) --
Equipment, Location, Temp, Load, its blocked-message, recap, points, and
the footnote are ALL one left column again, exactly matching portrait's
own stacking order, just narrower. `naturalRowWidth` back to
`REF_SIDE_W + REF_COMPARTMENTS_W + REF_GAP` (was `REF_SIDE_W*2 +
REF_COMPARTMENTS_W + REF_GAP*2` for the 3-column shape). `presetDialEl`
reverted to its original full-width render site, above the two-column
row, unconditional on orientation -- its third home this session (full-
width -> above the left column only -> inside the right column -> back
to full-width), each one superseding the last rather than compounding.

**`app/planner/CalculatorLayoutClient.tsx` -- inline-tabs-in-icon-row
reverted, `TabBar` gets a `thin` variant instead.** The previous pass's
`inline` prop (tabs sharing the icon row with the hamburger/bell/gear,
no underline) is gone. `TabBar` now takes `thin` -- same full-width row
as portrait (still gets its own row below the icon row, still keeps the
underline, still uses the same 120px tab slots so `centerTab`/`onScroll`
need no changes), just tighter: smaller padding (`"6px 2px"` vs
`"14px 2px"`), smaller font (14/13px vs 16/14px active/inactive), and a
smaller `marginTop` (2px vs 18px) between the icon row and this row.
`Header` passes `thin={isLandscape}` alongside the existing `compact`
outage-banner prop. This is the actual "reduce header height" lever
this pass -- a real, visible reduction, but a tightened STANDALONE row
rather than a structural merge with the icon row, which is what
correctly keeps the tab bar's own centering aligned to the true screen
center (a row sharing space with two unequal icon groups doesn't center
the same way a full-width row does) and satisfies "sub tabs/plan slots
below them just like portrait mode" -- same shape as portrait, just
thinner.

**Live-verified** via the demo login route at 844x390 and 1400x800: left
column (buttons+cards+recap+points, order:1) and right column
(compartments, order:2) both render with zero truncation and zero
horizontal overflow at both widths; bar aspect ratio still exactly
2.103/0.714/2.443 (unchanged from the previous two passes -- the
fixed-width + uniform-scale mechanism and the `left:50%` +
`translateX(-50%)` centering fix both carried over untouched, only the
column composition and dial placement reverted). Preset dial confirmed
full-width above the row, its own centering intact. Header confirmed
visibly shorter than the original two-full-row header while keeping
tabs on their own row with the underline. Portrait re-checked at
375x812, pixel-unaffected (`thin` only applies when `isLandscape`, and
the dial/column code paths for portrait were never touched by any of
today's landscape passes). `tsc --noEmit` and `next build` clean
throughout. Not independently verified on a real device this pass --
this is the fourth landscape iteration in one day driven entirely by
real-device screenshots the user captured and described; each pass
narrowed in on what actually worked in practice rather than what looked
reasonable in the Browser pane alone, so a fifth round of feedback
wouldn't be surprising.

### Landscape layout, fifth pass: independent per-column scroll, closed a real 16px padding gap (2026-09-02, later same day)

User confirmed the 2-column layout from the previous pass "actually
looks good," then asked for two more refinements: "can we just split the
vertical scrolling so each column scrolls independently? the comps
should stay when I scroll down the buttons. also there's a bunch of
empty space above the equipment button. can we shift the whole thing up
to just below the header?"

**The empty-space bug, found by direct measurement, not guessed at**:
`pageStyle`'s landscape override (`{ ...styles.page, paddingLeft: 6,
paddingRight: 6, maxWidth: 1800 }`) only ever overrode two of the four
sides `...styles.page`'s own `padding: 16` spread in first --
`paddingTop`/`paddingBottom` silently stayed at the original 16px this
whole time, on every landscape pass so far. Confirmed live before
touching anything: the preset dial's own content started exactly 16px
below where it should have. Changed to a single `padding: 6` (all four
sides), closing the gap. This is a small, honest fix -- 16px isn't most
of what "a bunch of empty space" described, but it's real and it was
never intentional.

**Independent column scroll**: `app/planner/hooks/useElementWidth.ts`
extended to also report `availableHeight` -- not the measured element's
own `clientHeight` (which would just report however tall its content
naturally is, unbounded and useless for sizing a scroll region), but
`(visualViewport?.height ?? window.innerHeight) - element.getBoundingClientRect().top`,
i.e. "how much of the true viewport is left below wherever this row
actually starts." This sidesteps needing to restructure the whole page
into a height-bounded flex chain just to make one measurement possible
-- the row can keep its natural, content-driven height in the DOM;
`availableHeight` is computed independently via direct measurement,
same reasoning and same redundant re-measurement triggers (ResizeObserver
+ window/visualViewport resize+scroll listeners + settle-timers) already
established for `width` two passes ago.

`app/planner/page.tsx`'s new `columnMaxHeight = (availableRowHeight -
ROW_SAFETY_MARGIN_PX) / rowScale` -- divided by `rowScale`, not the raw
measured value, because each column lives INSIDE the
`transform:scale(rowScale)` block, which doesn't affect flex/scroll
LAYOUT math for its children (only the final visual paint) -- a column's
own `overflowY`/`maxHeight` resolve in the block's own UNSCALED
coordinate space, so the true available height has to be converted into
that space first for the post-scale visual result to actually fit the
real screen. Applied to both columns' own `maxHeight`/`overflowY:"auto"`
(not just the buttons/cards column) for symmetry -- confirmed live that
compartments' own content already fits without needing to engage its
scroll (`scrollHeight === clientHeight`), so in practice only the
buttons/cards column engages, exactly matching "the comps should stay
when I scroll down the buttons."

**A second real bug found live while verifying this, not shipped
blind**: adding a real, visible scrollbar to the buttons column
re-truncated "Card # 4111222233334444 / Exp. 57 days" -- a genuine
regression from the no-truncation floor two passes ago, since a default
scrollbar reserves real layout width from an already-tight fixed-width
column. Fixed by giving both new scroll containers this app's own
existing `"pt-tabscroll"` className (already used everywhere else in
this codebase specifically to hide scrollbars via `scrollbar-width:none`
+ `::-webkit-scrollbar{display:none}`) -- a zero-width hidden scrollbar
can't steal layout space the way a visible one does, and it's visually
consistent with how every other scrollable region in this app already
looks.

**Live-verified** via the demo login route: scrolling the buttons
column's own `scrollTop` to 150 left the compartments column's
`getBoundingClientRect().top` and `scrollTop` completely unchanged --
genuinely independent scroll, not just visually similar. Confirmed at
844x390 that the buttons/cards column has real overflow needing scroll
(`scrollHeight` 480 vs `clientHeight` 277) while compartments exactly
fits (`scrollHeight === clientHeight`, 277). Zero truncated text at
844x390 and 1400x800 after the scrollbar-hiding fix. Portrait re-checked
at 375x812, pixel-unaffected. `tsc --noEmit` and `next build` clean
throughout. Not independently verified on a real device this pass.

### Landscape refinement, round three: safe-area extension, tabs merged back inline, header shortened further (2026-09-02, same day)

Real device screenshot with hand-drawn annotations, one message, three
asks: eliminate the black bars down both screen edges (squiggly lines
pointed straight at real Android soft-nav-bar buttons — recent-apps ⫴,
home ○, back ‹ — visible on the right edge in landscape, confirming the
device's on-screen nav strip was the actual cause); take the rest of the
space out above the Equipment button; move the tab bar back up between
the hamburger and bell/gear to shorten the header further, with the
TerminalOutageBanner still correctly expanding the header downward only
when there's an active outage.

**Black bars — `app/layout.tsx`**: `viewport.viewportFit` added,
`"cover"`. Without this, every `env(safe-area-inset-*)` used anywhere in
this app (Header's own top-inset padding already relied on it) silently
resolves to 0, and — the actual mechanism behind the black bars — the
page's layout viewport stays narrower than the physical screen on a
device with an on-screen edge (here, a landscape phone's soft-nav-bar
strip). Without `"cover"`, the browser doesn't extend the page's own
background into that strip at all; it paints its own default (black)
there instead. `"cover"` extends the layout viewport (and this app's own
backgrounds) all the way to the physical screen edges — the two files
below then add matching `env(safe-area-inset-left/right)` PADDING (not
applied globally, since most routes — the marketing site, `/admin` — have
no reason to care about a landscape phone's nav-bar strip) so actual
CONTENT stays clear of the unsafe zone while the background color
underneath now reaches the true edge.

Two places needed the matching padding, both in
`app/planner/CalculatorLayoutClient.tsx`: **`Header`**'s icon row
(`padding: "0 calc(env(safe-area-inset-right,0px)+16px) 0
calc(env(safe-area-inset-left,0px)+16px)"`, alongside its pre-existing top
inset), and **`ShellChrome`**'s scrollable content wrapper (same pattern,
left/right only — bottom is unrelated to this pass). Neither div's own
background shrinks from this padding — only descendants get pushed in —
so the gradient/dark background now paints the full physical width
regardless of how much of it is a real unsafe strip on a given device,
while buttons/cards/text stay clear of it.

**Honest limitation, flagged rather than silently assumed fixed**: this
session's Browser pane has no real device nav bar to simulate, so
`env(safe-area-inset-*)` evaluates to 0 in every check this pass could
run — there's nothing to visually confirm the black bars are gone from
here. What WAS verified: the CSS resolves without error, the layout
degrades gracefully to the pre-existing (zero-inset) behavior when there
IS no inset, and the mechanism itself (`viewportFit:"cover"` +
compensating padding) is the standard, documented fix for exactly this
class of problem. Needs the user's own real-device confirmation before
considering this closed — same category of gap this project has always
had for anything requiring genuine device hardware (real email delivery,
the manifest orientation change earlier this same day).

**Tabs merged back inline — `TabBar`'s `thin` prop renamed/reworked to
`inline`.** This is the second time this exact idea has been built: an
earlier pass in this same day's work built tabs sharing the icon row,
then a follow-up explicitly reverted that back to a standalone (if
tightened) full-width row, reasoning a full-width row centers correctly
under whichever tab is active where a row split unevenly between the
hamburger and bell/gear groups can't. This follow-up explicitly
re-prioritized header height over that centering trade — "shift the tabs
up in between the nav and bell/sprocket to shorten the header more" — so
it's back, a real reversal made twice in a row now, not an oversight
either time. `inline` mode: 84px tab slots (was 120), `marginTop:0` (it's
a flex child of the icon row now, not a block stacked below it), tighter
gap/padding/font (4px gap, `"4px 2px"` padding, 13px/12px active/inactive
font vs. the full row's 8px/`"14px 2px"`/16px/14px), and the underline row
skipped entirely (`{!inline && (...)}`) — the active tab is still legible
from its own bolder/brighter text alone, and the underline's own height
was exactly the kind of space this mode exists to reclaim. `Header`
renders `{isLandscape && <div style={{flex:1,minWidth:0}}><TabBar inline
/></div>}` between `NavMenu` and the bell/gear group, and
`{!isLandscape && <TabBar compact={!!outageBanner.tickerMessage} />}` as
the old full standalone row, unchanged, for portrait. `centerTab`/
`onScroll`'s own centering logic needed no changes — both already read
real element rects rather than hardcoding a tab width, so they adapt to
either slot size automatically.

**Outage banner still correctly expands/collapses.** `TerminalOutageBanner`
renders in exactly the same spot in the JSX either way — right after the
icon row, before the (now-conditional) full-row `TabBar` — so in landscape
it's the only thing that can add height below the single icon+tabs row:
zero height when there's nothing active (confirmed live — header measured
exactly 48px total end-to-end, icon row + inline tabs, no outage banner
present), and it would expand the header downward exactly as before once
a report exists, same as it always did in portrait. No changes needed to
`TerminalOutageBanner`/`useActiveOutageBanner` themselves for this pass.

**"Space above the buttons"**: covered almost entirely as a side effect of
the header shortening above — removing the tab bar's own row from
landscape's vertical stack (previously always present as its own block
above the page's content, even after the earlier "thin" tightening pass)
is the real space this ask was pointing at. Left two small stale-comment
cleanups in `app/planner/page.tsx` (the `presetDialEl` extraction comment
and the render-site comment both still described an earlier version of
this same day's design — updated to describe the current inline-tabs
shape accurately) but made no further layout changes there; the
`padding:16→6` fix from the immediately preceding pass already handles the
page's own top/side margins.

**Live-verified** via the demo login route at a real Android-landscape
dimension (844×390), after a full dev-server restart (fresh, not
hot-reloaded — this project's own documented HMR-staleness lesson):
header measures exactly 48px tall end-to-end (icon row + inline tabs, no
outage active); the "Planner" tab label's own rect (`y:18-42`) sits in the
identical vertical band as the hamburger (`y:12-48`) and bell/gear
(`y:19-41`/`20.5-39.5`) — genuinely inline, not a second row underneath;
tapping "Insights" from the inline bar navigates to `/planner/terminal`
and renders correctly with "Insights" the highlighted inline tab there
too; the two-column Planner layout (Equipment/Location/Temp/RELOAD left,
compartments right) renders with no horizontal overflow
(`scrollWidth === clientWidth === 844`) and no scaling
(`visualViewport.width === innerWidth === 844`). Portrait re-checked at
375x812 and confirmed byte-for-byte the original stacked look — full
icon row, separate full-width tab row with its underline restored, no
trace of the landscape-only changes. Console clean beyond this project's
own already-documented HMR-websocket noise (dev-server hot-reload IDs
failing to reconnect — not a real regression, confirmed by pattern-
matching for a real error string and finding none). `npx tsc --noEmit`
and `npx next build` both clean throughout every edit.

### Real-device follow-up: confirmed live on production, dial shrunk further (2026-09-02, same day)

User's real device still showed the black bars and "space above buttons"
right after the previous entry shipped. Rather than guess at more layout
changes blind, checked production directly (not just local dev) via the
demo login route against `https://protankr.com/planner` at 844×390:
header measured exactly 48px, tab labels sat in the same vertical band as
the hamburger/bell/gear, and the safe-area `calc()` expressions resolved
cleanly (`16px`/`12px`, i.e. `0 + base` with no real inset available in
this environment) — confirming the previous fix genuinely reached
production and renders correctly there. This pointed at a stale/cached
PWA on the user's own device rather than a code bug, matching the same
failure class already hit once this same day (the orientation-lock fix
needing a full remove-and-reinstall of the home screen icon before
Android would pick it up).

**Asked, not guessed**, since I couldn't resolve the ambiguity from my
own tooling: whether the left-edge bar, the right-edge bar (which visibly
contains the phone's real system nav buttons — recent-apps/home/back, not
something any web page's CSS can paint over without going into full
immersive/fullscreen mode, a much bigger and generally-undesirable
change), or both, was the persisting complaint. Answer: **left edge
only** — confirms the right-side strip was always expected/accepted
system chrome, not a bug to chase.

**Real, concrete follow-up landed the same round**: a fresh real-device
screenshot (after presumably reinstalling, since it showed the header fix
already live — tabs correctly inline, no separate tab row) still showed
a visible gap between the header and the Equipment card. Measured the
exact breakdown live rather than guessing which piece to trim: content-
wrapper-top to Equipment-card-top was ~44.7px, almost entirely the
preset dial (`PresetDial.tsx`)'s own natural size — full portrait-sized
letters (15px active/12px inactive font), gap, and dot — sitting
full-width directly under the header, unconditional on orientation, plus
6px of `marginTop` on the left info-card column.

`PresetDial.tsx` gained an optional `compact` prop (default `false` —
portrait untouched): smaller button padding (`"1px 4px"`, was
`"3px 4px"`), smaller label font (12px/10px active/inactive, was
15px/12px), smaller label-to-dot gap (2px, was 4px), smaller dot (3px,
was 4px). `page.tsx` passes `compact={isLandscape}` into the one
`presetDialEl` render site. Also trimmed the left info-card column's own
`marginTop` from 6 to 2 in landscape (`page.tsx`, `mainInfoStack`) — a
small additional piece of the same measured gap.

**Live-verified**: the same content-wrapper-top-to-Equipment-top gap
dropped from 44.7px to 29.9px (a genuine ~15px reduction, roughly a
third) at 844×390, confirmed via direct measurement before and after,
plus a screenshot showing the dial still legible and the layout not
cramped. Portrait re-checked at 375x812 — dial renders at its original,
unshrunk size, `compact` correctly never true there. `npx tsc --noEmit`
and `npx next build` both clean.

**Still open, flagged rather than silently assumed resolved**: whether
the left-edge black bar is actually gone now. The follow-up screenshot
that prompted this round showed no visible left-edge bar in what was
sent, which is encouraging, but a single cropped screenshot isn't
conclusive proof from this side — needs the user's own direct
confirmation (ideally after the dial-shrink fix ships too) before this is
considered fully closed.

### Real bug found: TabBar's own centerTab() had the exact same latent offsetLeft bug PresetDial already had (2026-09-02, same day)

User reported, after a genuine reinstall, that the black bar was still
there, the space above the buttons was still too much, AND — new this
round — the inline tab bar itself looked visibly shifted left, off
center between the hamburger and bell/gear. The third complaint was the
one that actually cracked this open.

**Confirmed live, not guessed**: measured the real deployed page (both
production and local dev) — `Planner`'s label center sat at x≈318.5
while the true midpoint between the nav button and the bell icon was
x≈406.5, an ~88px leftward error. Read `TabBar`'s `centerTab()` and found
it was still using `el.offsetLeft + el.offsetWidth/2 - container.clientWidth/2`
-- **the exact same bug already found and fixed in `PresetDial.tsx`'s
`centerSlot()`** earlier this session (see the "PresetDial centering bug"
entry, Phase 2 of this landscape work), just never ported over to
`TabBar`'s own copy of the same mechanic. `offsetLeft` resolves against
the nearest *positioned* ancestor (`offsetParent`), which here is
Header's own `position:"relative"` wrapper -- not the scroll container.
In the ORIGINAL portrait-only design this was invisible: the full-width
TabBar's scroll container always sat flush against Header's own left
edge (both reference frames coincided by coincidence). `inline` mode
(this session's own work) nested the scroll container inside the icon
row at a real nonzero offset (52px, after NavMenu) for the first time --
which is what finally exposed a bug that had been sitting there dormant
the whole time.

**Fixed** with the identical `getBoundingClientRect()`-delta approach
already used by `onScroll()` in this same file and by `PresetDial.tsx`'s
own (already-fixed) `centerSlot()` -- viewport-relative, immune to
`offsetParent` climbing, matching all three implementations now. Confirms
this project's own repeated lesson about duplicated logic drifting apart
(`CustomSelect.tsx`/`ServiceTypeManager.tsx`'s own precedent) — this was
the exact same bug fixed once already this session, just not
generalized to its second copy.

**Also went further on "space above the buttons"**, trusting the user's
live device measurement over further guessing at CSS math from this end:
`PresetDial.tsx`'s `compact` styling tightened again -- button padding
`"1px 4px"` → `"0px 4px"`, label/dot gap `2px` → `1px`, dot `3px` → `2px`,
and a new explicit `lineHeight: 1` on the compact label (the default
line-height was adding several px of pure whitespace above/below a
12px glyph that a small font barely needs -- unset/default for portrait,
completely unaffected). `page.tsx`'s `mainInfoStack` `marginTop` in
landscape dropped from `2` to `0`.

**Live-verified**: `Planner` tab's measured center now matches the true
container center almost exactly (406.49 vs 406.5) at 844×390, both
locally and cross-checked against the deployed production meta/CSS
before diagnosing further. The header-to-Equipment-card gap dropped
again, from 29.9px to 21px (down from the original, pre-this-session
44.7px -- more than halved total). Screenshot-confirmed the dial is
still legible, not cramped. Portrait re-checked at 375×812 -- byte-
identical to before, `compact`/`lineHeight` overrides never apply there.
`npx tsc --noEmit` and `npx next build` both clean.

**On the black bar, a different kind of update -- not a further code
guess.** Directly inspected the actual rendered `<meta name="viewport">`
tag on production: `content="width=device-width, initial-scale=1,
viewport-fit=cover"` -- confirms the meta tag itself is textbook-correct,
not a Next.js emission bug. Combined with the earlier confirmation that
the compensating `env(safe-area-inset-*)` padding resolves cleanly, the
web-standard mechanism for this class of problem is provably correctly
built and deployed on this project's end. A black bar surviving a genuine
reinstall, on code that's confirmed correct at every layer this session
can inspect, points somewhere neither `viewport-fit` nor page CSS can
reach: most likely a device/OS-level "fit to screen" or "full screen
apps" setting (several Android OEM skins, Samsung's own Display settings
in particular, letterbox an installed app -- WebAPK included -- to a
fixed aspect ratio by default unless the specific app is toggled to full
screen in system settings, entirely independent of what the app's own
manifest or CSS declares). Flagged to the user as the next thing to check
on-device rather than continuing to iterate blind in code that's already
confirmed correct.

### Preset dial + Save Plan action row rescoped to the right column only (2026-09-02, same day)

User correctly diagnosed the real remaining cause of "space above the
buttons" after all of the previous round's trimming -- not the dial's
own size, but its PLACEMENT: "you have the plan slot row extended all
the way into the left column. it should only stretch across the right
column. the save plan button should be on the right as well. that should
let the buttons shift up in the left column." Both `presetDialEl` and the
"Save plan {letter} / Edit Comp N Product" action row had been rendering
full-width, above the ENTIRE two-column row, ever since the very first
landscape pass this session -- neither one has anything to do with the
left (Equipment/Location/Temp/Load) column at all, so their full-width
placement was what was pushing that column's content down, independent
of how small the dial itself got.

**Fixed by relocating, not further shrinking.** Both were already
extracted as top-level consts (`presetDialEl`; the action row's own
IIFE was newly extracted the same way, `actionRowEl`, so there's one
definition, not two copies of the JSX). Portrait renders them exactly
where they always have -- full-width, above the row, unchanged. Landscape
now renders neither one there at all; both render as the first children
INSIDE the compartments (right) column's own div, before
`<PlannerControls>` -- so they only ever span `REF_COMPARTMENTS_W`, and
the left column (`mainInfoStack`) starts flush at the top of the row,
with nothing above it pushing it down.

**Live-verified**: the left column's own header-to-Equipment-card gap
dropped from 21px to **6px** at 844×390 (down from 44.7px at the start
of today's landscape-refinement work -- an 87% reduction end to end).
Confirmed the dial's active letter now renders well within the right
half of the viewport (x≈556 of 844), not spanning full width. Tapped a
compartment to trigger the "Edit Comp N Product" action-row button and
confirmed it renders correctly right-aligned within the compartments
column, not full-width. Portrait re-checked at 375×812 -- pixel-
identical to before, dial and action row both still render full-width
in their original spot. `npx tsc --noEmit` and `npx next build` both
clean.

### Height-aware scale (true "contain" fit) + dial reverted to full size (2026-09-02, same day)

User confirmed the previous fix worked, then flagged the real remaining
issue with a live screenshot: "bring the plan letter sizes back up and
try to fix the size of the compartments so it fits the screen better. It
looks like we are still stretching things wide and it leaves a space
below the CG slider."

**Root cause, found by measuring, not guessed**: `rowScale` was purely
WIDTH-driven (`availableRowWidth / naturalRowWidth`) -- on a device with
generous width but only middling height, it would scale up to fill the
width regardless of whether that made the block taller than the actual
available height. Separately, the row wrapper's flex `align-items`
defaulted to `stretch`, which forced the compartments column to match
`mainInfoStack`'s own height whenever mainInfoStack was taller (it often
is, and is explicitly ALLOWED to exceed its budget and scroll
internally, per the earlier independent-scroll feature) -- stretching
compartments beyond its own natural content left real, visible dead
space below the CG slider, exactly as reported.

**Two fixes, addressing each half**:
- `app/planner/hooks/useNaturalHeight.ts` (new) -- same measurement-
  robustness pattern as `useElementWidth.ts` (callback ref, ResizeObserver
  + window/visualViewport listeners + a settle-timer burst), but reports
  an element's own natural `getBoundingClientRect().height` instead of
  width. `page.tsx` refs it on a NEW inner wrapper inside the
  compartments column (`compartmentsContentRef`, wrapping
  presetDialEl+actionRowEl+PlannerControls+CompartmentModal+CG-slider) --
  deliberately not the outer column div, which carries `maxHeight`+
  `overflowY:auto` and would report a CLAMPED height back into the very
  calculation that clamp is derived from (the circularity this hook
  exists to avoid). `rowScale` is now `min(widthScale, heightScale)`,
  clamped to the same `[0.5, 1.6]` range as before -- a genuine "contain"
  fit (like `object-fit:contain`), not width-only: whichever dimension is
  the binding constraint wins, and the block never grows past what BOTH
  the available width and the available height allow.
- The row wrapper's `alignItems` changed from the flex default (`stretch`)
  to `"flex-start"` in landscape -- each column now takes only the height
  its own content needs, up to its own `maxHeight` ceiling (still the
  independent-scroll safety net for whichever column genuinely needs it,
  unaffected by this change) -- instead of being forced to match
  whichever sibling is taller.
- `PresetDial.tsx`'s `compact` prop is no longer passed from `page.tsx`
  at all -- per explicit direction ("bring the plan letter sizes back
  up"). The shrink existed only to save vertical space when the dial
  rendered full-width above BOTH columns; now that it's scoped to just
  the compartments column, there's no more space pressure motivating it.
  `compact` itself stays in `PresetDial.tsx` (unused for now, not
  deleted) in case a future narrower-device case wants it again.

**Live-verified** at two widths, both showing the fit genuinely binding
on whichever dimension is tighter (not guessed, read directly off the
scaled block's own `transform`/rect): 844×390 -> `scale(0.9535)`, block
bottom at 382px of a 390px-tall viewport (height was the binding
constraint here); 1000×420 -> `scale(1.1395)`, block bottom at 412px of
420px (again height-bound, tight to the same 8px safety margin on both
tests). Confirmed compartments and mainInfoStack now render at
genuinely DIFFERENT heights (345.8px vs 358.0px at 1000×420) -- direct
proof `align-items:flex-start` is working, not just theorized. Dial
letters confirmed back to full/portrait size in both landscape tests.
Portrait re-checked at 375×812, pixel-identical to before -- none of
this pass's changes are reachable outside `isLandscape`. `npx tsc
--noEmit` and `npx next build` both clean.

### On "why don't we go truly full screen like other apps" (2026-09-02, same day)

User asked directly, alongside a real screenshot of a native phone-call
app rendering genuinely edge-to-edge on the same device: "is it because
its a pwa?" Answered directly rather than hedged further, since this
project has now exhausted what it can verify from its own side (the
`<meta name="viewport">` tag is confirmed correct, the safe-area CSS is
confirmed correct, a genuine reinstall didn't change anything) -- the
most likely explanation is a device/OS-level setting that treats an
installed PWA (a Chrome-generated WebAPK) differently from a
pre-authorized native/system app by default. Samsung devices in
particular (the call-app screenshot's UI strongly suggests Samsung One
UI) have exactly this under **Settings -> Display -> Full screen apps**
-- newly installed apps, including WebAPKs, commonly default to a boxed/
letterboxed aspect ratio there until manually toggled to full screen,
entirely independent of what the app's own manifest or CSS declares.
Given to the user as the concrete next thing to check on-device, not a
further code change -- nothing left to iterate on this project's own
side without more device-specific information.

## Nav restructure: tabs into the hamburger menu, role-based Planner routing, Terminal/Insights removed (2026-09-03)

Planned via Plan Mode (approved plan preserved at `wild-discovering-plum.md`),
across a multi-message design conversation about the landscape icon-rail
mockup for lead/driver's Planner -- this pass shipped the parts that were
concrete and settled, deliberately **not** the icon-rail visual redesign
itself (still being mocked up further, a separate future pass). Three real
decisions:

1. **The visible tab bar is gone entirely.** Every destination it held
   (Dispatch/Insights/Planner/Cards/Vault) now lives in `NavMenu`'s own
   dropdown instead -- "do away with the tabs and put the pages in the nav
   hamburger with reports etc."
2. **Admin and dispatch's "Planner" is now the existing Dispatch page**
   (`app/planner/dispatch/page.tsx`) outright, not a shared page with
   role-conditional tabs -- "let's use the current dispatch page as the
   planner for admin and dispatchers." They no longer reach the
   driver-style `/planner` page at all. This directly reverses a
   2026-08-04 decision ("the only role that should default to the
   dispatch tab on open is the dispatch role... admin roles just get a
   backstrip button") -- that reasoning is superseded now that admin's
   Planner genuinely IS the Dispatch page, not a shared page admin and
   driver/lead both used to land on.
3. **Super admins get both** `/planner` and `/planner/dispatch` reachable,
   never auto-redirected either way -- matches this project's standing
   "one account can verify every role's view without reassigning roles"
   precedent. **Cards** narrowed to driver/lead (+ super admin, for the
   same QA-precedent reason) -- admin/dispatch's own Dispatch page already
   shows a selected driver's Terminal Cards/Badges/Credentials inline, so
   a separate Cards destination for them was redundant. **Vault** stays
   universal, unchanged.

Separately, and combined into the same pass since both were part of the
same design conversation: the Terminal/Insights page (`/planner/terminal`
-- rack picker, product-status list, STUD, Edit Terminal, plus the
Volume/Trends/Recovery sub-tabs from the 2026-08-31 pivot) is **deleted
outright**, confirmed explicitly with the user that Volume's real, shipped
chart goes too, nothing on that page survives. STUD and Edit Terminal
relocate into `MyTerminalsModal.tsx`'s existing (previously read-only)
expanded terminal-card view, alongside a new rack quick-pick dropdown --
"check/update a terminal's rack status" is now something done from the
Location modal already used to pick a terminal, not a separate tab.

**New shared util, `lib/ui/driver/navDestinations.ts`** -- both the
landing-redirect effect and `NavMenu` were about to independently
re-implement "who can reach what," a duplication class this project has
hit and fixed before (`CustomSelect.tsx`/`ServiceTypeManager.tsx`'s own
precedent, and this very session's TabBar/PresetDial centering-bug lesson
-- the same fix existed in one place and simply wasn't ported to its
second copy). `canReachDestination(dest, role, isSuperAdmin)` and
`defaultLandingPath(role, isSuperAdmin)` are the one place these rules
live now.

**Terminal/Insights removal, file-by-file**: `RackProductStatusModal.tsx`
and `EditTerminalModal.tsx` moved to `app/planner/modals/` (their only
call site, confirmed via repo-wide grep before touching anything, was the
now-deleted `terminal/page.tsx`). Their shared types moved to
`app/planner/modals/rackProductTypes.ts` -- deliberately not
`modals/types.ts`, which would collide/confuse with the unrelated
`app/planner/types.ts` one level up -- dropping the already-dead
`RackLane`/`RackArm` types along the way (grep-confirmed no importer since
the 2026-08-31 Lane Map removal). `labels.ts` deleted outright (same
grep-confirmed dead status). `VolumeChart.tsx` and `page.tsx` deleted with
no relocation. The now-empty `app/planner/terminal/` directory removed.

**`MyTerminalsModal.tsx`** gained two new props (`authUserId`, `myRole`,
threaded from `ShellChrome`'s existing mount, mirroring how
`EquipmentModal` already receives `myRole={shell.role}` there) and new
local state scoped to whichever card is expanded: fetches
`terminal_racks` (same `select("*").eq("terminal_id",...).order("rack_name")`
shape already used twice elsewhere in this codebase) when a card expands,
then `rack_product_status` for whichever rack is picked. Deliberately
**local state, not wired into `shell.chooseTerminal`/`rackPickerOpen`/
`RackSelectSheet`** -- checking a terminal's rack status must never change
the driver's actively-selected planning terminal/rack as a side effect
(the terminal being expanded may not even be the one currently selected
for loading at all). The rack dropdown uses `CustomSelect`, not a native
`<select>`, matching this app's own established fix for native selects
ignoring dark theme. The "Edit card details from the Cards tab." footer
is now conditional on `myRole === "driver" || "lead"` (or unresolved) --
false for admin/dispatch, since Cards is no longer reachable for them at
all after this same pass.

**A genuine race condition, found while verifying the plan's own claims
before writing code, not left hypothetical**: `shell.role` and
`shell.isSuperAdmin` resolve via two fully independent effects in
`CalculatorShellContext.tsx` (confirmed by reading both directly) with no
ordering guarantee -- a real super admin whose own company role happens
to be `admin` could get redirected to `/planner/dispatch` before their
super-admin flag resolves `true`. Fixed with a new `isSuperAdminResolved`
field (flips `true` once the `is_super_admin` RPC settles, regardless of
result), gating the landing-redirect effect in `page.tsx` and the new
route gates on `app/planner/dispatch/page.tsx` (blocks driver/lead --
this page had **no access gate at all before this pass**, confirmed via
grep; a driver/lead hitting the URL directly wasn't blocked, only kept
off it by the now-removed tab bar not showing the tab) and the new
`app/planner/cards/layout.tsx` (one shared gate for all three Cards
routes -- `page.tsx`/`badges/page.tsx`/`credentials/page.tsx` all shared
the identical `isDispatchContext` pattern before this, so one layout-level
gate replaces what would otherwise have been the same redirect effect
tripled across three files). Blocked visits redirect to whichever
destination is actually valid for that role (driver/lead off Dispatch ->
`/planner`; admin/dispatch off Cards -> `/planner/dispatch`), not a
generic fallback that might not be reachable either.

**Deliberately left alone**: Cards' now-dead `isDispatchContext` branch
(all three routes) -- inert once admin/dispatch can't reach Cards at all,
but removing it touches meaningfully more render logic per file than the
rest of this pass; flagged as a clean, optional follow-up, not bundled in.
"⟵ Back to Planner" in `NavMenu` is unchanged -- still the only way back
into the Planner section from `/admin`/`/superadmin`/`/learn`, even though
it now overlaps with the new Planner link while already inside that
section (harmless, same destination either way).

**Live-verified** via the demo login route (`/api/demo/start?persona=alpha`,
role: admin) after a full dev-server restart and a fresh `next build`:
bare `/planner` correctly redirected to `/planner/dispatch`; the hamburger
menu showed exactly Vault/Reports/Company Admin/Learn/Sign Out (no
Planner/Dispatch/Cards links -- Dispatch is current, Planner unreachable,
Cards unreachable), confirming `canReachDestination` gates correctly;
navigating directly to `/planner/cards` by URL correctly redirected to
`/planner/dispatch`, confirming the new Cards gate actually blocks direct
URL access, not just hides the nav entry. Reached `MyTerminalsModal`'s
expanded card via the bell icon's Expirations modal (admin/dispatch have
no other path to it now that Planner's own "Select Terminal" card is
unreachable) and confirmed the full relocated flow end-to-end against
real data: rack dropdown populated ("Main Rack"), STUD opened
`RackProductStatusModal` prefilled with a real product's live API/temp
reading (Regular Unleaded E10 87, 60.4 API / 87°F), Edit Terminal opened
correctly scoped to the right terminal ("Racks at **Chevron**") showing
its real Access Renewal Period (90 days) and rack list. No writes were
made (both modals closed without saving, to avoid touching real demo
data unnecessarily) -- the read-path/wiring is what this check confirmed.
Console clean beyond one stray 401 traceable to this session's own
diagnostic `fetch()` call against the Supabase REST API directly (not
app code).

**Real, honest limitation, not glossed over**: this demo company's only
two members (Seth Perry, Test Testerson) both resolved to admin/dispatch
roles when impersonated via "Use app as {driver}" -- confirmed live by
impersonating each in turn and observing `/planner` still redirect to
`/planner/dispatch` both times, rather than assumed. This means the
**driver/lead side of this pass was never empirically exercised**: the
new Dispatch-page gate blocking driver/lead, Cards actually working for
a driver/lead, and the landing redirect correctly doing *nothing* for
that role are all architecturally verified against the actual gate code
(same `canReachDestination`/`defaultLandingPath` calls checked live for
admin), not independently confirmed live. Worth a real check with a
genuine driver or lead account before considering this fully closed.

`npx tsc --noEmit` and `npx next build` clean after every area of the
plan, not just once at the end.

### Follow-up same day: the rack product list itself never made the move (2026-09-03)

User caught a real gap right after the pass above shipped: "It looks like
we lost the visual product status in the transfer over to the my
terminals modal." Correct -- the relocation moved the STUD/Edit-Terminal
ACTIONS but never the read-only product LIST they act on (dot color,
button code, name, `is_out` strikethrough+dim, API/temp with "API —"/
"—°F" placeholders) -- `expandedRackProducts`/`productsById` were already
being fetched (the STUD modal needs them), just never rendered anywhere
themselves.

Fixed by porting the deleted Status tab's own rendering verbatim (pulled
from git history at the pre-deletion commit, not rewritten from memory) into
`MyTerminalsModal.tsx`'s expanded card, between the rack picker dropdown and
the STUD/Edit Terminal button row -- same order the original page used
(picker -> list -> actions). No new data fetching needed, since the
underlying state already existed for the STUD modal's own use.

**Live-verified** via the same demo login route + bell-icon path used to
verify the original relocation: expanded Chevron's card, confirmed the full
real product list renders correctly under "Main Rack" -- 87 Regular
Unleaded (API 60.4 / 87°F), D2 ULSD Diesel #2 (API 36.5 / 84.9°F), and four
more products including two genuinely showing the "API —"/"—°F" placeholder
state, each with the correct product-color dot. Console clean beyond the
same stale 401 already documented in the entry above (this session's own
diagnostic fetch, not app code). `npx tsc --noEmit` and `npx next build`
both clean.

## Icon-rail Planner redesign for driver/lead roles (2026-09-03)

Per an extended earlier design conversation (mockup + 8 rounds of resolved
feedback, referenced but not detailed further here) and the literal kickoff
message this pass ("let's design the icons and set up the planner page for
drivers and leads"): the driver/lead Planner's three stacked Equipment/
Location/Temperature cards (name, sub-label, chevron each) are replaced
with a compact 4-icon row -- plan-letter, Equipment (truck), Location
(pin), Temperature (thermometer) -- reclaiming real vertical room for
compartments, the actual point of the redesign. Two smaller pieces shipped
alongside: a passive location text line above compartments, and a small
safety-confirmation header in the Loading Modal (equipment + terminal,
previously shown nowhere in that flow at all). Planned via Plan Mode
(approved plan preserved at `wild-discovering-plum.md`).

**Explicit scope decision, made rather than guessed at**: the original
mockup also described the whole icon strip (including the shared header's
hamburger/bell/gear) eventually becoming a left-edge rail in landscape or a
bottom bar in portrait -- but the user's own words called that "expect to
move that around until we get it right," i.e. genuinely unresolved. This
pass ships the new icons with real interactions in the same general column
position the old cards occupied (still a real, meaningful improvement --
one compact row instead of three stacked cards) -- not the more speculative
rail/bottom-bar restructure, which stays a distinct Phase 2 once these
icons are visible for real. `Header` (hamburger/bell/gear, shared across
every route) is completely untouched.

**Dark-mode-only, done first as an isolated change**: `app/planner/hooks/useTheme.ts`
-- `darkMode` is now a plain constant `true`, not state; the two client-only
effects that used to resolve a stored `darkMode` value and `setDarkMode`
itself are gone. `accentColor`'s own real per-user persisted state
(localStorage, `DEVICE_KEY` + per-user key) is completely unaffected -- only
the light/dark toggle goes. `app/planner/modals/SettingsModal.tsx`'s
Appearance section lost its "Dark Mode" row entirely (and the now-fully-
unused `ToggleSwitch` component, confirmed via grep to have no other
callers); the Accent Color row's own sub-text was reworded since it used
to reference "Dark Mode's fill."

**Custom preset names**: `user_plan_slots.payload` is a flexible `jsonb`
column with no `name` column (confirmed directly against the migration) --
a name is new metadata *inside* that existing payload, the same way
`cgSlider` already lives there, not a schema change.
`app/planner/types.ts`'s `PlanSnapshot` gained an optional `name?: string`.
`usePlanSlots.ts`: `buildSnapshot` takes an optional `name?`; `saveToSlot`
now peeks the slot's existing name first and threads it through, so a
routine save/edit never silently clears a name a driver already set; new
`renameSlot(slot, name)` deliberately does NOT call `buildSnapshot` --  it
only merges `name` into the slot's *existing* stored snapshot, so renaming
can never overwrite plan content with whatever happens to be live on screen
at that moment.

**New `app/planner/components/PresetQuickPick.tsx`** replaces the
swipeable A-E `PresetDial` (deleted outright,
`app/planner/sections/PresetDial.tsx`, confirmed via grep no real
references remained) as the plan-letter icon's tap target -- "the current
plan icon can just be a quick pick window," a plain list of all 5 slots
instead of a horizontal scroll-and-tap strip, since the new compact row
isn't fighting for space the dial's old full-width position was. Same
tap-to-load / tap-empty-to-save semantics the dial always had, plus a new
per-row rename affordance (pencil icon, only shown once a slot has real
content -- nothing to attach a name to otherwise) with inline-text-field
editing (Enter/Escape/blur-to-commit). Long-press on a filled row
(600ms, via `onPointerDown`/`onPointerUp`/`onPointerLeave`) still opens the
existing `PresetActionSheet.tsx` (Edit/Clear) rather than duplicating that
logic -- same reuse the dial itself already established.

**New `app/planner/components/PlannerIcons.tsx`** -- `TruckIcon`/
`PinIcon`/`ThermometerIcon`, matching `CalculatorLayoutClient.tsx`'s
`BellIcon`/`GearIcon` house style exactly (plain Feather/Lucide-shape
stroke SVGs, `viewBox="0 0 24 24"`, `fill="none"`, `strokeWidth="2"`, round
caps/joins, a `stroke` prop for theming) -- hand-copied standard Feather
paths, not a new icon-library dependency (this project has never taken
one).

**The icon row itself** (`app/planner/page.tsx`) -- the old
Equipment/Location/Temperature cards' JSX block (~120 lines) replaced with
one `<div style={{display:"flex",gap:8}}>` of 4 square buttons
(`iconRowBtnStyle`, new shared const, replacing the now-dead `infoCard`/
`chevron` styles): plan-letter (shows `activeSlotLetter`, opens
`PresetQuickPick`), Equipment (`TruckIcon`, same `setEquipOpen(true)` the
old card called, framer-motion `layoutId="setup-equipment-btn"` preserved
so SetupGate's shared-element transition still animates into it), Location
(`PinIcon`, same location-vs-terminal step logic the old card used,
`layoutId="setup-location-btn"`/`"setup-terminal-btn"` preserved),
Temperature (`ThermometerIcon`, same `setTempDialOpen(true)`, stroke
colored via the existing `tempSubColor` confidence value -- no more
"High/Medium/Low confidence" text label, color alone carries that meaning
now). Each button's stroke is white when selected/available, dim
(`rgba(255,255,255,0.35)`) otherwise. A large batch of now-dead local
variables that only fed the old cards' text sub-labels (`tid`, `cardNum`,
`expiryDays`, `expirationSub`, a local `locationLabel` const,
`isHighConfidence`, `tempPrimaryColor`, `tempSubLabel`, `tempBgAlpha`) were
removed in the same pass. `presetDialSyncTo`/`setPresetDialSyncTo` (the
dial's old external "please recenter" signal) were removed entirely -- a
plain icon reactively showing `activeSlotLetter` needs no such mechanism;
`presetDialSyncedRef`'s one-time-fire mount guard was kept, since that
purpose (don't re-apply the passive restore sync more than once) is
unrelated to the dial's own visual centering.

New `locationLineEl` -- a tappable text line directly above the
compartments (terminal name in bold white + "City, State" in gray, or a
"Select location"/"Select terminal" placeholder), same step-based open
logic as the old Location card's tap target. Rendered in the one shared
block already common to both portrait and landscape (confirmed via reading
the surrounding code that this block is reached via the same `isLandscape`
ternaries as everything else there), so it correctly appears "above
compartments" in both orientations without duplicating the JSX.

**Loading Modal safety block** (`app/planner/modals/LoadingModal.tsx`) --
confirmed via direct read that this modal showed zero equipment/location
identification before this pass, a real, previously-unflagged gap for a
driver committing to a load. New optional `equipmentLabel`/`terminalLabel`
props, rendered as a small read-only header (equipment left, terminal
right, both truncating via `text-overflow:ellipsis` rather than wrapping)
above "Planned compartments" -- only rendered when at least one is
truthy. `page.tsx` already held both values for its own former cards;
passed straight through (`equipment.equipmentLabel`, `terminalLabel`), no
new fetch.

**A real bug found and fixed during this pass, unrelated to the redesign
itself**: the Edit tool repeatedly failed exact-string-match replacement on
the old card block despite the `old_string` being copied directly from a
fresh read of the same lines -- investigated via hex dump
(`xxd`/`od -c`), found no hidden characters or CRLF endings, root cause
never conclusively determined. Worked around with a direct Bash splice
(`head`/`tail`/`cat` into a temp file, verified boundaries via `sed -n`,
then `cp` over the real file) rather than fighting the tool further.

**Live-verified** via the demo login route (both available personas
resolve to admin/dispatch roles, which the earlier nav/role-restructure
pass's own `defaultLandingPath` redirect sends straight to
`/planner/dispatch` -- reaching this driver-style Planner page at all
needed a temporary, explicitly-commented bypass of that redirect for the
duration of this pass's testing, reverted immediately afterward, confirmed
via `git status`/`grep` that no trace of it remains): a genuine
`ReferenceError: darkMode is not defined` hit once while testing (opening
the Compartment product picker) was investigated and confirmed to be this
project's own well-documented "Dev-server stale-content trap," not a real
bug -- a full server stop + `.next` cache clear + restart, followed by a
**genuinely fresh browser tab** (not just a reload, since this project's
own memory already documents the console buffer never resetting for a
tab's lifetime), reproduced the exact same action (tap compartment -> Edit
Comp N Product) with zero console errors. With that confirmed: TruckIcon
opens the real Equipment modal (real truck/trailer data); PinIcon opens
the real terminal picker (correctly went straight to the terminal step
since a location was already set); ThermometerIcon opens the real temp
dial (green "HIGH CONFIDENCE," matching the icon's own green stroke);
plan-letter opens `PresetQuickPick` showing all 5 slots, tap-to-save on an
empty slot correctly updated the icon's letter and closed the sheet,
reopening showed the newly-filled slot's real summary text and a rename
pencil; typed and committed a rename ("Tampa Run"), confirmed it persisted
across reopening the sheet; long-press (via a scripted `PointerEvent`
down/wait-700ms/up sequence, since this Browser pane has no native
long-press primitive) correctly opened `PresetActionSheet` with Load/Edit/
Clear, and Clear correctly reverted the slot back to empty with its name
gone. Portrait mode (375x812) re-checked and confirmed rendering
correctly and unchanged in structure from before this pass -- same order
(compartments, CG slider, icon row, RELOAD, RECAP), just the icon row
itself far more compact than the three old cards, exactly the point of
this redesign. The Loading Modal's own safety block was not reached live
this pass -- the only demo terminal available (Buckey North) has no real
product catalog configured (its compartment product picker offers only
"MT (Empty)"), so the pre-existing, unrelated "products not available at
this terminal" LOAD gate blocked reaching that modal; the prop wiring
itself was verified by direct code read rather than a live screenshot, and
is low-risk (two conditionally-rendered label spans, no new state or
logic). `npx tsc --noEmit` and `npx next build` both clean.

**Not done this pass, deliberately deferred (Phase 2 per the plan's own
Context section)**: the left-rail-in-landscape / bottom-bar-in-portrait
repositioning of this new icon strip, and folding it together with the
shared header's hamburger/bell/gear -- both explicitly unresolved per the
user's own "expect to move that around" framing, not safe to guess at
without a real rendered look first (consistent with how many rounds this
same session's earlier landscape-layout work needed to land).

### Icon-rail follow-up: merged into the shared header, matched to a real mockup (2026-09-03, same day)

User's next round of feedback against the icon-rail work above, with a
real mockup screenshot this time (the earlier icon-rail pass had been
built from a design conversation this session's own context-compaction
lost the reference image for): "these icons look nothing like what I
mocked up... go ahead and merge with the nav/bell/gear row. I think I'll
like it best at the top but want to play with it for a few days. the
temp icon should actually display the temp and the color is confidence
level."

**Merged into the header, via a portal, not a state migration.**
`CalculatorLayoutClient.tsx`'s `Header` (shared across every `/planner/*`
route) gained a new empty `<div id="planner-header-icons-slot">` between
`BellIcon` and `GearIcon`. `page.tsx` grabs that element once on mount
(`headerIconsSlot` state) and renders its plan-letter/Equipment/Location/
Temperature cluster into it via `createPortal` -- deliberately NOT
lifting `activeSlotLetter`/`tempF`/`presetQuickPickOpen`/etc. into
`CalculatorShellContext`, since that state is genuinely Planner-page-
local and a portal makes the whole experiment trivial to reverse (delete
the portal call, nothing to unwind) if the header placement doesn't
stick after the explicit "play with it for a few days" trial period.
Every other route (Dispatch, Cards, Vault) renders nothing into the slot
at all -- confirmed live, header shows just hamburger/bell/gear there,
zero footprint when Planner isn't mounted.

**Matched to the mockup, not the previous pass's icon-rail guesses**:
- Plan-letter: bold white text + a small white dot underneath (not a
  boxed button) -- same `PresetQuickPick` tap target as before, just
  restyled.
- Equipment: a plain "EQ" text label, muted gray -- replaces the
  `TruckIcon` glyph entirely. Deliberately a flat, non-reactive tone
  (the mockup shows this same gray even with real equipment already
  selected) -- Location/Temperature are the two that still carry live
  state through color, this one doesn't.
- Location: a new `SolidPinIcon` (`PlannerIcons.tsx`) -- a real filled
  map-pin glyph (the standard Material "place" icon path, whose inner
  circle is a genuine hole via opposite path winding under the default
  nonzero fill rule), colored a fixed brand red, replacing the old
  stroke-outline `PinIcon`.
- Temperature: now shows the real value (`{Math.round(tempF)}°F`), not a
  bare icon -- color still carries confidence via the existing
  `tempSubColor` (green/yellow/red/orange), per explicit direction ("the
  color is confidence level").
- `PlannerIcons.tsx` collapsed down to just `SolidPinIcon` --
  `TruckIcon`/`PinIcon`/`ThermometerIcon` (all built in the immediately
  preceding pass) are now fully unused, since plan-letter/Equipment/
  Temperature all became text and only Location kept a real glyph;
  removed rather than left as dead exports.

**Body reorder, matching the mockup's own order**: with the icon row
gone from the page body, `mainInfoStack` (the left-hand card stack)
reordered from `[loadButtonEl, loadBlockedMsgEl, recapPointsEl(),
footnoteEl]` to `[recapPointsEl(), locationLineEl, loadButtonEl,
loadBlockedMsgEl, footnoteEl]` -- recap/points now come first, then the
location line, then the Load button last. `locationLineEl` itself moved
down from its old position directly above the compartments (where it
had rendered since the "it would be nice to at least display the
location" pass) into this new spot, and was restyled from a single
baseline-aligned line into the mockup's 2-line block: city/state on its
own line, then terminal name + rack name (right-aligned, gray) on the
line below -- reusing the already-fetched `selectedRackName` state
(previously only used by `PlannerControls`), not a new query. The old
above-compartments render site was removed outright, not left as a
duplicate.

**Real bug found and fixed during this pass, not shipped blind**: the
Equipment and Location buttons both reuse `SetupGate`'s own
`layoutId="setup-equipment-btn"`/`"setup-location-btn"`/
`"setup-terminal-btn"` for their shared-element transition (unchanged
from the previous icon-rail pass) -- but `SetupGate.tsx`'s own version
of this shared card has a real `boxShadow`/`borderRadius` (its "Select
Equipment" card look), and framer-motion's layoutId crossfade carries
that value into whichever element the id lands on next unless the
destination gives it something explicit to animate all the way to.
Confirmed live via `getComputedStyle`: the header's "EQ" button showed a
permanent (not transient -- re-checked after a 2s wait, unchanged) faint
`box-shadow`/fractional `border-radius`, visible as a small boxed
outline around "EQ" that had no business being there per the mockup's
plain flat text. Fixed by explicitly setting `borderRadius: 0,
boxShadow: "none"` on both buttons' own style objects -- gives
framer-motion's animation an explicit target to settle at instead of
holding a leftover value with nothing to override it.

**Live-verified** via the demo login route (temporarily bypassing the
landing redirect for the duration of testing only, exactly as the
immediately preceding icon-rail pass did, reverted afterward, confirmed
via `grep` no trace remains): after the boxShadow fix, `getComputedStyle`
on the "EQ" button read `boxShadow: "none"`, `borderRadius: "0px"` --
plain flat text, matching the mockup. All four header icons confirmed
functional against real data (some via direct DOM `.click()`/prop
invocation rather than the Browser pane's coordinate-based click, which
was intermittently timing out on wait-for-idle this session for reasons
unrelated to the app itself -- confirmed by invoking the exact same
`onClick` handler extracted from React's fiber props and observing the
real result each time): Equipment opens the real Equipment modal
(25184-A/3151-A); Location opens My Terminals showing real Fort
Lauderdale terminals with real expiry dates/colors; Temperature opens
the real Product Temp dial; plan-letter opens `PresetQuickPick` showing
real preset summaries ("unavailable product" on A/B, "Tap to save
current plan" on C-E). Body reorder confirmed in both portrait
(375x812) and the pane's own landscape-ish default width: RECAP card,
THIS LOAD/BIWEEKLY AVG points card, "Fort Lauderdale, FL" / "Chevron"
location line, RELOAD button, footnote -- in that order, matching the
mockup. Confirmed the header slot is empty (no leftover cluster) on
`/planner/dispatch`, a non-Planner route sharing the same `Header`.
`npx tsc --noEmit` and `npx next build` both clean.

### Header follow-up: location reverted above compartments, all 7 icons evenly spaced, flat black header, more page spacing (2026-09-03, same day)

Fast follow to the header-merge pass above: "put the location back above
the compartments where you had it, your way looks better. then, evenly
space, all seven icons in the header and turn the background black. So
it looks like there's no header. then, add a little more vertical space
between everything on the page."

**Location line reverted.** `locationLineEl`'s render site moved back to
directly above `<PlannerControls>` (its original spot, common to both
orientations) and its own 2-line city/state + terminal/rack restyling
from the header-merge pass is otherwise untouched -- only the render
POSITION reverted, not the styling. Removed from `mainInfoStack` (it had
briefly sat there, after recap/points, per the earlier mockup's own
order).

**All seven icons evenly spaced.** The header's icon row was previously
two groups -- `NavMenu` alone on the left against a `justify-content:
space-between`, with Bell/portal-slot/Gear clustered together on the
right at their own fixed `gap: 16`. That only evenly spaced *within* the
right cluster, not across the whole row. Restructured
(`CalculatorLayoutClient.tsx`) so `NavMenu`, `BellIcon`, the portal slot,
and `GearIcon` are all direct children of ONE flex row with
`justify-content: space-between` -- the portal slot div itself switched
from `display: "flex"` to `display: "contents"`, which makes it
invisible to layout so `page.tsx`'s four portaled buttons (plan-letter/
EQ/pin/temp) become direct flex items of that same row instead of a
nested sub-group. Live-verified via direct `getBoundingClientRect()`
measurement: all six real inter-icon gaps read 29-30px, consistently
even. On a non-Planner route (nothing portaled into the slot), the same
row correctly falls back to 3 evenly-spaced items (hamburger/bell/gear)
with zero leftover footprint from the empty slot.

**Flat black header.** `themeHeaderGradient()` (the two-tone graphite/
accent gradient the header band used) is removed from `theme.ts`
entirely, along with the `darken()` helper only it called -- confirmed
via grep neither had any other caller. `Header`'s own background is now
a flat `#0b0b0b`, exactly matching `ShellChrome`'s content-area
background, so the header reads as a continuation of the page rather
than a visibly separate band ("so it looks like there's no header") --
confirmed live via `getComputedStyle` (`rgb(11, 11, 11)`, no
`backgroundImage`). The `<meta name="theme-color">` sync effect
(keeps the OS status bar in sync) was simplified the same way -- flat
`"#0b0b0b"` unconditionally instead of `themeFill(darkMode, accentColor,
...)`, confirmed live via the actual meta tag's `content` attribute.
`accentColor` is now unused in this component (only `darkMode` still
feeds `themeIconStroke`/`NavMenu`) and was dropped from the destructure;
`themeFill`'s import here went with it since nothing else in this file
called it.

**More vertical spacing**, per "a little more... between everything on
the page" -- a general breathing-room pass across the Planner's main
section boundaries in `page.tsx`, all modest bumps, not a redesign:
compartments-to-CG-slider gap 8px→18px; `locationLineEl`'s own
`marginBottom` 4px→12px (space before compartments start);
`mainInfoStack`'s portrait `marginTop` 6px→18px and its internal `gap`
10px→16px (space between the recap card, points card, and Load button);
`recapPointsEl`'s own internal gap (between the RECAP card and the
points card) 10px→14px. Landscape's `mainInfoStack` `marginTop` stays 0
-- that column sits side-by-side with compartments, not stacked below
them, so it wasn't part of this ask.

**Live-verified** via the demo login route (same temporary redirect
bypass as the immediately preceding pass, reverted after, confirmed via
grep): screenshot-confirmed the reordered/respaced portrait layout
(location line above compartments, visibly more room between each
section down to RELOAD/footnote), the header's flat black band blending
into the page with no visible seam, and all seven icons evenly spaced in
both a landscape-ish width and portrait. Equipment icon re-confirmed
still opens the real Equipment modal after the restructure. Dispatch (a
non-Planner route) re-checked and still renders its 3-icon header
correctly, evenly spaced, flat black, nothing leftover from the empty
portal slot. `npx tsc --noEmit` and `npx next build` both clean.

### Location line: terminal first, "· City, State" same line, rack underneath (2026-09-03, same day)

Third fast follow-up against `locationLineEl`: "put the terminal first
and the city state separated by a dot... the rack underneath the
terminal." Reworked from the header-merge pass's 2-line block (city/
state on its own line, then terminal + right-aligned rack on the line
below) into: terminal name leads, followed by "· City, State" on the
SAME line (the "·" matches this app's own established separator
convention -- e.g. the RECAP label's own "· {date}"), then the rack name
on its own line underneath, left-aligned under the terminal rather than
right-aligned. `selectedRackName` (already fetched for `PlannerControls`'
own use) is unchanged -- only the layout around it moved.

Live-verified via the demo login route (temporary redirect bypass,
reverted after, confirmed via grep): "Chevron · Fort Lauderdale, FL"
renders correctly in both portrait and landscape-ish widths -- this
particular demo terminal has no rack selected, so the rack line
correctly doesn't render at all (same conditional as before, unchanged
logic, just repositioned). `npx tsc --noEmit` and `npx next build` both
clean.

### Fourth Planner follow-up: top-cluster reorder, white handles, transparent cards, PresetQuickPick redesign (2026-09-03, same day)

Fourth fast follow-up in the same day's thread, a dense multi-part
message covering five separate changes:

**Location line: city/state now white/bold, matching the terminal.** The
"· City, State" span's color/weight changed from `rgba(255,255,255,0.45)`/
500 to `#fff`/700 -- same treatment as the terminal name it follows, per
explicit direction ("make the city state and dot white, and the same
weight as the terminal").

**Top cluster reorder.** Per explicit direction ("this [locationLineEl]
should be the top row, everything else will be below it: the stability
banner, then the save plan and edit product button"): the "⚠️ Unstable
load (rear of neutral)" warning (new `stabilityBannerEl` const, same
`unstableLoad` boolean, just relocated) moved out of the CG-slider block
up into the same top cluster as `locationLineEl`/`actionRowEl`, and
`actionRowEl` itself (Save Plan / Edit Comp Product) — previously two
separate conditional render sites, portrait-only above locationLineEl and
landscape-only inside the compartments column — collapsed to ONE
unconditional render site inside the compartments column, used by both
orientations. Final order, both orientations: locationLineEl ->
stabilityBannerEl -> actionRowEl -> compartments -> CG slider (still
computes `unstableLoad`, no longer renders the warning itself).

**White compartment/CG handles.** Per "next change the compartment
handles, the CG handle to white": `PlannerControls.tsx`'s drag-handle
pill (`handleFill`) and `page.tsx`'s CG-slider puck both switched from
`themeFill(darkMode, accentColor, ...)` (graphite, or a custom accent
color if the user set one) to a fixed `"#ffffff"` -- neither element
follows the accent color anymore. `themeFill`/`useCalculatorShell` became
fully unused in `PlannerControls.tsx` once this was the component's only
caller of either; both imports removed.

**Recap/points card backgrounds now transparent.** Per "the recap and
points card backgrounds can be fully transparent, or all black" -- picked
transparent (the two read identically against this page's own solid
`#0b0b0b` background anyway, and transparent needs no color kept in sync
if that background ever changes). Both cards' `background:
"rgba(255,255,255,0.03)"` -> `"transparent"`.

**`PresetQuickPick.tsx` restyled to match the app's theme, colored-dot
summaries replace text.** Per "we want this thing to match our theme
better... take the plan slot letters out of the square boxes... instead
of describing the plan just use colored dots... [for] the product
selection, and each [compartment]":
- Sheet container and every row now use the same `GRAPHITE`/
  `GRAPHITE_DARKER` gradient + `CARD_BG`/`CARD_BORDER`/
  `CARD_BORDER_SELECTED`/`CARD_SHADOW` tokens every other bottom sheet and
  card in this app already shares (`CancelLoadSheet.tsx`, the Cards tab,
  Reports tiles) -- replacing this component's own one-off flat
  `#111518`/`rgba(255,255,255,0.1)`/`rgba(255,255,255,0.03)` colors.
- The boxed square letter badge (fixed 32x32 box, border, centered) is
  gone -- plain bold text now, white when that row is the active/
  currently-selected plan, dim `rgba(255,255,255,0.55)` otherwise (same
  active/inactive distinction as before, just no box around it).
- A filled slot's text summary (product names, or "unavailable product")
  is replaced by a row of small colored dots -- one per non-empty
  compartment, comp-number order (so dots line up consistently across
  every row), colored via the existing `productColorFor()` family-coding
  (diesel yellow / premium red / else white, the same helper the outage
  banner's own detail cards already use) -- new `colorsForSlot` callback
  in `page.tsx` (`getColors` prop), reading each slot's saved `compPlan`
  the same way `summaryForSlot` already does. The old text summary itself
  is kept, just moved to the row's `title` attribute (a hover tooltip)
  rather than deleted outright -- still available, just not the primary
  visual anymore. An empty slot keeps its plain "Tap to save current
  plan" text (nothing to represent with dots yet).

**Assumption flagged, not confirmed with the user**: "the stad banner" in
the reorder request was interpreted as the "Unstable load" stability
warning -- the only banner-shaped element rendered in this page's own
body (the outage banner lives in the shared Header, not here). Low-risk,
cheap to correct if wrong.

**Live-verified** via the demo login route (temporary redirect bypass,
reverted after, confirmed via grep): screenshot-confirmed in both
portrait and landscape-ish widths -- white/bold "Chevron · Fort
Lauderdale, FL", the stability banner now directly below it and above
compartments, white compartment handles and CG puck, recap/points cards
blending fully into the page background. Opened `PresetQuickPick` and
confirmed Preset A/B (both referencing a product unavailable at this demo
terminal) render two white dots each (matching their 2 non-empty
compartments, `productColorFor("")`'s white fallback for an unresolvable
product), no boxed letter badge, active letter (A) white vs. inactive
dim, graphite card gradient visible on every row. `npx tsc --noEmit` and
`npx next build` both clean.

### Fifth (and, per the user, last-for-a-while) Planner follow-up: rack inline with terminal, white Load button, PresetQuickPick hue fix + inline bigger dots (2026-09-03, same day)

Explicitly flagged by the user as the last pass in this thread for a
while. Four changes:

**Rack moved onto the same line as the terminal, pushed to the far
right, same weight.** Per "put the rack on the same line with the
terminal, all the way to the right, and make it the same weight" --
`locationLineEl`'s rack name (previously its own line underneath,
left-aligned, dim gray) now sits on the SAME row as "{Terminal} · {City,
State}", via `justify-content: space-between`, styled identically (white,
700) instead of its old `rgba(255,255,255,0.45)`/500. The terminal+city-
state pair got its own `overflow:hidden` sub-wrapper so THAT'S what
truncates first on a narrow screen -- the rack name is `flexShrink: 0`,
never the one that gets clipped. Live-verified against a real multi-rack
terminal (Global South, picked North Rack): "Global South · Fort
Lauderdale, FL" left, "North Rack" right, both measured identical color/
weight/size via `getComputedStyle` (`rgb(255,255,255)` / `700` / `15px`).

**Load button: fixed white background, black text.** Per "change the
[RELOAD] button to a white background with black letters" -- was
`themeFill(darkMode, accentColor)` (graphite, or a custom accent color)
with `themeTextOnFill(darkMode)` (white text in dark mode); both replaced
with fixed `"#ffffff"`/`"#000000"`. No longer accent-driven at all.
`themeFill`/`themeTextOnFill` became fully unused in `page.tsx` once this
was their only remaining caller there; import removed (both functions
still have other callers elsewhere in the app, e.g.
`CancelLoadSheet.tsx`, untouched).

**PresetQuickPick's "hue" fixed, dots moved inline + sized up.** The
immediately preceding pass's "match our theme better" attempt reused this
app's `GRAPHITE`/`GRAPHITE_DARKER` card gradient (`CancelLoadSheet.tsx`/
Cards tab/Reports tiles' own look) -- explicit same-day follow-up called
that out as having "a [] hue" and pointed at `ExpirationModal.tsx` as the
correct reference instead. Read that file directly rather than guessing:
its own `ExpirationCard` rows use plain, genuinely neutral
`rgba(255,255,255,x)` fills over a flat `#0b0b0b` sheet background
(matching `lib/ui/FullscreenModal.tsx`'s own `bg-[#0b0b0b]` exactly), not
a colored gradient -- `GRAPHITE`/`GRAPHITE_DARKER` (`#2a2a2c`/`#1c1c1e`)
aren't perfectly neutral grays, which is what read as a hue against the
app's genuinely flat-black surfaces. `PresetQuickPick.tsx`'s sheet
background reverted to flat `#0b0b0b`; each row's background/border
switched from `CARD_BG`/`CARD_BORDER`/`CARD_BORDER_SELECTED`/`CARD_SHADOW`
to new local `ROW_BG`/`ROW_BG_ACTIVE`/`ROW_BORDER`/`ROW_BORDER_ACTIVE`
consts matching `ExpirationCard`'s own neutral palette shape (no import
from `cardTheme.ts`/`GRAPHITE` needed anymore).

Also per "put the compartment dots next to the plan name and raise the
size of them up a little": the dot row moved from its own line beneath
the preset name onto the SAME line (name and dots share one flex row now,
name gets `flexShrink:1` so it's the one that truncates if space is
tight), and dot size went from 9px to 12px, with the outline color
flipped from a near-invisible `rgba(0,0,0,0.35)` to `rgba(255,255,255,0.25)`
-- the darker outline would have made a genuinely black (empty-
compartment) dot disappear entirely against the row's own dark
background.

**Empty compartments get a black dot.** Per "empty compartments should
get a black dot" -- `colorsForSlot` (`page.tsx`) no longer filters out
empty/no-product compartments before mapping to colors; every entry in
the saved plan gets a dot now (comp-number order, same as before), black
(`"#000000"`) for `v.empty || !v.productId`, `productColorFor(...)`
otherwise -- so the dot count always matches how many compartments the
saved plan actually has, not just how many were filled. Live-verified the
color-resolution half concretely: the SAME two presets that showed white
dots at Chevron (product not sold there, `productColorFor("")`'s white
fallback) showed real yellow diesel dots once the terminal was switched
to Global South, where that product IS sold -- confirms `colorsForSlot`
re-resolves live against whichever terminal is currently selected, not a
cached/stale color. The black-dot branch itself (`v.empty` case) was not
separately exercised live -- this demo account's own `slotHas` semantics
treat a saved-but-fully-empty plan the same as "never saved" (a
pre-existing, unrelated app behavior), so a real "some compartments
filled, some genuinely empty" preset wasn't reproducible without an
equipment/data setup this session didn't have on hand. Low risk: a
one-line ternary alongside the already-proven `productColorFor` branch.

**Live-verified** via the demo login route (temporary redirect bypass,
reverted after, confirmed via grep) in both landscape-ish and portrait
widths for every change above except the specific black-dot case noted.
`npx tsc --noEmit` and `npx next build` both clean.

### Sixth Planner follow-up: dot order/count fix, more portrait spacing, rack/pin color reverts (2026-09-03, same day)

Sixth pass in the same day's thread. Seven items, one clarified via
`AskUserQuestion` rather than guessed.

**Preset dots: fixed order, always match the real compartment count.**
Two real, related bugs, both found by the user against real data (Global
South, a 3-compartment trailer), not guessed at:
1. Dots rendered in ascending comp-number order (1, 2, 3 left to right)
   -- backwards relative to how the actual compartment bars render
   (`PlannerControls.tsx`'s own `ordered = [...compartments].sort(asc).reverse()`,
   "right-to-left display" -- comp1 is the RIGHTMOST bar, matching the
   physical trailer viewed from the passenger side). `colorsForSlot`
   (`page.tsx`) now sorts descending so the dots visually match the bars.
2. Dot count only reflected however many keys happened to exist in the
   saved plan SNAPSHOT, not the equipment's real compartment count -- a
   preset saved before a compartment existed, or one whose snapshot never
   recorded it, showed fewer dots than the trailer actually has.
   `colorsForSlot` now iterates the equipment's own live `compartments`
   list (reading each real comp number's plan entry, defaulting to black
   if missing) instead of `Object.entries(plan)` -- dot count can no
   longer drift from the truth. Live-verified together: Global South
   North Rack, comp3=D2/comp2=MT/comp1=D2 -- Presets A/B now show exactly
   3 dots, yellow-black-yellow left to right (comp1's yellow dot correctly
   rightmost), the black middle dot for the genuinely empty compartment.

**PresetQuickPick: dots pushed further from the name.** Gap between the
preset name and its dot row widened 8px -> 16px, per "shift them to the
right away from the label a bit."

**More vertical space around the location line.** `locationLineEl` gained
`marginTop: 10` (was 0) alongside its existing `marginBottom` (12 -> 18).

**Compartment bars: wider gap in portrait, landscape untouched.** Per
"the compartments are too close and cluttered looking in portrait mode"
(explicitly NOT landscape -- "next we can fix the landscape" flags that
as separate, later work): `PlannerControls.tsx`'s inter-bar `gap` (and
the matching `gapPx` used in the bar-width calc, which has to stay in
sync or the bars overflow/underflow) went from a flat 12px to
`isLandscape ? 12 : 20`.

**Rack label reverted to gray.** Per "the rack label on the right can go
back to grey" -- this reverses only the immediately preceding pass's
color/weight change (white/700 -> back to `rgba(255,255,255,0.45)`/500);
it stays on the same line as the terminal, pushed to the far right --
that part of the preceding pass is unchanged.

**Location pin icon: white, not red.** `SolidPinIcon`'s fixed color in
`headerIconsEl` changed from `#ef4444` to `#ffffff`.

**Load button font-weight -- investigated, no code difference found.**
"The load button should have the same weight as the reload" -- both
states render from the exact same button element/style object (confirmed
via `getComputedStyle` on both a disabled "RELOAD" and, live at Global
South, a genuinely ENABLED "LOAD" -- `fontWeight: 700`, `fontSize: 16px`,
same bg/text colors, identical in every property). Asked the user via
`AskUserQuestion` rather than guess at a code change with nothing to
actually change; they confirmed they'd seen an apparent boldness
difference. Left as a flagged, unresolved observation rather than a
blind edit -- most likely explanation is the disabled-state 50% opacity
(a real, intentional dimming) being mistaken for a weight difference,
but not confirmed either way this pass.

**Live-verified** via the demo login route (temporary redirect bypass,
reverted after, confirmed via grep), all in portrait: pin icon white,
wider compartment gaps, visible extra space above/below the location
line; switched to Global South/North Rack and confirmed via
`getComputedStyle` the rack name reads back at `rgba(255,255,255,0.45)`/
500/13px (still same line, still far right) while the terminal/city-
state stayed white/700/15px; the dot fixes confirmed as described above
against real mixed-compartment data. `npx tsc --noEmit` and `npx next
build` both clean.

## Landscape rebuild: vertical icon rail, single stretching column, ultra-wide 3-box row (2026-09-04)

The deferred "Phase 2" from the very first icon-rail pass ("the whole
strip... eventually becoming a left-edge rail in landscape... expect to
move that around until we get it right") -- finally built once the user
sent a real landscape mockup screenshot (matching the portrait one from
earlier the same thread). Per explicit direction: "move the icon strip
into a vertical column and put it all the way left. then keep everything
else on the right and take all (most) space out between cards and
comp/location etc. we shift the recap and points cards side by side and
stretch the comps and load button to fit, up to a reasonable width...
keep the recap/points cards in line until it makes sense to shift the
points out and over, then on obnoxiously wide screens we can shift the
load button over to the right of points all in one row of equal width
and height for each."

**This replaces the ENTIRE previous landscape system.** Every session
before this one spent many rounds building a fixed-width-two-column +
`transform:scale` composition (`REF_COMPARTMENTS_W`/`REF_SIDE_W`/
`rowScale`/`useElementWidth`/`useNaturalHeight`/`columnMaxHeight`, the
whole measured-then-scaled machinery) specifically to keep a
buttons-and-cards side column legible next to compartments. With
Equipment/Location/Temperature/the plan-letter cluster moved OUT of the
page entirely (into the header, see below), there's no second column
left to protect -- the whole system became unnecessary, not just
outdated, so it was deleted rather than adapted. `app/planner/hooks/useElementWidth.ts`
and `useNaturalHeight.ts` are now fully unused anywhere in the app and
were deleted outright.

### The vertical rail (`CalculatorLayoutClient.tsx`)

`Header` now takes an `isLandscape` prop and branches its entire return:
portrait is byte-for-byte the same horizontal row as before; landscape
returns a narrow (84px) full-height column with `flexDirection:"column"`
and the same `justify-content:space-between` trick already used for the
horizontal row's even icon spacing, just rotated -- `NavMenu`, `BellIcon`,
the portal slot (`display:"contents"`, unchanged), and `GearIcon` are the
exact same four children in both orientations. The portaled plan-letter/
EQ/pin/temp cluster (`page.tsx`'s `headerIconsEl`) needed **zero changes**
to work vertically -- none of its own buttons hardcoded a row-only
layout, so they just follow whichever direction the parent flex
container is in. Live-verified via direct `getBoundingClientRect()`
measurement: all seven icons render with genuinely even 86-87px gaps
top to bottom.

This applies to **every** `/planner/*` route, not just the Planner page
-- Header/ShellChrome are shared shell components, and the rail is an
orientation-driven property of the shell itself, not something scoped to
one page. Live-verified on `/planner/dispatch`: the rail correctly shows
just hamburger/bell/gear (3 evenly-spaced items, empty portal slot),
same as the portrait header already did for that route.

**Outage banner**: `useActiveOutageBanner` moved from being called
inside `Header` to being called once in `ShellChrome`, with the result
passed to `Header` as a prop -- portrait still renders it inline in
`Header` itself (unchanged spot, right after the icon row); landscape's
narrow vertical rail has no room for a horizontal ticker, so `ShellChrome`
renders it separately, above the scrollable content column, only when
`isLandscape`. One fetch either way, just consumed from two different
render sites depending on orientation.

`ShellChrome`'s own outer div switches `flexDirection` between `"column"`
(portrait, unchanged) and `"row"` (landscape, rail + content side by
side) via the same `useIsLandscape()` hook every other orientation
decision in this app already uses (default `minWidth: 640`, matching
`page.tsx`'s own call so the two conditions can't disagree).

### Single stretching column (`page.tsx`)

With no second column to negotiate against, the Planner's own landscape
composition collapsed to the SAME single-column flow portrait already
uses -- `locationLineEl → stabilityBannerEl → actionRowEl → compartments
→ CG slider → recap+points → Load button → footnote` -- wrapped in a div
capped at a new `LANDSCAPE_MAX_W = 1100` constant and centered
(`margin:"0 auto"`), so nothing stretches to an absurd width on a huge
monitor ("stretch the comps and load button to fit, up to a reasonable
width") while still filling normal landscape widths naturally. Compartment
bars needed no new width handling at all -- they're already percentage-
of-container in `PlannerControls.tsx`, so they stretch on their own; that
file's existing fixed 100px landscape bar height (unchanged) is what
keeps them a sensible rectangle instead of growing tall as they widen.

Structurally this is two adjacent top-level divs (compartments block,
then a second block for recap+points+Load), each independently
`maxWidth`+`margin:auto`, rather than one merged block -- avoided
needing to move code across the large IIFE boundary that computes
`loadReport`/`recapLabel`/etc., and two adjacent centered divs at the
same max-width read as one continuous column regardless.

**`recapPointsEl` gained a real `"row"` mode** (previously stripped down
to just `"column"` in an earlier pass, with a comment explaining "row"
had been removed as dead -- reintroduced for real this time, not
resurrected blindly): recap's label/gal/lbs/target/diff and the
incentive points card's This-Load/Period-Avg merge into one inline flex
row instead of two stacked cards, matching the mockup's "one continuous
stats band" look. A third mode, `"boxed"`, returns the same two pieces
of content each wrapped in its own bordered tile -- used only by the
ultra-wide composition below.

### Ultra-wide breakpoint: recap/points/Load as three equal boxes

A second `useIsLandscape(1600)` call (`isUltraWideLandscape`, matching
the already-established pattern of a second threshold call on the same
hook, e.g. the earlier `isWide`/`isUltraWideLandscape`-style checks this
project has used before) drives a genuinely different composition at
that width: recap, points, and the Load button become a CSS grid
(`gridTemplateColumns: "1fr 1fr 1fr"`, `alignItems:"stretch"`) of three
equal-width tiles -- `alignItems:"stretch"` is what makes the Load
button's own tile match the taller stat tiles' height, not a hardcoded
number; the button's own style gained `height:"100%"` (only when
`isUltraWideLandscape`) so it fills that stretched tile instead of
sitting at its natural shorter height inside it. Live-verified via
`getBoundingClientRect()` at 1800px width: all three tiles measured
**identically** (356×102px each), grid itself measured exactly 1100px
(the `LANDSCAPE_MAX_W` cap), centered with no horizontal overflow.

**Explicitly not built**: the user's own message described a third,
intermediate state ("keep recap/points... in line until it makes sense
to shift the points out and over, then on obnoxiously wide screens...")
-- i.e. points splitting into its own box while the Load button stays
full-width below, as a separate step between "merged inline" and "three
equal boxes." Left out deliberately, not missed -- the user's own
phrasing hedged twice ("if possible... if that makes sense"), no mockup
showed this specific state, and this pass already had two clear
reference points (the mockup itself, and the plainly-described ultra-wide
end state) to build against. Flagged as a real, addressable follow-up if
wanted -- would slot in as a width band between `isLandscape` and
`isUltraWideLandscape`.

**Live-verified** via the demo login route across three widths: 1280px
(normal landscape -- rail + stretched compartments + merged recap/points
row + full-width Load, matching the mockup closely), 1800px (ultra-wide
-- confirmed three equal boxes as above), and 375×812 portrait (confirmed
**pixel-identical** to before this entire rebuild -- zero regression,
the mockup/rebuild only ever touched the `isLandscape`-gated branches).
Equipment icon confirmed still opens the real Equipment modal from the
rail; Location icon confirmed still opens the real terminal/rack picker,
tested through a full real flow (Global South → North Rack, real D2
diesel data rendering in the stretched compartment bars and the merged
stats row). Console confirmed clean on a genuinely fresh tab (a batch of
alarming-looking errors seen mid-session -- `themeFill is not defined`,
a parse error citing an extra `</div>`, a `useEffect` dependency-array
size warning -- were all confirmed stale/buffered noise from earlier
edit states, per this project's own well-documented "console never
resets for a tab's lifetime" behavior, not live issues; a fresh tab
showed zero errors). `npx tsc --noEmit` and `npx next build` both clean
throughout every stage of this rebuild.

### Landscape follow-up: recap/points reverted to real portrait-style cards, just placed side by side (2026-09-04, same day)

Immediate follow-up against a real device screenshot: the landscape
rebuild's "row" mode (merged recap+points into one continuous inline
stats band, no card boundaries) looked bad live -- a lot of dead space,
no visual separation between the two cards' own figures. Per explicit
direction: "keep the cards the way that they look in portrait mode. And
just shift the card over, so they're side by side."

Reversed the over-engineered part of the previous pass: `recapCard`/
`pointsCard` are now built ONCE, with zero mode-dependent field styling
left in them at all -- exactly portrait's own card content/layout (label,
gal/lbs baseline row, right-aligned target/diff, This-Load/Period-Avg
space-between row), each just gaining `flex: 1, minWidth: 0` so two of
them can share a row's width evenly. The only thing that changes across
portrait/landscape/ultra-wide is how these two whole, unchanged cards get
ARRANGED:
- Portrait: `flexDirection:"column"` (unchanged from before any of this
  landscape work).
- Normal landscape: `flexDirection:"row"` -- side by side, each card
  keeping its full portrait-style look, just at roughly half width.
  Live-verified via `getBoundingClientRect()`: both cards measured
  identically, 543×100.5px, genuinely evenly split.
- Ultra-wide landscape (`isUltraWideLandscape`): unchanged in structure
  (the same 3-column grid with the Load button), but the grid cells are
  now these same plain `recapCard`/`pointsCard` elements instead of a
  separate bordered "boxed" variant that existed only for this case --
  one fewer visual language to keep in sync, and consistent with "keep
  the cards the way they look in portrait mode" as a general rule rather
  than a normal-landscape-only fix. Re-verified still genuinely equal:
  356×101px per tile at 1800px width.

The now-fully-unused `statBoxStyle` const (the bordered-tile styling only
"boxed" mode used) was removed along with "boxed" mode itself -- `recapPointsEl`
as a mode-taking function is gone entirely, replaced by the two plain
card consts.

**Live-verified** via the demo login route against real data (Global
South/North Rack, real D2 diesel compartments): normal landscape (1280px)
now shows the recap card and points card cleanly side by side, each
looking exactly like its portrait counterpart; ultra-wide (1800px)
confirmed the 3-tile grid still works with the simplified card content,
all three tiles measuring identically; portrait (375×812) re-confirmed
pixel-unaffected. `npx tsc --noEmit` and `npx next build` both clean.

### Gear icon moved into the nav menu, off the header strip (2026-09-05)

Per explicit direction to reduce the header icon strip's count: the
standalone `GearIcon` button (opened `SettingsModal`) is removed from
both `Header` render sites in `CalculatorLayoutClient.tsx` (portrait row
and the landscape vertical rail) — deleted outright, not hidden.
`lib/ui/NavMenu.tsx` gained an optional `onOpenSettings?: () => void`
prop; when provided, a new "Settings" row renders in the dropdown
(between Learn and Sign Out) calling it directly instead of navigating.
`CalculatorLayoutClient.tsx` passes `onOpenSettings={onOpenSettings}`
(the same callback `Header` already received as a prop, previously wired
only to the now-removed gear button) into both `NavMenu` instances.
Every other `NavMenu` consumer (`/admin`, `/superadmin`, `/profile`)
simply omits the prop and gets no Settings row — matches how none of
them had a nearby gear icon before this change either, and none of them
has a `SettingsModal` instance to open.

Portrait's icon row is now hamburger/bell/[portal slot] (6 icons when
the Planner page's own plan-letter/EQ/pin/temp cluster is portaled in,
down from 7); the landscape rail is the same set stacked vertically.
Comments referencing "seven icons"/gear in both render sites were
updated to match.

**Live-verified** via the demo login route: hamburger menu now shows a
real "Settings" row (gear icon, between Learn and Sign Out) that opens
the actual `SettingsModal` (Accent Color/Profile/Subscription/Join a
Fleet, same content as before); confirmed via direct DOM query that the
header itself now only renders two `aria-label`led buttons ("Open
navigation menu", "Alerts") — no gear button left in the strip.
`npx tsc --noEmit` and `npx next build` both clean.

### Temperature confirmation moved out of the header into the LOAD flow itself (2026-09-05)

Per explicit direction: the header strip's Temperature icon (a live °F
reading, tappable any time, opening `ProductTempModal`) is removed
entirely -- confirming/adjusting the product temp is now step one of
tapping LOAD instead, ahead of the existing "Plan Review" step. Full
sequence now: **tap LOAD → Confirm Temp → Plan Review → Complete**.

`app/planner/page.tsx`: `headerIconsEl`'s cluster is back down to plan-
letter/Equipment/Location (the derived `isOverride`/`tempSubColor`
consts that only fed the removed icon's color were deleted along with
it -- both were dead the moment the icon was gone). `loadButtonEl`'s
`onClick` no longer captures `preLoadCardedOnRef` or calls
`loadWorkflow.beginLoadToSupabase()` directly -- after the existing
unavailable-products guard, it now just opens `ProductTempModal`
(`setTempDialOpen(true)`). New `handleConfirmTempAndBeginLoad` (wired as
`ProductTempModal`'s new `onConfirm` prop) does what the LOAD tap used
to do immediately: captures `preLoadCardedOnRef` (unchanged logic, just
one tap later -- still genuinely "right before the load begins," since
nothing else touches the terminal's access date in between) and calls
`beginLoadToSupabase()`, which opens `LoadingModal` ("Plan Review") same
as before.

`ProductTempModal.tsx`: gained a required `onConfirm: () => void` prop.
`FullscreenModal`'s `footer` is now a "Confirm & Continue" button
(styled via `styles.doneBtn`, same cast-to-any precedent `LoadingModal`
already uses for this shared style) instead of the default plain "Done"
-- calls `onConfirm`. The header's existing "Close" button (onClose) is
still the bail-out: no load has been started yet at this point (begin_load
hasn't run), so closing just closes, nothing to undo. Modal title changed
from "Product Temp" to "Confirm Temp" to match its new role as a
confirmation step rather than an always-available adjustment screen.
Content/behavior otherwise unchanged (prediction banner, per-product temp
list, the dial, the Learn link). This is this modal's only call site, so
no other consumer needed updating.

**Live-verified** via the demo login route against real data (Global
South/North Rack, real D2 diesel compartments, temporarily bypassing the
admin/dispatch landing redirect to reach the driver-style Planner, same
pattern used for prior icon-rail passes, reverted after -- confirmed via
`grep -n "TEMP:"` returning empty): header cluster confirmed down to
plan-letter/EQ/pin, no temp reading anywhere in the strip. Tapped LOAD --
"Confirm Temp" opened first (real predicted temp 89.4°F, LOW CONFIDENCE,
already applied), screenshot-confirmed. Tapped "Confirm & Continue" --
"Plan Review" opened next, correctly showing the same 89.4°F carried
through into its TEMP °F field (proving the two steps share the same
`tempF` state, not two independently-tracked values). Tapped Complete --
the existing CancelLoadSheet confirmation ("Log the Load / Update Card,
No Load / Report Terminal Issue / Back to Planner") appeared unchanged,
confirming step 3→4 still hands off to the same established flow. Tapped
"Back to Planner" to cleanly undo the test load (no fake data left in
the demo company). `npx tsc --noEmit` and `npx next build` both clean.

## Plan Review redesign: mid-load terminal switch, compact compartment rows, themed sheets (2026-09-05)

Four-part request, all shipped together: (1) a real, fairly deep new
feature -- tapping the terminal name in Plan Review (`LoadingModal.tsx`)
now opens the shared location/terminal picker without leaving the modal,
and if the driver actually picks a different terminal, a new confirm
sheet asks what to do about it; (2)/(3) redesigned the compartment/API
section to drop product names in favor of compact codes with API/Temp
inline; (4) confirmed Live Weight/vs. Target stays as-is.

### Part 1 — mid-load terminal switch

**Top row**: Terminal moved to the left (was Equipment), Equipment to the
right; both bigger (13px→15px). Terminal text is now white/700 (was the
same muted `rgba(255,255,255,0.65)` both used) and, when
`onTapTerminal` is wired, a real button with a trailing "›" that opens
the picker.

**The confirm flow itself** (`app/planner/components/TerminalSwitchDuringLoadSheet.tsx`,
new) -- `page.tsx`'s `handleTapTerminalInLoadingModal` snapshots
terminal/rack/city/state, then calls `shell.setTermOpen(true)` (the same
shared `MyTerminalsModal` instance the Planner's own Location card
already opens -- no second picker built). A `useEffect` watches
`shell.termOpen`/`locOpen`/`rackPickerOpen` (all three, since "Change" on
the picker routes through `locOpen` too, and a multi-rack terminal pick
routes through `rackPickerOpen`) and, once every one of them is false
again, compares the live `location.selectedTerminalId` against the
snapshot -- only opens the confirm sheet if it genuinely changed (a
closed-without-picking or re-picked-the-same-terminal case needs no
further interruption).

**Real race condition found and fixed while verifying this, not shipped
blind**: `chooseTerminal` (`CalculatorShellContext.tsx`) sets
`location.selectedTerminalId` synchronously but resolves whether to open
`rackPickerOpen` only after an awaited `terminal_racks` count query --
live-tested proof that the naive "all three flags are false" check could
fire in the real gap between those two moments, briefly showing the new
confirm sheet and the rack picker at the same time. Fixed by adding a new
`rackResolving` boolean to the shell (true from the instant
`chooseTerminal`'s async lookup starts until either branch resolves),
added to my watcher effect's guard. Re-verified live afterward: the same
repro sequence that used to show both sheets at once now correctly shows
only the rack picker, then only the confirm sheet once rack-picking
settles.

**The three choices** (matching the literal spec): "Switch to {new}
(No Card Update)" (primary), "Update Card at {previous}", "Report
Terminal Issue" -- in that order.
- **Update Card at {previous}**: discards the pick entirely. Reverting
  city/state/terminal/rack together needed `location.skipResetRef`
  (already exposed on the `location` hook's return object, previously
  only ever used internally by `useLocation.ts`'s own persisted-location-
  restore effect) -- without it, `useLocation.ts`'s own "reset city/
  terminal/rack when state changes" / "reset terminal/rack when city
  changes" effects would clobber each successive setter call in the same
  revert. Then re-renews today's access date at the terminal being
  stayed at (`terminals.setAccessDateForTerminal` + `refreshTerminalAccessForUser`,
  both already existing).
- **Switch to {new} (No Card Update)**: the terminal/rack are already
  live-applied by the picker itself (nothing to re-apply) -- retags the
  active load's own `load_log.terminal_id`/`rack_id` (plain non-blocking
  UPDATE, same pattern `beginLoadToSupabase` already uses for
  `rack_id`/`plan_slot`), deliberately never touches `terminal_access` for
  the new terminal (the whole point of "No Card Update"), clears every
  planned product's API input (`setProductApi(pid, "")` -- lets
  `LoadingModal`'s own existing prefill-if-empty effect re-seed once
  `terminalProducts` refetches for the new terminal/rack, already fully
  reactive, no new fetch needed), and refreshes temp:
  - **Same city** -- silently, in the background: waits for
    `useFuelTempPrediction`'s own automatic refetch (its signature
    already includes `terminalId`, so a terminal-only change already
    triggers a fresh prediction with no code change needed there) to
    complete a full loading cycle, then force-applies the new
    `predictedFuelTempF` to both the shared dial and every planned
    product's own `tempF` (mirroring `beginLoadToSupabase`'s "Init
    per-product inputs" seeding).
  - **Different city** -- reopens the exact same `ProductTempModal`
    instance the original LOAD flow uses, but with a different
    `onConfirm` (the modal's `onConfirm` prop is now dynamic --
    `tempReconfirmProductIds != null` routes to `handleConfirmTempReconfirm`,
    which just propagates the confirmed temp into the in-progress plan and
    returns to Plan Review, instead of `handleConfirmTempAndBeginLoad`,
    which begins a brand new load).
- **Report Terminal Issue**: reuses the exact submission logic
  `CancelLoadSheet.tsx`'s own report flow already built
  (`onSubmitOutageReport`, unchanged) via a new override on
  `handleSubmitOutageReport` (`overrideTerminalId`/`overrideRackId`,
  optional -- `CancelLoadSheet`'s own call site never passes them, so its
  existing behavior is completely unchanged) so the report targets the
  terminal the driver was actually loading at (the snapshot's "previous"),
  not the live selection (which by this point is already "next"). Unlike
  `CancelLoadSheet`'s own version, a successful submit here does **not**
  end the load or ask a card-renewal follow-up -- per explicit direction,
  it just returns to this sheet's own main menu so the driver can still
  pick update-card/switch, or report another issue.

**Named (not inline) `setProductApi`/`setProductTemp`** -- both used to
only exist as inline arrow functions passed directly as `LoadingModal`
JSX props; hoisted into real `useCallback`s in `page.tsx` so the new
terminal-switch handlers (which need to call them imperatively, not just
hand them to a render) have something to call. `LoadingModal`'s own prop
values are unchanged in behavior, just point at the named versions now.

**`RackSelectSheet.tsx` restyled** to the same GRAPHITE-gradient +
CARD_BG/CARD_BORDER/CARD_SHADOW treatment `CancelLoadSheet.tsx` already
established -- per explicit direction that every window in this flow
needs the app's own themed look, not the flat `#111518`/plain-rgba
"generic grey" this sheet still had (it now sits directly alongside the
new terminal-switch sheet in the same flow, where the mismatch would
otherwise be obvious).

### Parts 2/3 — compartment rows redesigned, API history restyled as a print-out

Compartment rows dropped the full product name in favor of just the dot
+ short code (`C1-D2`, `C2-93`, `C3-87`) -- new `productCodeById` map in
`page.tsx` (same `button_code ?? product_code ?? first-word-of-name`
fallback chain `PlannerControls.tsx`'s own compartment bars already use,
reused rather than reinvented), freeing room to bring GAL/API/°F onto the
same row as three independent tap targets instead of gallons alone (API/
Temp both open the same per-product overlay as before -- two
compartments sharing a product still correctly show/edit one shared
value). A transparent (no card, no border) "Total" row was added last,
summing `plannedLines`.

The old separate "API + Temperature" card-list section is gone entirely
-- replaced with a plain "API History" print-out: one line per product,
no card/background, using a new `apiLineParts()` helper (replacing the
old single pre-formatted `fmtLastApiLine_` string) so the date/time
portion (`08/04 @ 12:16 hrs`) renders bold/white while the rest of the
line (`API last updated`, `— may be stale`) stays quiet -- the numeric API
value itself is no longer restated here, since it's already visible
directly in the compartment row above.

### Part 4

Live Weight / vs. Target card confirmed unchanged, per explicit direction
("is good I think").

**Live-verified** via the demo login route (temporary redirect bypass,
reverted after, confirmed via `grep`), against real Global South (North
Rack, multi-rack) and Chevron (Main Rack, single-rack) data, both in Fort
Lauderdale, FL: redesigned top row and compartment rows screenshot-
confirmed (white/bold Terminal left, gray Equipment right, themed
compartment rows, transparent Total, print-out API History with the
date/time portion visibly whiter than its surrounding text); tapped the
terminal name mid-load, picked a different terminal, confirmed the
themed switch sheet appeared with the correct previous/new names;
"Report Terminal Issue" → Out of Product (single-product auto-submit)
correctly posted against the *previous* terminal (confirmed via the
header's own outage-ticker showing "Out of ULSD" for Global South
immediately after) and returned to the same 3-option menu, not the load-
ending flow `CancelLoadSheet`'s own version uses; "Switch to {new} (No
Card Update)" correctly re-seeded API from the new terminal (50.6 →
36.5, matching Chevron's own real last-observed reading) with no
unwanted modal interruption (same city); "Update Card at {previous}"
correctly reverted terminal/rack identity back to the snapshot. The
`rackResolving` race-condition fix was independently re-verified live
after adding it -- the same repro sequence that used to show the rack
picker and the confirm sheet simultaneously now correctly shows them in
sequence.

**Not live-verified this pass**: the different-city reconfirm path
(reopening `ProductTempModal` mid-load) -- this session's available demo
terminals were all in the same city (Fort Lauderdale, FL), so a genuine
cross-city switch wasn't reproducible without changing city data this
pass didn't have reason to touch; the code mirrors the already-verified
same-city path's structure closely (same clearing/re-seeding, just a real
confirm step in between) but flagged here rather than assumed. The
`load_log.terminal_id`/`rack_id` retag write (best-effort, non-blocking)
was not independently confirmed via a direct DB query, though it mirrors
an already-proven pattern (`rack_id`/`plan_slot` tagging in
`beginLoadToSupabase`) exactly.

`npx tsc --noEmit` and `npx next build` both clean throughout.

## STUD linked to the outage banner (2026-09-06)

Per explicit direction: marking a product Out via STUD (the rack-level
"Product Status Update" reachable from `MyTerminalsModal.tsx`'s expanded
terminal card) now raises the exact same terminal-outage banner (and same
6am/12pm/6pm/12am clearing schedule) a driver's "Report Terminal Issue"
flow already posts to -- and marking it back Available clears that same
banner. Deliberately Out of Product only, not Out of Allocation, per
explicit distinction: "that is company specific, but the product being
physically out at a terminal" is what STUD represents.

`RackProductStatusModal.tsx`'s `save()` -- unchanged in every other way
(the existing `rack_product_status` upsert with API/temp + canonical-
sibling propagation + temp-bias feed is still the source of truth this
modal exists for) -- now also, best-effort/non-fatal:
- **`isOut === true`**: calls the existing `submitOutageReport()` (already
  built for the Complete-screen "Report Terminal Issue" flow, reused
  verbatim rather than a second insert path) with `reportType:
  "out_of_product"`. Its own `rack_product_status` upsert (is_out only) is
  redundant with the fuller one this modal already does, but harmless.
- **`isOut === false`**: calls a new `clearOutageReportsForProduct(terminalId,
  productId, "out_of_product")` (`useTerminalOutageReports.ts`) -- deletes
  every active `out_of_product` row for that terminal+product, regardless
  of who originally reported it (not just this same modal's own prior
  writes) -- STUD represents the terminal's own current physical status,
  not any one driver's personal claim, so marking Available here should be
  able to clear a peer driver's report too, not just one this same user
  happens to have filed.

**Migration applied 2026-09-06** (`supabase/migrations/20260906000000_terminal_outage_reports_stud_link.sql`,
user ran it in the Supabase SQL editor): the existing `terminal_outage_reports_delete` RLS
policy (from `20260829000000`) is deliberately reporter-only ("I fixed my
own mistake," not a moderation tool) -- which would have silently limited
STUD's own clear to 0 rows for any report someone else filed, with no
error surfaced (RLS-filtered deletes just affect fewer rows, they don't
fail). Added a second, additive DELETE policy scoped to `out_of_product`
rows only (permissive policies OR together, so the existing reporter-only
policy is untouched and still the only one governing `out_of_allocation`)
-- any authenticated user can clear an `out_of_product` report regardless
of who filed it, matching the same "wide open to any role" precedent
`rack_product_status` itself already has (STUD has never been role-gated).

`companyId` threaded through as a new prop --
`CalculatorLayoutClient.tsx` → `MyTerminalsModal.tsx` →
`RackProductStatusModal.tsx` (from `shell.companyId`) -- required by
`terminal_outage_reports.company_id`, same as page.tsx's own
`handleSubmitOutageReport` already needs for the other flow.
`truckLabel` was NOT threaded through -- confirmed by reading
`TerminalOutageDetailModal.tsx`'s own 2026-08-31 note that Out of Product
cards deliberately drop the truck number and show only the company name,
so a STUD-originated report (always `out_of_product`) would never
actually render it either way.

**Live-verified** via the demo login route (temporary redirect bypass,
reverted after, confirmed via `grep`) against real Global South/North
Rack data: opened STUD for D2 (already `Product Out` from an earlier
session's own "Report Terminal Issue" test), tapped "Mark Available" --
console showed no warnings (the clear succeeded), and a fresh navigation
back to Global South confirmed the header's "Out of ULSD" banner was
genuinely gone. Tapped STUD again, "Mark Out", confirmed no warnings, and
a fresh navigation confirmed the banner reappeared -- full round trip
(STUD Out → banner shows; STUD Available → banner clears) confirmed
working. Left D2 marked Available again afterward, matching its real
pre-test state. The migration's own *broadened* half (clearing a report
filed by a genuinely different user) wasn't independently exercised --
this session only has one real reporter identity to test with, same
category of gap this project already flags for other role/multi-user
checks -- but the reporter-only path it's additive on top of was already
proven live, and the SQL itself is a single, simple, already-precedented
policy shape. `npx tsc --noEmit` and `npx next build` both clean.

## Payload Utilization system (2026-09-05) — replaces the incentive system

Full replacement of the "Recovered Gallons" incentive system, per a pasted
spec. Design and reasoning live in `docs/incentive-redesign-plan.md`; this
section is the short record.

**The core change**: the old system compared a load against a manager-entered
per-product benchmark. The new one compares it against what ProTankr itself
calculates the load could have carried. No benchmark, no manager input.

**Findings from the inspection pass, worth not rediscovering:**
- `usePlanRows` was **already** binary-searching available capacity and
  returning it as `effectiveMaxGallons` — with **zero consumers app-wide**. The
  capacity solver never needed writing, only persisting. It's now extracted to
  `planMath.solveMaxGallons` and shared by the Planner and the new engine.
- **`actual_gallons` is copied verbatim from `planned_gallons`** in
  `useLoadWorkflow.ts`'s `onLoadedFromLoadingModal` — the driver only enters API
  and temp at completion. Every load in the DB has `actual == plan`. So Phase 1
  is explicitly **plan-vs-capacity**, stamped `actual_gallons_source = 'PLANNER'`
  and named "Plan Utilization", not "Payload Utilization" — the driver screen
  must not say "GAL LOADED", because the data doesn't support that claim.
- `tare_lbs` and `target_weight` were **both editable by any driver** through
  `ScaleTicketModal` (no role gate at all). Tare stays open by explicit
  decision (the driver weighs the truck; the ticket is the check). The target
  is now staff-gated — it's the denominator of every utilization number.

**Decisions (all explicit, see the plan's "Decisions made"):** the driver's
100% mark is the **company target**, not the legal limit; above target but under
legal is legitimate and is **not clamped**; safety gates key off the **legal**
limit; the legal limit is a **fleet-only** headroom metric tied to user density
(more users → fresher API/temp → tighter prediction → safely raise the target).

**Shipped:**
- `lib/capacity/computeAvailableCapacity.ts` — pure, solves twice (target and
  legal). Measures against the **configured** `cap_gallons`, never the driver's
  `capOverride` handle drag: that's the anti-gaming rule, enforced in the engine
  rather than at the call site.
- `lib/capacity/computeUtilization.ts` — eligibility gates and gallon-weighted
  period aggregation (never a mean of percentages).
- `lib/capacity/useUtilization.ts` — read helpers. **No leaderboard**, by design.
- `supabase/migrations/20260905000000_payload_utilization_phase1.sql` and
  `20260905010000_record_load_utilization.sql` — **APPLIED 2026-09-05** (see
  the apply record below). Purely additive; the legacy incentive system is
  untouched and `calculate_load_points` still fires alongside, so a Phase 1
  rollback never leaves the app with no incentive system.
- `npm test` — 24 tests on node's built-in runner with native type-stripping.
  **No new dependency, no DB, no auth session, no browser.** Deliberate: live
  verification on this project is repeatedly blocked by not having a session,
  so whatever can be proven without one now is.

**The client sends only the computed capacity** (a CG-biased binary search
can't be reimplemented in plpgsql without becoming the second payload
calculation the spec forbids). `record_load_utilization` re-derives every
**input** server-side and enforces the safety gate itself — verified live that
a forged client capacity of 1 gal still yields `excluded_safety` on an
overweight load.

**Verification — stronger than this project usually gets.** A throwaway
PostgreSQL 16 was stood up (`apt-get install postgresql`, stub schema built
from this repo's own migrations) and both migrations were actually executed,
then `record_load_utilization` was exercised end to end: idempotency, quantified
vs unquantified caps, both safety gates, the Out of Allocation auto-link and its
12h window, ownership, and RLS write-blocking. **Worth remembering this is
possible** — it caught two real bugs before any SQL-editor paste:
- `solveMaxGallons` converged from below and could never return its own upper
  bound (a full trailer read 99.99997 of 100 gal → phantom unused gallons and
  100.00002% utilization). Fixed by returning total volume directly when the
  full tanks fit under the weight ceiling.
- A plpgsql `SELECT INTO` matching no row **nulls its targets**; a missing combo
  would have silently nulled the resolved company target.

**Applied to the live database 2026-09-05.** Ran in the Supabase SQL editor,
migration 1 then migration 2 (the second writes tables the first creates).
`docs/phase1-apply-checklist.sql` PART 1 ran first and returned **ALL 40 CHECKS
PASSED** — the `information_schema.columns` spot-check this repo's own
"Architecture reality" rule demands, confirming the live schema matched the stub
the migrations had been verified against, and that none of the three new table
names collided. PART 2 after applying returned **ALL 9 CHECKS PASSED**: three
tables present with RLS on, policy counts 2/2/3, both `incentive_settings`
columns with their defaults (79500 / 80000), and the RPC present with no
duplicate overloads.

A real flaw in that checklist was caught and fixed the same pass: each PART had
been three separate `SELECT`s, and the Supabase SQL editor **only displays the
last result set** when several statements run together — so the column check and
the function check would both have been silently invisible, and the one visible
check would have read as "all clear." Each PART is now a single query with a
summary row that sorts to the top. Both paths were proven against a real
PostgreSQL 16 before being handed over (empty DB → 37 problems correctly
enumerated; complete stub → 40 passed).

**Still unproven:** no real load has been measured, and nothing has been clicked
through in a browser. This environment's network policy blocks every Supabase
and protankr.com host outright (`connect_rejected`, gateway 403 on CONNECT —
a policy denial, not a credential problem; confirmed again 2026-09-05 via
`$HTTPS_PROXY/__agentproxy/status`), so live testing needs either that policy
widened for this environment or a manual walkthrough. The staff-gated target
field also still hasn't been exercised with a real driver-role login — the same
gap this project has documented repeatedly for role-matrix checks.

**Phase 2 shipped 2026-09-05 (driver display).** A utilization card on the
Planner (this-load %, period average, "7,760 of 7,820 gal available planned")
that **replaces** the legacy points card in the same slot rather than sitting
beside it — the spec forbids two incentive systems running visibly at once, and
two competing numbers for one load is exactly that. Legacy code/data stay intact
underneath so the rollback is still real. A `Plan Utilization` tile in Reports
gives the period summary plus per-load history; excluded loads show their reason
and are counted separately, never folded into the score. **No leaderboard.**
`useUtilizationPeriod` resolves the window once for both surfaces (company report
period, else rolling 30 days) so they cannot disagree.

Collapsed a real duplication found while building: Phase 1 had shipped two copies
of the period aggregate and this display was about to be built on the second one.

Verified without a session: the read hook's literal SELECT run against a real
Postgres with the migration applied (a select string is what `tsc` can't check),
and those rows through the real aggregate — 90.12% gallon-weighted where a naive
mean of percentages would have read 95%. 25 tests, `tsc` and `next build` clean.
Still nothing clicked through in a browser, and the migrations are still unapplied.

**Phase 2 retested 2026-09-05 (real Postgres + real component render) — found
and fixed a crash.** Re-verified from the database up: a throwaway PostgreSQL 16
with both migrations applied verbatim, six loads seeded to cover every
eligibility branch, written by the real `record_load_utilization`. Then the
literal SELECT string parsed out of `useUtilization.ts` (not retyped) run
against it, those rows through the real `aggregateUtilization` (94.2957%
gallon-weighted vs 94.6326% for a naive mean — the seed is non-uniform on
purpose so the two can't coincide), and finally `UtilizationReportModal.tsx`
**compiled and actually rendered** via `renderToStaticMarkup` — the first time a
Phase 2 component has been executed rather than only typechecked. No browser,
no new dependency: `tsc` emits it and React/react-dom are already direct deps.
**Worth remembering this is possible** — same lesson as Phase 1's throwaway
Postgres, one level up the stack.

The render caught a real bug typechecking never could: `UtilizationReportModal`
called `r.utilization_pct.toFixed(1)` on rows straight from PostgREST, so a
numeric arriving as a string threw and took the **whole modal** down (`gal()`
survived only because `Math.round` coerces, which is why it hid). This repo had
already decided that question everywhere else — `usePlanSlots`' recall lookup
coerces all seven fields, `aggregateUtilization` coerces and had a test pinning
the string case, `MyLoadsModal` uses `Number(x).toFixed(1)` on the same class of
value — so two of three consumers of `load_utilization` coerced and the third
threw. Fixed at the **read boundary** (`normalizeUtilizationRow`, pure, applied
in `fetchRows`) rather than per call site, so `UtilizationRow`'s declared
`number` type is finally true for every present and future consumer; nulls stay
null. 27 tests; string rows now render byte-identical to numeric ones.

Also measured, flagged **not** fixed: `useUtilizationPeriod`'s
`${start}T00:00:00Z` is UTC midnight, 4–7 hours before a US fleet's real local
period start, so a load from the previous period's last evening can land in the
new window. Left alone deliberately — the existing Period Report filters with
`${start}T00:00:00` (no zone, resolved server-side as UTC too), so the two
surfaces agree today, and there's no per-company timezone field to do it right.
It belongs with the Period Report, as one change to both.

Still unverified for Phase 2: anything needing a real browser or account — the
Planner card's layout on a device, a genuinely completed live load, driver-role
behavior. **Correcting an assumption this doc carried:** the network is NOT the
blocker in a remote cloud session. Measured 2026-09-05 from one:
`protankr.com` returns 200 and the Supabase host returns 401 (reachable, no
credentials) — not the `connect_rejected` an earlier environment hit. The real
blockers here are that the container has no `.env.local`, its
`SUPABASE_*` env vars are the literal placeholder `...`, and it has no browser
tool at all — so a user logging in to a browser does not help this kind of
session. What would: a working anon key plus a test account, which is enough to
sign in over the auth REST API and read `load_utilization` under real RLS with
`curl`, no browser needed.

**"All zeros" investigated against live production 2026-09-05 — benign, and
the engine is now proven on a real load.** The user ran the Phase 2 summary
query in the SQL editor (service role, so RLS hides nothing) and got 0 rows /
0 eligible / NULL everywhere. Diagnosed rather than guessed at, using the
**anon key + the demo login route over plain `curl`** — no browser needed,
which is the method this doc predicted would work and is worth reusing:
`GET /api/demo/start?persona=alpha` returns a redirect carrying a
`token_hash`; `POST /auth/v1/verify` with `{type:"magiclink",token_hash}` and
the anon key returns a real `access_token`; every PostgREST read after that
runs under genuine RLS as that user.

**Cause: nothing has completed since the migrations were applied.** The most
recent `load_log` row with a `completed_at` is `2026-09-05T05:23:50Z`; the
migrations were applied later the same day (checked at 21:20Z). The engine
only ever runs in `onLoadedFromLoadingModal`, right after a real
`complete_load`, so it has simply never had a chance to fire. Not a bug — but
it is also not evidence the thing works, so the whole chain was verified
link by link instead of assumed:
- The RPC **is** wired (`useLoadWorkflow.ts:435`), gated on
  `capacityResult && available_gallons > 0`, fed from `page.tsx:1028`.
- All three Phase 1 tables exist live (HTTP 200, empty under anon RLS), and
  `incentive_settings` carries `target_gross_lbs`/`legal_gross_lbs` = 79500/80000.
- Every gate that could silently zero out capacity was checked against the
  real last load: all three of its products have real `api_60`/`alpha_per_f`,
  and its compartments have real `cap_gallons`. So the next completed load
  will produce a row.

**The real engine, run on that real load's real numbers** (tare 25,070,
cg_bias 0.543, three compartments, live product densities): available 8,446.8
gal, `limiting_factor: "company_target"` (correct — 9,650 gal of tank, so
weight-limited not volume-limited), 8,530.0 gal at legal (83 gal of fleet
headroom), actual 8,456.5 gal → **100.1% utilization**, safety gate passes at
79,501 lbs gross against an 80,000 legal ceiling. That >100% figure is the
spec's "above target but under legal is legitimate and is not clamped"
decision behaving correctly on real data, not a rounding artifact.

**One fix from this pass**: the `available_gallons > 0` gate was a *silent*
skip. `capacityCompartments` correctly drops any compartment missing
`api_60`/`alpha_per_f` or `cap_gallons` (capacity is underivable without
density) — but if every compartment drops, no row is written and
`load_utilization` just stays empty with nothing anywhere saying why, which
is indistinguishable from the engine being broken. It now logs a
`console.warn` naming the likely cause. That is the first thing to check if
rows still don't appear after the next real load.

**That prediction was wrong, and the real cause is a deployment gap
(2026-09-06).** The user completed a real load and re-ran the query: still
zero rows. The diagnosis above was right about the database and right about
the engine's math, and still missed the obvious thing -- *which branch
production actually runs*. Vercel deploys `main`. Checked directly:
`record_load_utilization` appears **0 times** anywhere on `origin/main`,
`lib/capacity/` **does not exist** on `origin/main`, and neither Phase 1
migration file is on it either -- the whole Payload Utilization feature lives
only on `claude/protankr-incentive-redesign-i1whfi`, 15 commits ahead. The
migrations were applied to the live database by hand in the SQL editor, which
is exactly why the tables exist and the summary query *runs* and returns 0
rows instead of erroring -- the schema shipped ahead of the code. Production
has no code path that calls the RPC, so no completed load on production can
ever write a `load_utilization` row until this branch reaches `main`.

The lesson worth keeping: when live data is missing for a feature verified
only on a branch, check the deployed ref **before** investigating the data.
Every check in the diagnosis above was sound and none of them could have
found this, because none of them asked what production is running. Note also
that a Vercel *Preview* build is not an available shortcut here -- see
"Pre-launch cleanup" below: Preview is missing `SUPABASE_SERVICE_ROLE_KEY`,
so any Preview build of this repo fails at page-data collection.

**VALIDATED ON A REAL PRODUCTION LOAD 2026-09-06.** After the deployment gap
above was closed (merge to `main`) and the build fix below, a real completed
load finally wrote a real row:

| available | effective | actual | unused | utilization | constraints |
|---|---|---|---|---|---|
| 7940.911 | 7940.911 | 7824.00 | 116.911 | **98.5277%** | 0 |

Eligible, no external cap, `effective == available` (nothing narrowed it),
`unused = available - actual` exactly. That is the whole chain proven end to
end on production data for the first time: Planner capacity solve →
`record_load_utilization` → `load_utilization`. The engine is no longer
theoretical.

One loose end from the same check, **not** a defect: an ad-hoc summary query
reported "min = null" alongside the correct count. Both candidate causes were
chased and ruled out against the real row and the RPC source -- `utilization_pct`
is populated (98.53), and `loaded_at` is `coalesce(loaded_at, completed_at,
now())` so it can never be null. Whatever `min` aggregated, it was not a null
in this table. Left as a question about that query, not a tracked bug.

**Phase 2 UI seen on a real device 2026-09-06 — Phase 3's last gate is closed.**
The Planner card and the Reports "Plan Utilization" tile have both now been
looked at on production with real rows behind them. The card renders in the
legacy points card's slot (it replaces it, per the spec's "two incentive
systems must not run visibly at once"), reading **THIS LOAD 100.2% / MONTHLY
AVG 99.4%**, with the sub-line "8,462 of 8,447 gal available planned" — both
halves populated, not an em-dash fallback. That 100.2% is the spec's "above
target but under legal is legitimate and is **not** clamped" decision behaving
correctly on real data: the recap on the same screen reads 79,500 lbs against
a 79,500 target (diff +0), safely under the 80,000 legal ceiling, while the
plan carried 15 gal more than the solver's target-weight capacity figure. The
Reports tile reads the identical data through the same
`useDriverPeriodUtilization` hook, so the two surfaces cannot disagree.

**Why it was hard to find, and who can actually see it — a real product gap,
not a bug.** The card lives only on the driver-style Planner (`/planner`), and
`navDestinations.ts` gates that to `isSuperAdmin || role === "driver" || role
=== "lead"`, with `defaultLandingPath` hard-redirecting `admin`/`dispatch` to
`/planner/dispatch`. It was reachable here only because this account is a
**super admin** (`defaultLandingPath` short-circuits to `null` for them, by the
same standing "one account can verify every role's view" precedent). An
ordinary fleet admin — the actual customer case — cannot reach the page at all
and so cannot see what their drivers see. Fine today with one admin; not fine
at launch. Belongs with Phase 3's fleet dashboard, not a patch here.

### Phase 3 shipped 2026-09-06 — fleet dashboard, replacing Underloading

`app/admin/UnderloadingDashboardModal.tsx` is **deleted**, replaced by
`FleetUtilizationModal.tsx` (data) + `FleetUtilizationView.tsx` (presentation).
The admin header tile is relabelled **Underloading → Utilization**; its
`admin || lead || dispatch` gate is unchanged, and so is the RLS behind it
(`load_utilization_staff_read` is `is_company_staff(company_id)` — owner/admin/
lead/dispatch — the same audience the old dashboard had, so **no migration was
needed for this phase at all**).

Three behavioural changes fall out of the new data source, none of them
cosmetic:
- **No `incentive_settings.enabled` gate.** The old dashboard's "turn
  Incentives on and set a benchmark" empty state was honest for a
  benchmark-driven metric. The capacity engine needs no benchmark and no
  configuration, and the spec (§9/§21, TEST K) forbids measurement reading
  `enabled` at all. A company that has configured nothing now gets real
  numbers; the empty state says "there is nothing to turn on."
- **Not a leaderboard (§17).** The per-driver table sorts by **name**, never by
  score. This deliberately reverses the old dashboard's own recorded decision
  ("sorted by gallons desc, not alphabetical — a leaderboard framing fits the
  number that justifies the subscription"). Utilization is shaped by dispatch,
  terminal allocation and equipment as much as by the driver, so ranking on it
  produces a blame chart wearing a scoreboard's clothes.
- **Excluded loads shown, never folded in (§10/§11).** Safety-excluded and
  externally-capped loads get their own count under the table and contribute to
  no figure above it.

**Headroom (§4a) has its own block** — the gap between fleet capacity at the
company target and at the legal limit, framed as opportunity, with the
target-limited load count and an explicit "raising it is always a decision,
never automatic." Never driver-facing; staff-only by living behind `/admin`.

**A real bug found before building on it, not after.** `useCompanyHeadroom`
had shipped in Phase 1 with **no consumer**, and its query was a PostgREST
embed: `load_utilization?select=...,load_capacity_snapshot(...)`. Both tables
carry a foreign key to `load_log` and **none to each other**, which is not an
embeddable relationship — verified against production, which answers
`PGRST200 "Could not find a relationship"`. Every call would have thrown. Fixed
as two queries with a client-side join (chunked `.in()` at 200 ids, since
PostgREST filters ride in the URL); going through `load_utilization` first is
still required because `load_capacity_snapshot` has no `company_id` of its own.
All three queries Phase 3 issues were then re-run against production and come
back clean. **Lesson worth keeping: a hook with no consumer has never been
executed, whatever the typechecker says.**

Headroom now sums **eligible loads only** — not a scoring decision (headroom
is not a score), but an `excluded_incomplete_data` load is by definition one
whose capacity could not be established, so its snapshot can read 0 available
against a real legal figure and manufacture headroom out of a measurement
failure. That would inflate the exact number used to argue for raising a
company's weight target, the one direction this must never overstate.

**Verification.** 8 new pure tests (35 total, all passing): name-ordering,
gallon-weighting per driver, excluded loads counted-not-scored, unknown driver
id, headroom math, a nonsensical snapshot unable to cancel real headroom, empty
input, and string-shaped numerics. Plus the render check that caught the Phase 2
crash — `FleetUtilizationView` compiled and actually rendered through
`renderToStaticMarkup` with **PostgREST-shaped string numerics**, 16 assertions
covering the full render, the empty state and hostile input. This is why the
view was split out of the modal: a component importing the Supabase client
cannot be rendered outside a browser. `tsc --noEmit` and `next build` clean.

**Not verified live.** Nothing clicked through in a browser. One caveat worth
knowing before a live check: the only real `load_utilization` row belongs to a
driver who is also an admin of that company, so it is visible through
`load_utilization_own_read` regardless — **opening the dashboard as that user
does not prove `load_utilization_staff_read` works.** That needs a staff user
looking at someone else's load.

### Phase 3 verified live, and the two-account setup that made it possible (2026-09-06)

The operator ran a second real account (`sethandashleyperry@gmail.com`, role
`driver`, same company) on a phone alongside super admin on desktop, and ran
real loads on it. That is what finally closed the gap this file had flagged
repeatedly: **`load_utilization_staff_read` is verified.** The fleet dashboard
renders that driver's two loads to a viewer whose `driver_id` is different,
and no other policy can return them. A single self-owned row could never have
proven it, however many times it was looked at.

Every predicted figure matched the database exactly — fleet 100.1%, 4 loads,
0 unused, 33,192 available, 33,222 planned, two driver rows sorted by name, no
excluded-loads section, headroom +324 gal over 4 target-limited loads (≈81/load,
consistent with the 83 measured on the earlier single load).

**A verification that looked like a pass and wasn't.** The prediction "the
gallon-weighted figure almost certainly won't equal the naive mean of the two
drivers' percentages" was wrong: 33,222 ÷ 33,192 = 100.090%, and the mean of
100.00 and 100.18 is also 100.09. The two drivers moved near-identical gallons,
so both formulas collapse onto the same displayed number. **That check was
inconclusive, not passed** — this dataset cannot distinguish gallon-weighting
from a mean of percentages. Test P3-B pins it instead (94.44% weighted vs
75.00% unweighted, deliberately non-coincident). Separating them live needs one
lopsided load: a small one loaded badly.

### Phase 4 (Period Report) + legacy teardown — shipped and applied 2026-09-06

**The ordering was forced, and the original plan had it backwards.** §1 lists
`PayrollReportModal` as a Phase 4 item to leave alone during the teardown — but
it was a live reader of `load_points`. Doing the teardown first would have
removed the `calculate_load_points` write path while Period Report kept reading
that table: no error, it would simply have frozen at that day's numbers and
quietly become a lie. Period Report had to be rebuilt first.

**Period Report, rebuilt on `load_utilization`** (scope decided explicitly:
"same shape, new numbers"). Kept: period picker, driver-group filter, employee
ID, roster-membership filtering, CSV export with the blank `$ Amount` column,
driver → per-load expansion. New columns: loads measured, gallon-weighted
utilization %, gallons planned, unused gallons. It runs through the **same**
`groupUtilizationByDriver`/`aggregateUtilization` as the fleet dashboard and the
driver's own card — three surfaces, one implementation, so they cannot quote
different figures for one period.

Dropped from it, deliberately: per-compartment detail and inline
edit-and-recalculate. Both were `load_points`-shaped — `load_utilization` is one
row per LOAD, and `edit_load_line`/`recalculate_load_points` are points-specific.
Correcting a load under the new engine is a *different* mechanism, not a smaller
version of that one, so it was not reimplemented on a guess. The "points changed
since export" banner went too: `flag_stale_payroll_reports` only ever fired
because editing existed.

**Period settings moved.** `pay_period_type`/`pay_period_anchor_date` had
`IncentiveSettingsModal` as their only editor, and `useUtilizationPeriod` reads
them for the driver's own window. They now live behind a **Settings** toggle
inside Period Report rather than a second admin tile — "Report Period" sitting
next to "Period Report" would have been genuinely confusing. Admin is down to
three tiles: Fleet Cards, Period Report, Utilization.

**Teardown, app code** (commit `a0aa3b8`): `IncentiveSettingsModal` and its tile
deleted; the driver-side points card, its `incentive_settings`/`load_points`
queries, the `calculate_load_points` call in `useLoadWorkflow`, the `load_points`
sum in `usePlanSlots`, and `LoadReport.recovered_points` all removed. The
utilization card is now the driver's only performance card, not a
preferred-over-points fallback.

**Teardown, database — APPLIED 2026-09-06**
(`20260906010000_drop_legacy_incentive_system.sql`). Drops `load_points`,
`product_benchmarks`, all six legacy functions (by NAME across every overload,
not by signature — several were recreated with changed parameter lists, and this
repo's migrations folder lags the live DB, so a hardcoded signature silently
drops nothing), and `incentive_settings.weight_cap_lbs`. Kept: `payroll_reports`
(Period Report still writes an export marker; its `is_stale` column is now
inert), `load_edit_history` (real audit history, not machinery),
`incentive_settings` itself including `enabled` and the period columns.

The operator authorized the data loss explicitly ("There's no audit value. all
good to go.") after being told it was irreversible and, with one operator, the
only copy.

**Two real bugs found in the pre-flight checklist itself**
(`docs/legacy-incentive-drop-checklist.sql`), both of which would have made it
useless in exactly the case it exists for:
- `conrelid not in (to_regclass(...), to_regclass(...))` — an absent table puts
  a NULL in that list, and `x NOT IN (NULL)` is NULL, not true. The inbound-FK
  check would have returned zero rows and reported **"SAFE TO DROP"** precisely
  when it should have stopped. Now `NOT IN` over a subquery, where an empty set
  correctly yields true.
- `select count(*) from public.load_points` is a **parse** error once the table
  is gone, so no `coalesce` could rescue it. Counts now go through
  `query_to_xml` behind a lazily-evaluated `CASE` guarded by `to_regclass`.

Verified on a throwaway PostgreSQL 16 rather than reasoned about (same technique
as Phase 1, third time it has paid off): planted a deliberate inbound FK and a
dependent view, confirmed PART 1 names both and refuses to say safe; removed
them, confirmed it flips; ran the migration; PART 2 all PASS; re-ran both to
confirm idempotency.

**A process lesson worth keeping.** The first live PART 2 came back with checks
1–4 FAIL and 5–8 PASS — everything to be dropped still present, everything to
survive intact. That all-or-nothing shape says "the DDL never ran," not "it ran
badly." Cause: the migration file still opened with a `⚠ DELIBERATELY NOT
APPLIED` banner written before authorization, and the run instructions described
the checklist as "top half / bottom half," which invites pasting the checklist
file alone. **When a file's own header contradicts the instruction to run it,
the header wins** — fix the header before asking anyone to run it, and paste
short destructive SQL inline rather than pointing at a path.

**`ManageTerminalProductsModal`'s `"pick"` mode removed (same day).** It lost its
only consumer with `IncentiveSettingsModal` and was briefly left in place with a
comment, then removed properly once there was time to do it carefully. Every
change was either a pick-mode branch deleted or a ternary collapsed to its
rack-mode arm — the rack path (`toggle()`, the insert-never-delete
`rack_product_status` write, the query, the grouping heuristic, the styling) is
byte-identical, verified by reading the diff line by line rather than trusting
the typechecker. Two small wins fell out: `rackId` is now required rather than
`rackId?` plus a `rackId!` assertion (the only call site renders inside a
`{selectedRackId && ...}` guard, so it was never actually optional), and the
local `CatalogProduct` type is no longer exported — nothing imported it, and the
similarly-named export in `lib/queries/useProductsCatalog.ts` is a different
type.

Not click-tested from the session that made the change (no browser tool
available); `tsc --noEmit` and `next build` clean, and the effect's guard is
provably equivalent for the surviving mode (`!open || !rackId` versus the old
`!open` then `mode === "rack" && !rackId`).

**Not started:** the incentive/payout layer proper (points → dollars stays
company-side; the app deliberately has no payout calculator), and the
admin-visibility gap — an ordinary fleet admin still cannot reach `/planner`,
so they cannot see the utilization card their drivers see.

### Production deploy failed on the merge: a module-scope service-role read (2026-09-06)

Merging the Payload Utilization branch to `main` triggered the first
production build in a while and it **failed**, with a real error that had
nothing to do with the merged code:

```
Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
  at Object.<anonymous> (.next/server/app/api/admin/setup/route.js:7:3)
> Build error occurred
Error: Failed to collect page data for /api/admin/setup
```

**Not a regression from the merge** -- confirmed by checking ancestry, not
assumed: `lib/supabase/serviceClient.ts` and the route's import of it are
byte-identical on the previous `main` (`7b61241`), both introduced back in
the vault-redesign merge. The merge only *triggered* a build that would
have failed on any commit.

**Root cause**: `serviceClient.ts` read `SUPABASE_SERVICE_ROLE_KEY` at
**module scope** and threw there if it was missing. `next build`'s
"Collecting page data" step imports every route module, so the build itself
depended on a *runtime* secret being present in the build environment. It
wasn't, so importing the module threw before any request could ever exist.

**Why local builds could never have caught this** -- the important part.
This container's `SUPABASE_SERVICE_ROLE_KEY` is the literal 3-character
placeholder `"..."` (checked directly: `len 3`). That is **truthy**, so
`if (!supabaseUrl || !serviceRoleKey)` passed and the module constructed a
useless-but-valid client. Every local `next build` sailed through. A
placeholder env value is worse than an absent one: it silently satisfies
presence checks while proving nothing. **Reproduce this class of failure
with `env -u VAR npx next build`, not by trusting a clean local build.**
Doing exactly that reproduced Vercel's error byte-for-byte, same stack
frames, before any fix was written.

**Fixed**: `getServiceSupabase()` builds and caches the client on first
call, never at import. `app/api/admin/setup/route.ts` (the only importer,
21 usages across two functions) binds it once at the top of `verifyAdmin`
and `POST`, so every existing call site is untouched. A missing key now
surfaces as a 500 on the one route that needs it instead of failing the
deploy of the entire app. Verified by rebuilding with the key unset: the
previously-failing build now exits 0.

**Left alone, deliberately**: `lib/supabase/client.ts` has the same
module-scope shape, but reads `NEXT_PUBLIC_*` vars, which are inlined at
build time and were genuinely present in the failing build. It is not this
bug, and it is the one Supabase singleton every authenticated call in the
app goes through -- not worth the blast radius during an incident.

**Still open, on the Vercel side**: why the key stopped being available to
this Production build at all. The log flags "Sensitive Environment Variable
Redacted 2", and Vercel treats Sensitive vars as runtime-only, so a var
re-added as Sensitive is the leading candidate -- unconfirmed, and now
non-blocking, since the build no longer needs it. Worth checking that
`SUPABASE_SERVICE_ROLE_KEY` is still set for Production before relying on
`/api/admin/setup` at runtime; a lazy client that throws on first request
is a correct build, not a working feature.

### Service-role key restored to Production, verified live (2026-09-06)

`SUPABASE_SERVICE_ROLE_KEY` had been re-scoped to Preview-only, which is what
actually broke the production build (see the deployment-gap entry above). Set
back to "Production and Preview" and redeployed. Verified against real
production, not assumed:

- `GET /api/demo/start?persona=alpha` -> **307** with a real `token_hash`
  (it would 500 if `getAdmin()` still threw). Covers the four routes that
  fail loudly: invite, demo login, both vault-reset routes.
- `POST /api/fuel-temp` for Marathon/Tampa -> `biasApplied: 1.4`,
  `biasSampleCount: 5`, `historyPoints: 14`, confidence high. The
  silent-degradation path is genuinely healthy: bias correction is being
  applied again.

**A trap worth not re-panicking over**: the same call for Global South
returned `biasSampleCount: 0`, which looks like the missing-key symptom and
is not. Bias is keyed `(terminal_id, 3-hour bucket, month)`. The check ran at
UTC hour bucket 3; Global South's September samples sit at bucket 15, so
there was legitimately nothing to apply. Confirmed by reading
`terminal_temp_bias` directly. **Before concluding the bias lookup is broken,
check whether the terminal has a row for the CURRENT bucket and month** --
`lat`/`lon` and `historyPoints` in the same response are the better tell that
the Supabase client itself is alive, since both come from it.

**Reusable verification recipe, no browser needed** (this is the third time
it has paid off): `GET /api/demo/start?persona=alpha` -> pull `token_hash`
out of the `Location` header -> `POST {SUPABASE_URL}/auth/v1/verify` with
`{type:"magiclink",token_hash}` and the anon key -> a real `access_token`,
after which every PostgREST read runs under genuine RLS as that user.

### "Set up planner for another driver" is slated for removal -- benched 2026-09-06

Stated intent: the admin full-app impersonation feature (`setupSession`) is
going away. **Not started, deliberately benched** -- recorded here so no
future pass invests further in it, and so nobody re-derives the scope.

What it would touch: 69 references across 11 files. Delete outright ->
`app/api/admin/setup/route.ts`, `lib/adminSetupClient.ts`,
`lib/setupSession.ts`, `lib/supabase/serviceClient.ts` (that route is its
only importer). Unwind the `setupSession` plumbing in
`CalculatorShellContext`, `useEquipment`, `useTerminals`,
`SoloEquipmentModal`, `EquipmentModal`, the Planner's own banner,
`/admin`'s "Set up planner for X" button, and Dispatch's "Use app as X".
The payoff is that `effectiveUserId = setupSession?.targetUserId ??
authUserId` collapses to `authUserId`, retiring a branch threaded through
much of the app. The `claim_combo`/`couple_combo` service-role overloads in
the DB go dead -- leave them, per this project's own precedent for
abandoned columns and functions.

**Do not treat this as a reason to skip `SUPABASE_SERVICE_ROLE_KEY` in
Production.** Checked, not assumed: five other routes read that key
independently of impersonation -- `api/admin/invite`, `api/demo/start`,
`api/vault/request-reset`, `api/vault/confirm-reset` (all throw without it),
and `api/fuel-temp`, which is the dangerous one: `tryGetSupabaseAdmin()`
returns null and the route carries on, so a missing key **silently** drops
the per-terminal bias correction and city lat/lon lookup. No error, no log,
just quieter and less accurate predictions -- the one failure mode here that
nobody would notice.

## Solo onboarding + invite funnel + dead-easy install + ProTankr Dash + native foundation (2026-09-08/09)

A multi-part launch-readiness push. Everything below is shipped and merged to
`main` unless noted. Plan preserved at `snug-petting-starlight.md`.

### Solo first-run onboarding (Phase 1)

A brand-new solo driver used to land straight in the raw equipment DB UI. Now a
full-screen guided gate walks them from magic-link/code signup to a first usable
load, reusing every existing insert/RPC/picker (does NOT rebuild the planner or
equipment model). Font is the app's existing Outfit (inherited, never
overridden).

- `app/planner/components/SoloOnboarding.tsx` (new) -- 12 screens
  (welcome → name+optional company → truck# → trailer#+comp count → per-comp
  capacities → safety-cap confirm table → combined tare → planner target →
  location → terminal → "ready"+tutorial → complete). **Resume is derived from
  real DB/shell state** (skip name if `profiles.display_name` set, skip truck
  if an active truck exists, etc.) plus a small localStorage `trailerDraft` for
  the one sub-state not in the DB until committed (trailer#+comp count+per-comp
  caps+current index). Cross-device safe: a second device sees everything in the
  DB and completes immediately.
- Reused verbatim: `trucks`/`trailers`/`trailer_compartments` inserts,
  `couple_combo({p_truck_id,p_trailer_id,p_tare_lbs,p_target_weight,p_force:true})`
  (one call carries tare AND target), `upsert_driver_profile`, and the shell's
  already-mounted `LocationModal`/`MyTerminalsModal` via
  `shell.setLocOpen`/`setTermOpen`.
- **Safety cap = total − 50** (clamped ≥1, never > total); terminology is
  **Total Capacity / Safety Cap**, never "legal maximum". Products are NOT asked
  in the questionnaire (done in the planner during the one-time tutorial).
- **Target step**: pre-filled **79,500**, editable, with the warning ("stay
  ~500 lbs under 80,000 for API drift until more users verify the data").
- `app/planner/utils/onboardingProgress.ts` (new) -- per-user localStorage
  helpers (`proTankr:u:<uid>:...`): onboarding-complete, tutorial-seen,
  trailer-draft.
- `supabase/migrations/20260909000000_set_solo_company_name.sql` -- **APPLIED**
  (confirmed live via P0001 "Access denied" on the negative path). Owner-gated,
  solo-only, `SECURITY DEFINER`, pinned search_path. The only writer of
  `companies.company_name`.
- `app/planner/page.tsx` -- mounts `<SoloOnboarding>` ahead of `SetupGate` when
  `shell.isSolo === true && !onboardingDone && effectiveUserId && companyId`;
  suppresses `SetupGate` while onboarding is active.
- **Real launch-blocker found and fixed**: `navDestinations.ts` treated a solo
  driver's `role === 'admin'` as fleet and redirected them off `/planner` to
  `/planner/dispatch` (never reaching the driver planner or onboarding). Added
  an `isSolo` param to `canReachDestination`/`defaultLandingPath` (solo →
  planner/cards/vault only; solo → no redirect), threaded a new
  `isSolo: boolean | null` field through `CalculatorShellContext` (fetches
  `companies.is_solo` keyed on companyId) into the landing-redirect effect and
  the `cards`/`dispatch` route gates (all now wait for `isSolo !== null`).
- Live-verified end-to-end twice (fresh magic-link signup → full flow → usable
  planner) and resume-verified.

### Phase 2 -- super-admin solo invite + Free/Paid entitlement (invite-only)

Access is **invite-only via the super admin** for now (no payment processor
wired). Public "Get the App" stays a request/paywall shell.

- `supabase/migrations/20260909010000_solo_invite_entitlement.sql` -- **APPLIED**.
  Adds `company_subscriptions.comped boolean` and
  `admin_invite_solo_user(p_user_id, p_comped)` (`SECURITY DEFINER`,
  `is_super_admin()`-gated, idempotent). Free → status `active`/`comped=true`
  (non-expiring); Paid → status `trialing`/`comped=false` (future billing flag).
  Neither hard-gates access yet -- both reach the app; the flag only records
  intent for when Stripe/RevenueCat exists.
- `app/api/superadmin/invite-solo/route.ts` (new) -- super-admin-gated (both a
  `super_admins` lookup and a caller-token RPC whose own `is_super_admin()` gate
  re-checks). `generateLink` (invite new / magiclink existing), captures
  `email_otp` as the sign-in code, sends a Resend email with the code + install
  steps + `${origin}/install`. Verified live (Free→active/comped, Paid→trialing).

### Dead-easy install + code sign-in (cross-device)

The launch's biggest friction point: getting a non-technical driver to install a
PWA and sign in, across iPhone/Safari, Android/Chrome, and Outlook/Gmail in-app
browsers that can neither install nor hold a link session.

- `lib/pwa/deviceInstall.ts` (new) -- pure `analyzeUserAgent(ua)` (platform /
  browser / in-app host incl. Outlook/Gmail/FB/etc.) + `recommendedInstallMethod`
  + SSR-safe `isStandalone`/`currentUAInfo` (iPadOS-as-Mac detection). 10 unit
  tests (`deviceInstall.test.ts`).
- `app/components/InstallGuide.tsx` + `app/install/page.tsx` (new) -- captures
  `beforeinstallprompt` for Android one-tap; renders the correct steps per
  method (installed / android-prompt / ios-safari / open-in-browser / manual /
  desktop).
- `app/login/page.tsx` -- added a **primary code sign-in** field
  (`verifyOtp` looping types `["email","magiclink","invite"]` +
  `provision_solo_company` + redirect `/planner`), kept magic link + "Email me a
  code" as fallbacks. **OTP is 8 digits in this project** (a Supabase project
  setting), not the usual 6 -- the input takes up to 10 chars and copy is
  length-agnostic; codes are grouped in two halves in emails.
- **Why code-first**: the code path is the only one that works inside Outlook/
  Gmail in-app browsers (can't open the installed app, can't hold a tapped
  link's session). Invite emails (solo + fleet) carry the code via Resend using
  service-role `generateLink().email_otp`; the self-serve `/login` "Email me a
  code" path depends on the Supabase **Magic Link email template including
  `{{ .Token }}`** -- a dashboard edit still owed (see Pre-launch cleanup).

### ProTankr Dash (super-admin console rebuild)

`app/superadmin/page.tsx` rebuilt to fit the screen (single column, max-width
640, flexWrap -- verified no overflow at 390/768) and renamed **"ProTankr Dash"**
in the nav. Company picker moved OUT of the nav (`NavMenu` switcher now hidden
for super admins) INTO the dashboard as a `CustomSelect` dropdown. From a
selected company: rename / Solo↔Fleet toggle, "Open Planner as this" /
"Company Admin" (`set_active_company` + hard nav), invite-to-selected-company
(fleet `/api/admin/invite`), plus a standalone **Invite Solo Driver** (Free/Paid).
Stats tiles + "coming soon" placeholders. `NavMenu.tsx`: "Super Admin" →
"ProTankr Dash".

### Fleet invite email brought to parity + super-admin invite override (2026-09-09)

- `app/api/admin/invite/route.ts` -- the fleet invite email now **leads with the
  8-digit sign-in code** (captures `email_otp` in both new-user/invite and
  existing-user/magiclink branches) + install button to `/install`, magic link
  demoted to a fallback -- matching the solo invite. Keeps the fleet-specific
  "you've been added to {company}" context.
- Same file: `verifyAdmin` now returns true for **any super admin** (checked
  against `super_admins` before the per-company role lookup), so the Dash's
  invite-to-any-company works even for a company the operator isn't a member of.
  Verified live that the sole super admin (`db7b7930…`) is currently an `admin`
  member of all three companies, so this is a correct forward-looking safeguard
  (harmless now, needed the moment a non-member company exists) -- "Open Planner
  as this company" is therefore NOT broken today.

### Native apps -- Capacitor hosted-shell foundation (2026-09-09)

ProTankr can't be statically exported (server components, `/planner` auth gate,
live API routes), so the native iOS/Android apps wrap the deployed production
site (`https://www.protankr.com`) in a native WebView via Capacitor's
`server.url`. One codebase; web changes reach the apps on next launch.

- `capacitor.config.ts` (new) -- appId `com.protankr.app`, hosted-shell
  `server.url`, https schemes. **Inert for the web deploy** (`next build` never
  reads it; `@capacitor/*` are devDependencies, not bundled -- adding them grew
  the lockfile by ~86 transitive packages but changed no existing dep version).
- npm scripts: `cap:add:ios`/`cap:add:android`/`cap:sync`/`cap:open:*`.
- `docs/NATIVE-APPS.md` (new) -- full runbook: why hosted-shell, Mac/Xcode/
  Android SDK/dev-account prerequisites, `cap add`/`sync`/`open` flow, why the
  8-digit code sign-in is already ideal for native, deep-link/universal-link
  notes, App Store 4.2 minimum-functionality mitigation via push, and the
  RevenueCat IAP phase.
- **`cap add` (generates `ios/` + `android/`) requires macOS/Android SDK and
  runs on the user's Mac** -- documented, deliberately NOT run here (this is a
  Linux container: no macOS/Xcode/Android SDK/devices/dev accounts). Everything
  headlessly verifiable was: `tsc`/`next build` clean (same route set), all unit
  tests pass.

### Live DB access this session

`.env.local` carries the real anon (208-char) + service-role (219-char) keys
(the process `env` had a `...` placeholder shadowing them -- load from
`.env.local` explicitly). Supabase REST is reachable (200) with the service key
for read-verification. There is no browser tool in this container, so
click-through verification still isn't possible from here; the demo-login +
anon-key `curl` recipe (see the Payload Utilization notes above) is the way to
exercise real RLS without one.

## Equipment modal unified across solo + fleet tiers — Phase 1 (2026-09-12)

The reworked `SoloEquipmentModal` was always meant to be THE equipment modal
for both tiers; the fleet tier had drifted onto the older `EquipmentModal`
shell (browse-fleet pool, star-primary "My Equipment", SELECT/DECOUPLE/
SLIP-SEAT rows). Converged them, per an approved plan
(`snug-petting-starlight.md`). Confirmed intent from the user: everything is
shared (grid, couple/decouple, take-over, region filter — solo may filter
too); ONLY add/remove equipment is gated to staff; take-over friction is
fleet-only; the region filter should DEFAULT to the driver's own region
("change it to see MORE, not less").

**Phase 1 shipped (no schema change) — commits `b080fdb`, `dfb9215`:**
- `EquipmentModal.tsx` reduced from a ~1,900-line fleet shell to a thin
  entry that resolves the active company + `is_solo` and ALWAYS renders
  `SoloEquipmentModal`, passing `isSolo` through. The fleet shell
  (`FleetModal`, `StarBtn`, `EquipmentDetailsModal` wrapper, the `S` style
  object, confirm/tare/fleet views) is deleted outright. Only
  `CalculatorLayoutClient.tsx` imported it (default import); `ComboRow` isn't
  imported elsewhere. The `combos`/`combosLoading`/`combosError` props are
  still accepted but unused (the shared modal self-loads by `company_id`), so
  the call site was untouched. The 2026-09-09 retheme commit (`bc2408b`) that
  restyled the now-deleted shell is thereby moot, harmless in history.
- `SoloEquipmentModal.tsx` gained an `isSolo?: boolean` prop. `canAddRemove =
  isSolo !== false || myRole ∈ {admin,dispatch,lead}` (omitted → treated as
  solo, so a single-tier caller keeps full add/remove). Gates the "+" add
  cards, the long-press-to-remove handlers, AND the onboarding auto-nudge
  into Add Truck/Trailer — a plain fleet driver gets select/couple/swap only.
- **Region-defaulted filter**: on open, the modal fetches the driver's
  `profiles.region` (the impersonated target's, under setupSession) and sets
  `filter.region` to it — but ONLY when that region actually matches some
  loaded truck/trailer, so a stale/typo region can never present an empty
  grid. Runs once per open (a ref reset on close; the parent unmounts the
  modal when closed so filter state resets anyway). Solo drivers usually have
  no region set → no-op.
- **Region capture at fleet invite** (`/api/admin/invite` + the admin
  `InviteModal` + the ProTankr Dash fleet-invite form): optional `region`,
  best-effort upserted to `profiles.region` for the resolved user. Safe for a
  brand-new invitee (profiles.display_name is nullable, so a bare
  `{user_id, region}` upsert doesn't violate NOT NULL); a failed region write
  never fails the invite. Admin modal uses a datalist of the company's
  `equipment_regions`; the Dash uses a plain text input.

Region editing for EXISTING members already exists via `DriverProfileModal`
(admin roster's per-member edit + the self-serve profile view), so "the admin
who adds them or the user themselves" is covered at every fleet touchpoint.
The literal "required field" enforcement is deliberately deferred — there is
no fleet first-run onboarding component to enforce it in (only `SoloOnboarding`
exists), and hard-requiring region would block inviting the first driver of a
brand-new fleet with no regions defined yet.

`tsc --noEmit`, `next build`, and the 70 unit tests all pass. Not
live-verified this pass (no browser tool in this container; the invite path
sends a real Resend email + creates users, so it can't be safely exercised
here) — the changes are the shared modal already proven in earlier sessions
plus a best-effort profile write on a nullable column.

**Phase 2 (approved, NOT started — its own planned, live-verified pass):**
persistent bobtail ("truck selected, no trailer") + true per-unit take-over.
This is a real schema change — `equipment_combos` can't hold a truck-only row
(truck_id/trailer_id both NOT NULL, tare per-pair). Recommended architecture
in the plan: a lightweight per-user current-truck/current-trailer selection
layer (new `user_settings` columns or a small table), leaving the tare-bearing
`equipment_combos` untouched; the planner hides compartments when bobtail and
LOAD redirects to the equipment modal; a revised take-over RPC reassigns only
the tapped unit (the other driver falls to bobtail, truck intact) instead of
the current whole-combo `couple_combo(force)` teardown; first-run trailer
step gets a Skip. Safety-relevant (tare on re-pair) and multi-user — needs a
throwaway-Postgres RPC check + two-account live verification before shipping.

## Pre-launch cleanup (before app store submission)
Running list of known rough edges that aren't urgent but shouldn't ship as-is.
Add to this as more turn up.

- ~~**The `/login` magic link is still a consuming link — burned by Outlook.**~~
  — **code side done 2026-09-06; one dashboard change left, see below.**

  **Original diagnosis, confirmed live:**
  Confirmed live 2026-09-06: signing in to a fresh address through Outlook
  produced an already-expired link on the first tap; the same flow to a Gmail
  address worked. This is the SAME consuming-link bug already fixed three times
  (`api/admin/invite`, `api/demo/start`, and the callback), in the one place
  those fixes structurally could not reach. Those three build their own link
  from `hashed_token` and send it via Resend. `/login`'s `signInWithOtp` sends
  through **Supabase's own email service and template**, which the app never
  touches — and that template ships with `{{ .ConfirmationURL }}`, i.e.
  `<project>.supabase.co/auth/v1/verify?token=...`, a GET that consumes the
  token the instant anything fetches it. Outlook's Safe Links scanner fetches
  it. Gmail does not, which is exactly why it looks intermittent.

  **The 2026-08-13 implicit-flow fix did not and could not fix this.** That
  changed what the verify endpoint *returns* (fragment vs `?code=`), solving
  the cross-device PKCE problem. Being consumed on first GET is a property of
  the URL shape, not the flow type.

  **Fix is a Supabase dashboard change, not code** — Authentication → Email
  Templates → **Magic Link**, replace the `{{ .ConfirmationURL }}` anchor with:

  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Log In</a>
  ```

  `/auth/confirm/page.tsx` already handles `type=magiclink`, consumes it only
  via an explicit client-side `verifyOtp()` (a scanner's GET does nothing),
  calls `provision_solo_company` so a brand-new signup still lands correctly,
  and redirects to `/planner`. Same shape the invite and demo routes already
  produce in code. **Apply the same edit to the Confirm signup and Change email
  templates** — identical default, identical exposure.

  **Resolution (2026-09-06).** Audited every Supabase-sent email this app can
  actually trigger, rather than fixing only the one that was reported:
  `signInWithOtp` in `app/login/page.tsx` is the **only** call in the codebase
  that makes Supabase send an email at all. Every other flow goes through
  `admin.auth.admin.generateLink`, which never sends anything — the app builds
  its own `token_hash` link and delivers it via Resend, so the invite and demo
  routes were never exposed.

  Code side: `app/auth/confirm/page.tsx` gained `"email_change"` to its
  accepted type union — what Supabase's Change Email Address template actually
  sends. (`"email"` was already there and is also valid in the installed SDK;
  both are kept.)

  **That commit had zero runtime effect, and an earlier version of this note
  claiming otherwise was wrong** — worth recording, because the same mistake is
  easy to repeat. The union lives inside an `as` cast, and TypeScript types are
  erased at compile time: `verifyOtp` is handed whatever string the URL carries
  regardless of what the union lists, so production already handled
  `type=email_change` correctly before the change. It was a type-level accuracy
  fix, not a behavior fix, and **no deploy was needed before the template edits
  below could be tested.** Proven, not reasoned: grepping the deployed
  `/auth/confirm` JS chunk finds the control string `No token found in this
  link` but never `email_change` — in any version — because that literal only
  ever existed as a type annotation.

  A second, real gap the type change surfaced (fixed separately): the error
  screen's only way forward was "Ask your administrator to send a new invite."
  Correct when invites were all that landed here; a dead end once magic-link and
  signup failures route to the same page, and wrong for a solo user with no
  administrator. It now branches on the link type — sign-in kinds get a real
  "Request a new link" button to `/login`, `email_change` points at Settings,
  invites keep the original wording.

  **Still requires a Supabase dashboard change — it cannot be done from code.**
  In Authentication → Email Templates, replace `{{ .ConfirmationURL }}` in the
  link's `href` with `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<T>`,
  where `<T>` is `magiclink` for **Magic Link**, `signup` for **Confirm signup**,
  and `email_change` for **Change Email Address**. Leave the rest of each
  template alone.

  All three, not just Magic Link: `signInWithOtp` against an address that
  doesn't exist yet creates the user, and which of Magic Link / Confirm signup
  fires in that case is a Supabase implementation detail not worth reasoning
  about — fixing both removes the question. Change Email is latent today (the
  app never calls `updateUser({email})`) but has the identical default.

  **Reset Password deliberately left alone**: this app has no password auth at
  all, and pointing a recovery link at `/auth/confirm` would verify the token
  and drop the user on `/planner` with no way to set a password. If password
  auth is ever added it needs its own landing screen, not this one.

  Bypassing `/auth/callback` costs nothing: `/auth/confirm` calls
  `provision_solo_company` in both of its branches, exactly as the callback
  does, so a brand-new signup still gets its company.

- **Vercel Preview environment is missing `SUPABASE_SERVICE_ROLE_KEY`.**
  Found 2026-08-31 when pushing `perf/memoize-shell-context` triggered
  this project's first-ever Preview deployment (every prior deployment in
  `vercel ls` history is Production -- pushes apparently always went
  straight to `main` before). The build failed at page-data collection:
  `Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` in
  `/api/admin/setup/route.ts`. Confirmed via `vercel env ls`:
  `SUPABASE_SERVICE_ROLE_KEY` is configured for Production only, never
  Preview (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` ARE
  set for both). Unrelated to whatever branch triggers it -- any Preview
  build of this repo, on any branch, would hit the same failure. Fix is a
  one-line `vercel env add SUPABASE_SERVICE_ROLE_KEY preview` (same value
  Production already has) -- deliberately not done automatically, since it
  means typing a real service-role secret into Vercel. Explicitly
  deprioritized by the user for now (not using Preview URLs for QA
  currently) -- local `next build`/`tsc --noEmit` are unaffected (both
  read the same key from `.env.local`) and remain the real gate for
  merging branches.

- ~~**Orphaned "planned" `load_log` rows never get cleaned up.**~~ —
  **prevention shipped 2026-08-13**, backlog cleanup written but not yet
  applied. Option (b) from the original writeup: `useLoadWorkflow.ts`'s
  `beginLoadToSupabase` now deletes any existing `status='planned'` row for
  the same `combo_id`+`user_id` (via the same `deleteLoad`/`delete_load`
  RPC the explicit Cancel path already used) *before* calling `begin_load`,
  so a combo can never accumulate more than one abandoned planned row going
  forward, regardless of why the previous attempt was abandoned (background/
  close, not just an explicit Cancel tap). Live-verified: inserted a
  synthetic stale planned row for a real combo directly in the DB, tapped
  LOAD in the app, confirmed via a direct query that the synthetic row was
  gone and exactly one new planned row existed. Live count check the same
  day found only 3 real backlog rows total (not "dozens" — the DB has
  apparently been reseeded/reset since the original July note), all
  identically timestamped (a seed-data artifact, not real accumulated
  abandonment). `supabase/migrations/20260817000000_cleanup_orphaned_planned_loads.sql`
  (written, cascade-delete-safe per `load_lines_load_id_fkey ... ON DELETE
  CASCADE`, **not yet applied** — a bulk production DELETE, even of 3
  known-blank rows, needs the user's own go-ahead, not something to run
  unilaterally) clears anything still `planned` after 24 hours.

- ~~**Abandoned solo companies accumulate with no cleanup.**~~ — **checked
  2026-08-13, currently a non-issue.** Live query (every `companies` row
  with `is_solo = true`, cross-referenced against every
  `user_settings.active_company_id`) found only 3 solo companies total in
  the live DB, and **zero** currently abandoned — every one still has at
  least one user actively pointing at it. The underlying gap described
  below is still real and unfixed (the solo→fleet join flow still doesn't
  clean up the old company), but building a flagging/archive mechanism for
  a problem with zero live instances would be pure speculative
  infrastructure — re-run this same check periodically as the user base
  grows, and only build cleanup once there's an actual backlog to clean.
  Original description, still accurate as an explanation of the gap: the
  solo→fleet join flow (`app/planner/components/JoinFleetView.tsx`, shipped
  2026-08-06) deliberately **abandons** a user's solo company entirely when
  they redeem a fleet invite code — no equipment migration, no deletion of
  the old `companies`/`user_companies` rows, per explicit product decision
  (see "Fleet Tier — Build Spec" → solo→fleet join flow).

## Files safe to delete
- `supabase/migrations_old/` — superseded, confirmed not referenced.
- `node_modules/` should never be zipped/committed — regenerate via `npm install`.
- Dead `complete_load(p_load_id, p_completed_at, p_lines, p_product_updates)`
  4-arg overload (see above) — confirm once more before dropping, but client
  only calls the single-arg version.
