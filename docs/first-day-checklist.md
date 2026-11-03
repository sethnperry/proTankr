# First day on a real device

Nothing below has been tapped through on a phone yet. Work top to bottom: set up once, then drive a normal day and
watch for the things that were only tested against sample data. Use your own account and a test rule or two first.

## 0. Set up (10 minutes, on a computer)

Company Dashboard, as admin.
- [ ] **Setup → Call-out routing:** add the dispatch and manager emails (call-out emails have nowhere to go without them).
- [ ] **Setup → Trip Settings:** set the repair approver email, and look at the shift length, gauging time and "Begin Trip requires shipper and customer".
- [ ] **Records → Spotted Lanternfly → Zone:** paste Pennsylvania's current county list from the Department of Agriculture. (Reported at 56 counties, not verified. Nothing is asked of drivers until this is filled in.)
- [ ] **Accounts:** make one test rule that matches a customer name you'll use today, pointed at your own email.
- [ ] **Setup → Fuel:** check the payment methods, steps and receipt rules.
- [ ] Resend: confirm SPF, DKIM and DMARC are set for protankr.com, or the first emails land in spam.

## 1. Open the app (2 minutes)

- [ ] Fully close and reopen the installed app so it picks up the newest version.
- [ ] Driver Dashboard loads. Tools panel shows Freight, Tank check (company trucks), Lanternfly, Safety meeting, Terminal work, Call out, Per diem, Inspect, Truck down, Document, Down time, Paper log.
- [ ] Equipment shows your truck and trailer. Fuel, Track and Trips open.

## 2. A normal load (the money path)

- [ ] Begin Trip asks for shipper and customer (it should not let you start without both). Order number opens the number pad.
- [ ] Arrive at the terminal, Begin Loading, Plan Review, Finish Loading. Enter a BOL gross a little over the cap: it should warn once, and the second Next logs it.
- [ ] Load report shows BOL, supplier, net gallons and times.
- [ ] Arrive at the store. Finish Delivery: tank map, readings, **Meter ticket photo**, consignee and driver signatures, times. Complete.
- [ ] Open the PTD from Trips. Check the numbers, times and signatures.
- [ ] Turn on airplane mode for one step (a reading or a signature), finish it, then turn it back on. The Sync card should clear and nothing should be lost.

## 3. Emails (watch your inbox)

- [ ] **Account rule:** within about 5 minutes of completing the trip, the load summary PDF arrives at your test address. Check Accounts → Recent sends shows Sent.
- [ ] **Call out** (Call out tool, for a future date). Dispatch and manager emails arrive. Withdraw it: the correction email arrives.
- [ ] **Truck down** with a repair request: one email arrives from servicerequest+<region>@protankr.com. Tap Approve on a phone, then open the same link again. The second tap must not change the decision.
- [ ] Freight recap (Company Dashboard → Freight → Email me a recap): the next scheduled run arrives with real lines.

## 4. Forms (one tap each, look for anything that errors)

- [ ] **Fuel:** start a stop, pick a method, Finish Fueling. Add a receipt photo on a card or cash stop.
- [ ] **Scale ticket** and **Paper log** (photo plus reason chips).
- [ ] **Safety meeting:** from the admin side start one, sign in on the phone with a finger. Then check the work log email counts the time as on duty.
- [ ] **Terminal work:** start the timer, stop it, confirm it appears in the admin list.
- [ ] **Per diem, Inspect, Document, Down time:** one each.
- [ ] **Freight:** begin a load, mark it delivered, confirm the truck shows as empty. Try an LTS route with a manifest photo and signature.
- [ ] **Tank check:** pick a store, enter a reading in gallons, then one in inches.
- [ ] **Lanternfly:** after you arrive at a stop in a zone county, the tile should show "to attest". Attest it.

## 5. The manager side (Company Dashboard)

- [ ] **Now:** gauges, fleet strip and the day ribbon show today's real activity. Compare the Down count with trucks you know are in Deadline.
- [ ] **Period:** pick a range. The compliance heatmap and campaign bars make sense.
- [ ] **Region button:** filtering changes the gauges and lists.
- [ ] **Desk:** open it. Look for anything red. Try Use app as on a driver and return.
- [ ] Records and Setup open every report you rely on.

## 6. Look for these specifically

- Anything that takes more than a few seconds to open.
- A sheet that closes by itself or won't close.
- Times that are an hour off (time zone) on emails or the PTD.
- A number on the dashboard that disagrees with the driver's own screen.
- Any "Couldn't save" or an item stuck under Sync.

When something breaks, note what you tapped, what you expected and what happened, and the time. The Desk usually already has the error.
