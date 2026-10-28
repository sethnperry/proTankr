// lib/recap/renderRecapEmail.ts
//
// The recap as an email laid out like a printable document (letter width, plain black on white,
// tables), plus the one-line note sent before a pay period is set. Pure string building.

import type { Recap } from "./buildRecap.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hm = (min: number | null) => (min == null ? "–" : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`);
const money = (n: number | null) => (n == null ? "–" : `$${n.toFixed(2)}`);
const num = (n: number) => n.toLocaleString("en-US");
const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" });
const periodLabel = (p: { start: string; end: string }) => `${dateLabel(p.start)} to ${dateLabel(p.end)}`;
const time = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }) : "–");

const TD = "padding:6px 8px;border-bottom:1px solid #d9d9d9;font-size:13px;color:#111;";
const TH = "padding:6px 8px;border-bottom:2px solid #111;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#111;text-align:left;";
const H2 = "font-size:13px;letter-spacing:1px;text-transform:uppercase;margin:26px 0 8px;color:#111;border-bottom:2px solid #111;padding-bottom:4px;";
const FONT = "font-family:Arial,Helvetica,sans-serif;";

export function recapSubject(r: Recap): string {
  return `Your pay period recap, ${periodLabel(r.period)}`;
}

export function renderRecapHtml(r: Recap): string {
  const t = r.totals;
  const summary = [
    ["Pay period", periodLabel(r.period)],
    ["Driving", r.hasHours ? hm(t.driveMin) : "needs telematics"],
    ["On duty (total)", r.hasHours ? hm(t.onDutyMin) : "needs telematics"],
    ["Miles", num(t.miles)],
    ["Trips / orders", `${t.trips} / ${t.orders}`],
    ["Gallons delivered", num(t.gallons)],
    ["Paid by you (card or cash)", money(t.spend)],
  ];
  const dayRows = r.days.map((d) => `<tr><td style="${TD}">${esc(dateLabel(d.date))}</td><td style="${TD}text-align:right">${hm(d.driveMin)}</td><td style="${TD}text-align:right">${hm(d.onDutyMin)}</td><td style="${TD}text-align:right">${d.miles ? num(d.miles) : "–"}</td><td style="${TD}text-align:right">${d.trips || "–"}</td><td style="${TD}text-align:right">${d.spend ? money(d.spend) : "–"}</td></tr>`).join("");
  const tripBlocks = r.trips.map((trip) => {
    const stops = trip.stops.map((s) => `<tr><td style="${TD}width:70px">${s.kind === "pickup" ? "Pickup" : "Delivery"}</td><td style="${TD}">${esc(s.name)}${s.note ? ` <span style="color:#666">(${esc(s.note)})</span>` : ""}</td><td style="${TD}">${esc(time(s.arrivedAt, r.tz))}</td><td style="${TD}">${esc(time(s.leftAt, r.tz))}</td></tr>`).join("");
    const miles = trip.beginMiles != null && trip.endMiles != null ? `${num(Math.round(trip.beginMiles))} to ${num(Math.round(trip.endMiles))}` : "–";
    return `<div style="margin:0 0 16px;page-break-inside:avoid"><div style="font-size:13px;font-weight:700;color:#111;margin-bottom:4px">${trip.orders.length ? `Order ${esc(trip.orders.join(", "))}` : "Trip"} <span style="font-weight:400;color:#555">· started ${esc(time(trip.startedAt, r.tz))}${trip.completedAt ? `, finished ${esc(time(trip.completedAt, r.tz))}` : ""} · odometer ${miles}${trip.gallons ? ` · ${num(Math.round(trip.gallons))} gal` : ""}</span></div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><th style="${TH}">Stop</th><th style="${TH}">Where</th><th style="${TH}">Arrived</th><th style="${TH}">Left</th></tr>${stops}</table></div>`;
  }).join("") || `<p style="font-size:13px;color:#555">No trips recorded in this period.</p>`;
  const buys = r.purchases.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><th style="${TH}">When</th><th style="${TH}">Where</th><th style="${TH}">Paid with</th><th style="${TH}text-align:right">Gallons</th><th style="${TH}text-align:right">Amount</th></tr>${r.purchases.map((p) => `<tr><td style="${TD}">${esc(time(p.at, r.tz))}</td><td style="${TD}">${esc(p.store)}${p.place ? ` · ${esc(p.place)}` : ""}</td><td style="${TD}">${p.kind === "cash" ? "Cash" : "My card"}</td><td style="${TD}text-align:right">${p.gallons != null ? num(Math.round(p.gallons)) : "–"}</td><td style="${TD}text-align:right">${money(p.amount)}</td></tr>`).join("")}<tr><td colspan="4" style="${TD}text-align:right;font-weight:700">Total</td><td style="${TD}text-align:right;font-weight:700">${money(t.spend)}</td></tr></table>`
    : `<p style="font-size:13px;color:#555">No purchases on your own card or cash in this period.</p>`;
  return `<!doctype html><html><body style="margin:0;background:#f2f2f2;${FONT}"><div style="max-width:8.5in;margin:0 auto;background:#fff;padding:0.6in 0.6in;color:#111">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-bottom:3px solid #111"><tr><td style="font-size:20px;font-weight:700;letter-spacing:.5px;padding-bottom:8px;color:#111">PAY PERIOD RECAP</td><td style="font-size:12px;color:#555;text-align:right;padding-bottom:8px">ProTankr</td></tr></table>
<div style="font-size:14px;margin:10px 0 0">${esc(r.driverName)}</div>
<div style="${H2}">Summary</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${summary.map(([k, v]) => `<tr><td style="${TD}width:55%;color:#444">${esc(k)}</td><td style="${TD}text-align:right;font-weight:700">${esc(v)}</td></tr>`).join("")}</table>
<div style="${H2}">By day</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><th style="${TH}">Day</th><th style="${TH}text-align:right">Driving</th><th style="${TH}text-align:right">On duty</th><th style="${TH}text-align:right">Miles</th><th style="${TH}text-align:right">Trips</th><th style="${TH}text-align:right">Paid by you</th></tr>${dayRows}<tr><td style="${TD}font-weight:700">Total</td><td style="${TD}text-align:right;font-weight:700">${hm(t.driveMin)}</td><td style="${TD}text-align:right;font-weight:700">${hm(t.onDutyMin)}</td><td style="${TD}text-align:right;font-weight:700">${num(t.miles)}</td><td style="${TD}text-align:right;font-weight:700">${t.trips}</td><td style="${TD}text-align:right;font-weight:700">${money(t.spend)}</td></tr></table>
<div style="${H2}">Trip details</div>${tripBlocks}
<div style="${H2}">Purchases you paid for (card or cash)</div>${buys}
<p style="font-size:11px;color:#666;margin:26px 0 0;border-top:1px solid #d9d9d9;padding-top:10px">Hours come from your electronic log, split at midnight in your time zone. Stop times and miles come from what was recorded in ProTankr. This is a record to compare against your settlement; it is not a pay statement.</p>
</div></body></html>`;
}

export function renderPayPeriodNudgeHtml(name: string, appUrl: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f2f2f2;${FONT}"><div style="max-width:8.5in;margin:0 auto;background:#fff;padding:0.6in;color:#111">
<div style="font-size:20px;font-weight:700;letter-spacing:.5px;border-bottom:3px solid #111;padding-bottom:8px">PAY PERIOD RECAP</div>
<p style="font-size:15px;margin:18px 0 8px">Hi ${esc(name || "driver")},</p>
<p style="font-size:15px;margin:0 0 8px">You just finished a 34-hour reset. Visit your profile in the app to set your pay period.</p>
<p style="font-size:14px;color:#444;margin:0 0 18px">After that, a recap of each pay period (hours, miles, trips and what you paid for yourself) will arrive after your reset, so you have a record to check your settlement against.</p>
<p style="margin:0"><a href="${esc(appUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;font-size:14px;font-weight:700">Open ProTankr</a></p>
</div></body></html>`;
}
