"use client";
// app/planner/trips/PtdDocument.tsx
//
// The Product Transfer Document (docs/trip-workflow-design.md §13), rendered
// as a white page: on screen inside a card, and on paper through PrintPortal.
// Data comes from lib/trips/ptd.ts (buildPtd). BlankPtd is the same layout
// with empty boxes, for a driver with a dead phone.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { code39Bars } from "@/lib/trips/code39";
import { fmtMinutes } from "@/lib/trips/billingTime";
import type { Ptd } from "@/lib/trips/ptd";
import { SignatureView } from "../components/trip/tripUi";

const ink = "#111";
const faint = "#666";
const line = "1px solid #999";

const page: React.CSSProperties = {
  background: "#fff", color: ink, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 11,
  padding: 18, borderRadius: 6, maxWidth: 820, margin: "0 auto", lineHeight: 1.35,
};
const h2: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 4px" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { border: line, padding: "3px 5px", textAlign: "left", fontSize: 10, background: "#eee", fontWeight: 700 };
const td: React.CSSProperties = { border: line, padding: "3px 5px", verticalAlign: "top" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

const gal = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("en-US"));
const dec = (n: number | null | undefined, d = 1) => (n == null ? "" : n.toFixed(d));
// Tank monitor gallons, or inches when the tank was stuck.
const reading = (n: number | null | undefined, unit: string) => (n == null ? "" : unit === "inches" ? `${dec(n, 2)} in` : gal(n));

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export function Barcode({ text, height = 44 }: { text: string; height?: number }) {
  const { bars, width } = code39Bars(text);
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox={`0 0 ${width + 20} ${height}`} style={{ width: "100%", maxWidth: 520, height, display: "block", margin: "0 auto" }} preserveAspectRatio="none">
        <rect x={0} y={0} width={width + 20} height={height} fill="#fff" />
        {bars.map((b, i) => <rect key={i} x={b.x + 10} y={0} width={b.w} height={height} fill="#000" />)}
      </svg>
      <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: 2 }}>{text}</div>
    </div>
  );
}

function Field({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ flex: wide ? "2 1 220px" : "1 1 120px", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: faint, textTransform: "uppercase" }}>{label}</div>
      <div style={{ borderBottom: line, minHeight: 16, fontWeight: 700, fontSize: 12 }}>{value ?? ""}</div>
    </div>
  );
}

type StopLike = { arrivedAt: string | null; beginAt: string | null; leftAt: string | null; delayMinutes: number | null; delayReason: string | null; delayNote: string | null };

// One label/value row: label left, value right. Used for times so each one
// gets its own line instead of a run-on sentence.
function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderBottom: "1px dotted #bbb", padding: "2px 0" }}>
      <span style={{ color: faint }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{value || "—"}</span>
    </div>
  );
}

function StopTimes({ stop, beginLabel, endLabel = "Departed" }: { stop: StopLike; beginLabel: string; endLabel?: string }) {
  const delay = stop.delayReason || stop.delayNote;
  return (
    <div style={{ marginTop: 4 }}>
      <Row label="Arrived" value={fmtDateTime(stop.arrivedAt)} />
      <Row label={beginLabel} value={fmtDateTime(stop.beginAt)} />
      <Row label={endLabel} value={fmtDateTime(stop.leftAt)} />
      {delay ? (
        <Row
          label={`Delay${stop.delayMinutes != null ? ` ${stop.delayMinutes} min` : ""}`}
          value={[stop.delayReason, stop.delayNote].filter(Boolean).join(" — ")}
        />
      ) : null}
    </div>
  );
}

// A small labeled value that wraps with its neighbors (compartment cards).
function Item({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <span style={{ maxWidth: "100%", overflowWrap: "anywhere" }}>
      <span style={{ color: faint, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label} </span>
      <b>{value}</b>
    </span>
  );
}

const box: React.CSSProperties = { border: line, padding: 8, marginBottom: 8, breakInside: "avoid" };
const sigLabel: React.CSSProperties = { fontSize: 9, color: faint, textTransform: "uppercase", marginTop: 6 };

export function PtdDocument({ ptd, truckName, trailerName, viewerId, viewerSignature }: {
  ptd: Ptd;
  truckName: string | null;
  trailerName: string | null;
  viewerId: string | null;
  viewerSignature: string | null;
}) {
  // Signatures are private per driver (RLS); only the viewer's own drawing can
  // be shown. Anyone else's acceptance prints as an electronic signature line.
  const sig = (driverId: string | null) =>
    driverId && driverId === viewerId && viewerSignature
      ? <div style={{ width: 160, maxWidth: "100%", color: ink }}><SignatureView path={viewerSignature} height={40} /></div>
      : null;

  const loadingSig = (s: Ptd["loadingSigs"][number], i: number) => (
    <div key={i} style={{ marginTop: 2 }}>
      {sig(s.driverId)}
      <div style={{ fontWeight: 700 }}>{s.name}</div>
      <div style={{ fontSize: 10, color: faint }}>Signed electronically {fmtDateTime(s.at)}</div>
    </div>
  );
  // Loading signatures that name a pickup go under it; any without one (older
  // events) go under the first pickup.
  const matched = new Set<number>();
  const sigsFor = (pickupId: string, first: boolean) =>
    ptd.loadingSigs
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => {
        const hit = s.pickupId ? s.pickupId === pickupId : first;
        if (hit) matched.add(i);
        return hit;
      });

  return (
    <div style={page} className="ptd-page">
      <Barcode text={ptd.code} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "2px 12px", marginTop: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 900 }}>Product Transfer Document</div>
        <div style={{ color: faint }}>
          {ptd.status === "complete" ? `Completed ${fmtDateTime(ptd.completedAt)}` : ptd.status === "cancelled" ? "Cancelled" : "In progress"}
          {ptd.enteredLate ? " · Entered after the fact" : ""}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        <Field label="Order #" value={ptd.orderNumbers.join(", ")} wide />
        <Field label="Date" value={fmtDate(ptd.date)} />
        <Field label="Shipper" value={ptd.shipper} wide />
        <Field label="Customer" value={ptd.customer} wide />
        <Field label="Truck" value={ptd.truckChanges.length
          ? [ptd.truckChanges[0].fromName, ...ptd.truckChanges.map((c, i) => (i === ptd.truckChanges.length - 1 ? (truckName ?? c.toName) : c.toName))].map((n) => n ?? "?").join(" → ")
          : truckName} />
        <Field label="Trailer" value={trailerName} />
        <Field label="Begin miles" value={ptd.beginMiles?.toLocaleString("en-US")} />
        <Field label="End miles" value={ptd.endMiles?.toLocaleString("en-US")} />
        <Field label="Total miles" value={ptd.totalMiles?.toLocaleString("en-US")} />
      </div>

      {ptd.cancellation && (
        <div style={{ border: "1px solid #b91c1c", borderRadius: 6, padding: "6px 8px", marginTop: 10 }}>
          <div style={{ fontWeight: 800 }}>Load cancelled{ptd.cancellation.at ? ` ${fmtDateTime(ptd.cancellation.at)}` : ""}{ptd.cancellation.by ? ` by ${ptd.cancellation.by}` : ""}</div>
          <div>{ptd.cancellation.reasons.length ? ptd.cancellation.reasons.join(" → ") : "No reason given"}</div>
          {ptd.cancellation.note && <div>&ldquo;{ptd.cancellation.note}&rdquo;</div>}
          {ptd.cancellation.returnedTo && <div style={{ color: faint }}>Headed to {ptd.cancellation.returnedTo}</div>}
        </div>
      )}
      {ptd.parks.length > 0 && (
        <div style={{ ...box, marginTop: 10 }}>
          {ptd.parks.map((p, i) => (
            <div key={i}>
              <Row label="Parked preloaded" value={`${fmtDateTime(p.parkedAt)} → ${p.resumedAt ? fmtDateTime(p.resumedAt) : "still parked"}`} />
              {(p.where || p.note) && (
                <div style={{ fontSize: 10, color: faint, marginLeft: 8 }}>
                  {[p.where ? `At ${p.where}` : null, p.note].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ptd.truckChanges.length > 0 && (
        <div style={{ ...box, marginTop: 10 }}>
          {ptd.truckChanges.map((c, i) => (
            <div key={i}>
              <Row label="Truck changed" value={`${c.fromName ?? "?"} → ${c.toName ?? "?"} · ${fmtDateTime(c.at)}`} />
              {(c.fromOdometer != null || c.toOdometer != null) && (
                <div style={{ fontSize: 10, color: faint, marginLeft: 8 }}>
                  Miles {c.fromOdometer?.toLocaleString("en-US") ?? "?"} → {c.toOdometer?.toLocaleString("en-US") ?? "?"}
                  {c.grossAfter != null ? ` · Gross after ${c.grossAfter.toLocaleString("en-US")} lbs` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={h2}>Pickups</div>
      {ptd.pickups.length === 0 && <div style={{ color: faint }}>None yet.</div>}
      {ptd.pickups.map((p, i) => {
        const sigs = sigsFor(p.pickupId, i === 0);
        return (
          <div key={p.pickupId} style={box}>
            <div style={{ fontWeight: 800 }}>{p.name}</div>
            {p.odometer != null && <div style={{ color: faint }}>Odometer {p.odometer.toLocaleString("en-US")}</div>}
            {p.supplierSwitches.map((w, k) => (
              <div key={k} style={{ marginTop: 2 }}>
                <Row label="Supplier switched" value={`${w.from} → ${w.to} · ${w.reason}${w.note ? ` (${w.note})` : ""} · ${fmtDateTime(w.at)}`} />
              </div>
            ))}
            {p.noLoad ? (
              <>
                <div style={{ marginTop: 4, fontWeight: 700 }}>Couldn&apos;t load: {p.noLoadReason}</div>
                <div style={{ marginTop: 4 }}>
                  <Row label="Arrived" value={fmtDateTime(p.arrivedAt)} />
                  {p.beginAt && <Row label="Began loading" value={fmtDateTime(p.beginAt)} />}
                  <Row label="Departed" value={fmtDateTime(p.leftAt)} />
                </div>
              </>
            ) : (
              <>
                <StopTimes stop={p} beginLabel="Began loading" />
                <div style={sigLabel}>Loading driver</div>
                {sigs.length === 0 ? <div style={{ color: faint }}>Not signed yet.</div> : sigs.map(({ s, i: k }) => loadingSig(s, k))}
              </>
            )}
          </div>
        );
      })}
      {ptd.loadingSigs.some((_, i) => !matched.has(i)) && (
        <div style={box}>
          <div style={sigLabel}>Loading driver</div>
          {ptd.loadingSigs.map((s, i) => (matched.has(i) ? null : loadingSig(s, i)))}
        </div>
      )}

      <div style={h2}>Compartments</div>
      {ptd.compartments.length === 0 && <div style={{ color: faint }}>None yet.</div>}
      {ptd.compartments.map((c) => (
        <div key={c.comp} style={{ ...box, padding: "6px 8px", marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <b>C{c.comp} · {c.product}</b>
            <span style={{ color: faint, textAlign: "right" }}>
              {c.disposition === "retained" ? "Retained on trailer" : [c.delivery, c.tank ? `Tank ${c.tank}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", marginTop: 3 }}>
            <Item label="Order" value={c.order} />
            <Item label="BOL" value={c.bol} />
            <Item label="Supplier" value={c.supplier} />
            <Item label="Gross" value={gal(c.gross)} />
            <Item label="Net" value={gal(c.net)} />
            <Item label="°F" value={dec(c.temp)} />
            <Item label="API" value={dec(c.api)} />
          </div>
          {c.flag ? <div style={{ color: "#b45309", fontSize: 9, marginTop: 2 }}>{c.flag}</div> : null}
        </div>
      ))}
      {ptd.compartments.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, fontWeight: 800 }}>
          <span>Total gross {gal(ptd.totals.gross)}</span>
          <span>Total net {gal(ptd.totals.net)}</span>
        </div>
      )}

      {ptd.billing.length > 0 && (
        <>
          <div style={h2}>Billing (net gallons by order)</div>
          <table style={table}>
            <thead><tr><th style={th}>Order #</th><th style={th}>Product</th><th style={th}>Net</th></tr></thead>
            <tbody>
              {ptd.billing.map((b, i) => (
                <tr key={i}><td style={td}>{b.order ?? ""}</td><td style={td}>{b.product}</td><td style={tdR}>{gal(b.net)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={h2}>Deliveries</div>
      {ptd.deliveries.length === 0 && <div style={{ color: faint }}>None yet.</div>}
      {ptd.deliveries.map((d, i) => {
        const pump = d.deliveryType === "pump_off";
        return (
          <div key={i} style={box}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 800, minWidth: 0, overflowWrap: "anywhere" }}>{d.name}</div>
              <div style={{ color: faint, whiteSpace: "nowrap" }}>{pump ? "Pump off" : "Drop"}{d.status === "planned" ? " · Not delivered yet" : ""}</div>
            </div>

            {(d.drops.length > 0 || d.otherTanks.length > 0) && (
              <div style={{ marginTop: 4 }}>
                {d.drops.map((x) => (
                  <div key={x.comp} style={{ display: "flex", flexWrap: "wrap", gap: "0 12px", padding: "2px 0", borderBottom: "1px dotted #bbb" }}>
                    <b>C{x.comp} → {x.tank ? `Tank ${x.tank}` : "Tank —"}</b>
                    <span style={{ color: faint }}>{x.product}{x.net != null ? ` · ${gal(x.net)} net` : ""}</span>
                    <Item label="Before" value={reading(x.before, x.unit)} />
                    <Item label="After" value={reading(x.after, x.unit)} />
                    <Item label="Water" value={x.water == null ? "" : `${dec(x.water)} in`} />
                  </div>
                ))}
                {d.otherTanks.map((t) => (
                  <div key={`t${t.tank}`} style={{ display: "flex", flexWrap: "wrap", gap: "0 12px", padding: "2px 0", borderBottom: "1px dotted #bbb" }}>
                    <b>Tank {t.tank}</b>
                    {t.product && <span style={{ color: faint }}>{t.product}</span>}
                    <Item label="Before" value={reading(t.before, t.unit)} />
                    <Item label="After" value={reading(t.after, t.unit)} />
                    <Item label="Water" value={t.water == null ? "" : `${dec(t.water)} in`} />
                  </div>
                ))}
              </div>
            )}

            <StopTimes stop={d} beginLabel={pump ? "Began pumping" : "Began delivering"} />

            <div style={sigLabel}>Delivering driver</div>
            {sig(d.driverId)}
            <div style={{ fontWeight: 700 }}>{d.driver ?? ""}</div>
            {d.driverSignedAt && <div style={{ fontSize: 10, color: faint }}>Signed electronically {fmtDateTime(d.driverSignedAt)}</div>}

            <div style={sigLabel}>Consignee</div>
            {d.consigneeSignature && <div style={{ width: 160, maxWidth: "100%", color: ink }}><SignatureView path={d.consigneeSignature} height={40} /></div>}
            <div style={{ fontWeight: 700 }}>{d.consigneeName ?? ""}</div>
          </div>
        );
      })}

      <div style={h2}>Time</div>
      <div style={box}>
        {ptd.time.rows.map((r, i) =>
          r.type === "travel" ? (
            <Row key={i} label={`Travel to ${r.to}`} value={fmtMinutes(r.minutes)} />
          ) : (
            <div key={i}>
              <Row
                label={r.name}
                value={`${fmtMinutes(r.onSite)}${r.noLoad ? " · no load" : r.waited != null && r.working != null
                  ? ` (waited ${fmtMinutes(r.waited)}, ${r.kind === "rack" ? "loading" : "delivering"} ${fmtMinutes(r.working)})` : ""}`}
              />
              {r.reason && <div style={{ fontSize: 10, color: faint, marginLeft: 8 }}>{r.reason}</div>}
            </div>
          ),
        )}
        <div style={{ borderTop: line, marginTop: 6, paddingTop: 6 }}>
          <Row label="Travel to first rack" value={fmtMinutes(ptd.time.travelToRack)} />
          <Row label={`Trying to load${ptd.time.racksTried > 1 ? ` (${ptd.time.racksTried} racks)` : ""}`} value={fmtMinutes(ptd.time.loadingSpan)} />
          <Row label="Travel to delivery" value={fmtMinutes(ptd.time.travelToDelivery)} />
          <Row label="At deliveries" value={fmtMinutes(ptd.time.atDeliveries)} />
          <Row label="Total travel" value={fmtMinutes(ptd.time.totalTravel)} />
          <Row label="Total trip" value={fmtMinutes(ptd.time.total)} />
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 9, color: faint }}>Generated by ProTankr · {ptd.code}</div>
    </div>
  );
}

// Same layout, nothing filled in.
export function BlankPtd() {
  const times = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
      <Field label="Arrived" /><Field label="Began" /><Field label="Departed" /><Field label="Delay reason" wide />
    </div>
  );
  return (
    <div style={page} className="ptd-page">
      <div style={{ fontSize: 17, fontWeight: 900 }}>Product Transfer Document</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        <Field label="Order #" wide /><Field label="Date" />
        <Field label="Shipper" wide /><Field label="Customer" wide />
        <Field label="Truck" /><Field label="Trailer" />
        <Field label="Begin miles" /><Field label="End miles" /><Field label="Total miles" />
      </div>
      <div style={h2}>Pickup</div>
      <div style={box}>
        <Field label="Terminal / location" wide />
        {times}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          <Field label="Loading driver signature" wide /><Field label="Odometer" />
        </div>
      </div>
      <div style={h2}>Compartments</div>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div key={n} style={{ ...box, padding: "6px 8px", marginBottom: 6 }}>
          <div style={{ fontWeight: 800 }}>C{n}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Field label="Product" /><Field label="Order" /><Field label="BOL" /><Field label="Supplier" />
            <Field label="Gross" /><Field label="Net" /><Field label="°F" /><Field label="API" />
          </div>
        </div>
      ))}
      {[1, 2].map((n) => (
        <div key={n} style={{ ...box, marginTop: 10 }}>
          <div style={{ fontWeight: 800 }}>Delivery {n}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Field label="Location" wide /><Field label="Drop / Pump off" />
          </div>
          {[1, 2, 3].map((r) => (
            <div key={r} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              <Field label="Comp" /><Field label="Tank" /><Field label="Before" /><Field label="After" />
            </div>
          ))}
          {times}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10 }}>
            <Field label="Delivering driver signature" wide /><Field label="Consignee name / signature" wide />
          </div>
        </div>
      ))}
    </div>
  );
}

// Renders children straight into <body> for printing, hiding the rest of the
// app on paper. The planner shell clips overflow, so printing in place would
// cut the page off.
export function PrintPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="ptd-print-root">
      <style>{`
        @media screen { .ptd-print-root { display: none; } }
        @media print {
          @page { margin: 10mm; }
          html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
          body > *:not(.ptd-print-root) { display: none !important; }
          .ptd-print-root { display: block; }
          .ptd-print-root .ptd-page { max-width: none; padding: 0; border-radius: 0; }
        }
      `}</style>
      {children}
    </div>,
    document.body,
  );
}
