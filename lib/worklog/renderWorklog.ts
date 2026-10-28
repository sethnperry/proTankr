// lib/worklog/renderWorklog.ts
//
// The work log as one document that serves the email, the in-app view and print/PDF: fluid so it
// reads on a phone, letter-sized margins and page breaks for print. Plain black on white.

import { shortDate, weekday } from "./time.ts";
import type { Worklog } from "./buildWorklog.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const hr = (n: number) => n.toFixed(1);
const money = (n: number) => `$${n.toFixed(2)}`;
const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function worklogRange(w: Pick<Worklog, "range">): string {
  return `${shortDate(w.range.start)} to ${shortDate(w.range.end)}`;
}
export function worklogSubject(w: Pick<Worklog, "range" | "title">): string {
  return `ProTankr - ${w.title} Worklog Report (${worklogRange(w)})`;
}

const CSS = `
.wl{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;max-width:7.3in;margin:0 auto;padding:18px 16px;line-height:1.35;-webkit-text-size-adjust:100%}
.wl *{box-sizing:border-box}
.wl h1{font-size:20px;letter-spacing:.5px;margin:0;text-transform:uppercase}
.wl .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;border-bottom:3px solid #111;padding-bottom:8px}
.wl .brand{font-size:12px;color:#555;flex-shrink:0}
.wl .who{font-size:14px;margin:8px 0 0}
.wl h2{font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #111}
.wl .cells{display:flex;flex-wrap:wrap;border:1px solid #cfcfcf;margin-bottom:-1px}
.wl .cell{flex:1 1 30%;min-width:96px;padding:8px 10px;border-right:1px solid #e1e1e1;border-bottom:1px solid #cfcfcf}
.wl .cell .k{font-size:10px;letter-spacing:.7px;text-transform:uppercase;color:#555}
.wl .cell .v{font-size:18px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
.wl .cell .s{font-size:11px;color:#555;margin-top:1px}
.wl table{width:100%;border-collapse:collapse}
.wl th{font-size:10px;letter-spacing:.6px;text-transform:uppercase;text-align:left;padding:5px 6px;border-bottom:2px solid #111}
.wl td{font-size:13px;padding:5px 6px;border-bottom:1px solid #dcdcdc;font-variant-numeric:tabular-nums}
.wl .r{text-align:right}
.wl .day{break-inside:avoid;page-break-inside:avoid;margin:0 0 10px}
.wl .dh{background:#f0f0f0;padding:6px 8px;font-size:13px;border-top:1px solid #bdbdbd}
.wl .dh b{font-size:14px}
.wl .dh .m{color:#222}
.wl .row{padding:5px 8px;border-bottom:1px solid #e4e4e4;font-size:12.5px}
.wl .row .o{font-weight:700}
.wl .row .p{color:#444;margin-top:1px;font-variant-numeric:tabular-nums}
.wl .row.cont .o{font-style:italic}
.wl .mid{border-top:2px dashed #777;margin:6px 0 8px;text-align:center;font-size:10px;letter-spacing:.8px;color:#555;line-height:0}
.wl .mid span{background:#fff;padding:0 8px;position:relative;top:-1px}
.wl .note{font-size:11px;color:#555;margin-top:20px;border-top:1px solid #d5d5d5;padding-top:8px}
@page{size:Letter;margin:0.6in}
@media print{.wl{max-width:none;padding:0}.wl .noprint{display:none!important}.wl h2{break-after:avoid}}
`;

function cell(k: string, v: string, s?: string): string {
  return `<div class="cell"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${s ? `<div class="s">${esc(s)}</div>` : ""}</div>`;
}

export function renderWorklogBody(w: Worklog, o: { mode?: "full" | "condensed" } = {}): string {
  const s = w.summary;
  const mode = o.mode ?? "full";
  const m = s.miles;
  const hasDuty = s.nonRev != null;
  const cells = [
    cell("Period", worklogRange(w), `${s.daysWorked} day${s.daysWorked === 1 ? "" : "s"} worked`),
    cell("Hours worked", hr(s.worked), hasDuty ? `on duty; trip ${hr(s.tripHours)}, non-rev ${hr(s.nonRev ?? 0)}` : undefined),
    cell("Loads", String(s.loads)),
    cell("Regular hours", hr(s.regular)),
    cell("Overtime hours", hr(s.overtime + s.double), s.double > 0 ? `incl. ${hr(s.double)} double time` : undefined),
    cell("Non-rev hours", s.nonRev == null ? "–" : hr(s.nonRev), s.nonRev == null ? "needs electronic log" : "on duty, not on a trip"),
    cell("Gross gallons", num(s.gross)),
    cell("Net gallons", num(s.net)),
    cell("Paid by you", money(s.spend), "card or cash"),
  ].join("");
  const miles = [
    cell("Loaded miles", m.loaded == null ? "–" : num(m.loaded), m.partial ? "tracked trips only" : undefined),
    cell("Empty miles", m.empty == null ? "–" : num(m.empty)),
    cell("Total miles", num(m.total)),
  ].join("");
  const byProduct = s.byProduct.length
    ? `<table><tr><th>Product</th><th class="r">Gross gal</th><th class="r">Net gal</th></tr>${s.byProduct.map((p) => `<tr><td>${esc(p.name)} <span style="color:#666">(${esc(p.code)})</span></td><td class="r">${num(p.gross)}</td><td class="r">${num(p.net)}</td></tr>`).join("")}</table>`
    : `<p style="font-size:13px;color:#555;margin:6px 0 0">No loads in this period.</p>`;

  let log = "";
  if (mode === "condensed") {
    log = `<h2>By month</h2><table><tr><th>Month</th><th class="r">Days</th><th class="r">Hours</th><th class="r">Loads</th><th class="r">Gross gal</th><th class="r">Net gal</th><th class="r">Miles</th></tr>${w.months.map((x) => `<tr><td>${esc(monthName(x.month))}</td><td class="r">${x.days}</td><td class="r">${hr(x.hours)}</td><td class="r">${x.loads}</td><td class="r">${num(x.gross)}</td><td class="r">${num(x.net)}</td><td class="r">${num(x.miles)}</td></tr>`).join("")}</table>`;
  } else {
    const blocks = w.days.map((d, idx) => {
      const prev = w.days[idx - 1];
      const dash = prev && prev.midnightAfter && prev.date < d.date ? `<div class="mid"><span>MIDNIGHT</span></div>` : "";
      const head = `<div class="dh"><b>${esc(weekday(d.date))} ${esc(shortDate(d.date))}</b> &nbsp;${d.from ? `${esc(d.from)} to ${esc(d.to)} ` : ""}&nbsp;<span class="m">${d.nonRev != null ? `${hr(d.worked)} Hr on duty (trip ${hr(d.hours)}, non-rev ${hr(d.nonRev)})` : `${hr(d.hours)} Hr`} · ${num(d.miles)} Mi${d.loads ? ` · ${d.loads} load${d.loads === 1 ? "" : "s"} · ${num(d.gross)} Ggal · ${num(d.net)} Ngal` : ""}</span></div>`;
      const rows = d.rows.map((r) => {
        const ord = r.orders.length ? esc(r.orders.join(", ")) : "Trip";
        const time = r.continued || r.continues ? ` <span style="font-weight:400">(${esc(r.timeFrom)} to ${esc(r.timeTo)}${r.continues ? ", continues" : ""})</span>` : "";
        return `<div class="row${r.continued ? " cont" : ""}"><span class="o">${ord}</span>${time} · ${esc(r.route)}<div class="p">${esc(r.products)} · ${hr(r.hours)} Hr · ${num(r.miles)} Mi${r.gross != null ? ` · ${num(r.gross)} Ggal · ${num(r.net ?? 0)} Ngal` : ""}</div></div>`;
      }).join("");
      return `${dash}<div class="day">${head}${rows}</div>`;
    }).join("");
    log = `<h2>Work log</h2>${blocks || `<p style="font-size:13px;color:#555">No work recorded in this period.</p>`}`;
  }

  const buys = w.purchases.length
    ? `<h2>Purchases you paid for</h2><table><tr><th>When</th><th>Where</th><th>Paid with</th><th class="r">Gallons</th><th class="r">Amount</th></tr>${w.purchases.map((p) => `<tr><td>${esc(new Date(p.at).toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: w.tz }))}</td><td>${esc(p.store)}${p.place ? ` · ${esc(p.place)}` : ""}</td><td>${p.kind === "cash" ? "Cash" : "My card"}</td><td class="r">${p.gallons != null ? num(p.gallons) : "–"}</td><td class="r">${p.amount != null ? money(p.amount) : "–"}</td></tr>`).join("")}<tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>${money(s.spend)}</b></td></tr></table>`
    : "";

  return `<style>${CSS}</style><div class="wl">
<div class="top"><h1>${esc(w.title)} Work Log</h1><div class="brand"><img src="https://protankr.com/icons/icon-email-black.png" width="26" height="26" alt="ProTankr" style="display:block;margin-left:auto"></div></div>
<div class="who">${esc(w.driverName)}</div>
<h2>Summary</h2><div class="cells">${cells}</div><div class="cells">${miles}</div>
<h2>By product</h2>${byProduct}
${log}${buys}
<div class="note">Hours are the time from Begin Trip to the last stop, split at midnight in your time zone. Loads and gallons count on the day the load was picked up; a trip that crosses midnight shows on both days with its time and miles split. Gross and net gallons are as recorded in ProTankr. Compare this to your pay stub or settlement; it is a record of your work, not a pay statement.</div>
</div>`;
}

