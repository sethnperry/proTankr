# ELD notes (if we ever build our own)

Running list, add to it from any session. Nothing here is built. Newest ideas at the bottom of each section.
Rules are from memory of the FMCSA property-carrying rules, not legal advice; verify before building.

## How to add a note
Append a bullet under the right heading with the date and where it came from (driver, dispatcher, session). Keep each one short and say whether it is a rule, a Geotab behavior, or a product idea.

## Rules the clocks have to get right
- 11-hour driving limit after 10 consecutive hours off duty.
- 14-hour window opens at the first on-duty time after the 10 hours off and runs on the wall clock. Breaks do not pause it, except in a valid split.
- 30-minute break after 8 cumulative hours of driving. On duty not driving, off duty and sleeper all satisfy it.
- Sleeper split: one period of at least 7 (or 8) consecutive hours **in the sleeper berth**, the other at least 3 (or 2) hours off duty or in the sleeper, totalling at least 10. Neither period counts against the 14-hour window. A split only counts once both parts are done. Off duty at home is NOT sleeper berth, so a day cab can't use it for the long part.
- Adverse driving conditions: up to 2 extra hours of driving and window.
- 60/70-hour cycle over 7/8 days, 34-hour restart.
- Short-haul exception (150 air miles, back at the work location and off duty within 14 hours): no 30-minute break required. 11-hour and 14-hour limits still apply. Day-cab drivers use it a lot.
- Personal conveyance, yard moves and exempt-driver rules are separate special cases.

## Things Geotab does that we'd have to match or beat
- The break alert fires on driving time regardless of distance. The short-haul exemption is a per-driver setting an admin turns on in MyGeotab, not a button in the Drive app. Exact menu path unconfirmed (see the ruleset matrix and release notes on support.geotab.com).
- Clocks come from DutyStatusAvailability (driving, duty, cycle). The fields `rest` and `recap` were never confirmed against real data.
- Geotab Drive Cycle Recap shows per-day on-duty hours, today, total, and "cycle available tomorrow".
- API limits: 10 calls/minute per user. We cache per company.

## What our current app approximates (not an ELD)
- Break In and per-day recap are calculated from DutyStatusLog (`lib/telematics/cycleRecap.ts`). Workday Left falls back to a log calculation that ignores sleeper splits, so after a split it reads low.

## Product ideas
- Show the driver the legal choice, not just the clock: "If you stop 2 hours now you can still make home" with the 11/14/break clocks all considered.
- Warn before a stop would make the rest of the trip illegal (we already compare clocks to remaining drive time).
- Per-driver exemption flags (short haul, non-CDL) that change which alerts fire.
- Split-sleeper tracker that shows which half is done and what it unlocks.
- Day-cab mode: assume off duty at home never counts as a sleeper split.
- Auto-detect duty status from truck movement and the trip workflow (arrive, loading, drive, drop) so nobody edits logs by hand.
- Roadside inspection export (the FMCSA data transfer file) and a plain on-screen view for the officer.
- Unassigned driving review, edits with required annotations, and a clear audit trail.
- Certification and malfunction handling.
