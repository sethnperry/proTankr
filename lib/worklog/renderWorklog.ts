// lib/worklog/renderWorklog.ts
//
// The work log as one document that serves the email, the in-app view and print/PDF: fluid so it
// reads on a phone, letter-sized margins and page breaks for print. Plain black on white.

import { shortDate, weekday } from "./time.ts";
import type { Worklog } from "./buildWorklog.ts";
import { DROP_SUBTITLE, KINDS, dropTitle, summaryLists } from "./summaryLists.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const hr = (n: number) => n.toFixed(1);
const money = (n: number) => `$${n.toFixed(2)}`;
const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function worklogRange(w: Pick<Worklog, "range">): string {
  return `${shortDate(w.range.start)} to ${shortDate(w.range.end)}`;
}
export function worklogSubject(w: Pick<Worklog, "range" | "title">): string {
  return KINDS.includes(w.title) ? `${w.title}, DROP Report` : "DROP Report";
}

const CSS = `
.wl{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;max-width:7.3in;margin:0 auto;padding:18px 16px;line-height:1.35;-webkit-text-size-adjust:100%}
.wl *{box-sizing:border-box}
.wl h1{font-size:20px;letter-spacing:.5px;margin:0;text-transform:uppercase}
.wl .top{border-bottom:3px solid #0f766e;padding-bottom:8px}
.wl .sub{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#0f766e;margin-top:2px}
.wl .who{font-size:14px;margin:8px 0 0}
.wl h2{font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #111}
.wl h2:first-of-type{margin-top:16px}
.wl .sum{display:grid;grid-template-columns:1fr;gap:0 34px}
@media(min-width:620px){.wl .sum{grid-template-columns:1fr 1fr}}
.wl .sl h3{font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#0f766e;margin:10px 0 3px}
.wl .li{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:4px 0;border-bottom:1px solid #e3e3e3;font-size:13px}
.wl .li .k small{color:#6b6b6b;font-size:11px;margin-left:6px}
.wl .li .v{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.wl .li .v.good{color:#15803d}.wl .li .v.warn{color:#b45309}
.wl .foot{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;padding-top:12px;border-top:3px solid #0f766e;font-size:11px;color:#555;letter-spacing:.6px}
.wl table{width:100%;border-collapse:collapse}
.wl th{font-size:10px;letter-spacing:.6px;text-transform:uppercase;text-align:left;padding:5px 6px;border-bottom:2px solid #111}
.wl td{font-size:13px;padding:5px 6px;border-bottom:1px solid #dcdcdc;font-variant-numeric:tabular-nums}
.wl .r{text-align:right}
.wl .day{break-inside:avoid;page-break-inside:avoid;margin:0 0 10px}
.wl .dh{background:#f0f0f0;padding:6px 8px;font-size:13px;border-top:1px solid #bdbdbd;border-left:3px solid #0f766e}
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

function list(l: { title: string; rows: { k: string; v: string; sub?: string; tone?: string }[] }): string {
  return `<div class="sl"><h3>${esc(l.title)}</h3>${l.rows.map((r) => `<div class="li"><span class="k">${esc(r.k)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span><span class="v${r.tone ? ` ${r.tone}` : ""}">${esc(r.v)}</span></div>`).join("")}</div>`;
}

export function renderWorklogBody(w: Worklog, o: { mode?: "full" | "condensed" } = {}): string {
  const s = w.summary;
  const mode = o.mode ?? "full";
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
      const head = `<div class="dh"><b>${esc(weekday(d.date))} ${esc(shortDate(d.date))}</b> &nbsp;${d.from ? `${esc(d.from)} to ${esc(d.to)} ` : ""}&nbsp;<span class="m">${d.nonRev != null ? `${hr(d.worked)} Hr on duty (trip ${hr(d.hours)}, non-rev ${hr(d.nonRev)}${d.tripOverDuty >= 0.1 ? `; trip ${hr(d.tripOverDuty)} more than the log shows on duty` : ""})` : `${hr(d.hours)} Hr`} · ${num(d.miles)} Mi${d.loads ? ` · ${d.loads} load${d.loads === 1 ? "" : "s"} · ${num(d.gross)} Ggal · ${num(d.net)} Ngal` : ""}</span></div>`;
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
<div class="top"><h1>${esc(dropTitle(w.title))}</h1><div class="sub">${DROP_SUBTITLE}</div></div>
<div class="who"><b>${esc(w.driverName)}</b> &nbsp;<span style="color:#555">${esc(worklogRange(w))}</span></div>
<h2>Summary</h2><div class="sum">${summaryLists(w).map(list).join("")}</div>
<h2>By product</h2>${byProduct}
${log}${buys}
<div class="note">Hours are the time from Begin Trip to the last stop, split at midnight in your time zone. Loads and gallons count on the day the load was picked up; a trip that crosses midnight shows on both days with its time and miles split. Gross and net gallons are as recorded in ProTankr. Compare this to your pay stub or settlement; it is a record of your work, not a pay statement.</div>
<div class="foot"><img src="https://protankr.com/icons/icon-email-black.png" width="22" height="22" alt="ProTankr" style="display:block"><span>PROTANKR</span></div>
</div>`;
}

