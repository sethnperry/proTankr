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
      <svg viewBox={`0 0 ${width + 20} ${height}`} style={{ width: Math.min(260, (width + 20) * 1.4), height, display: "block", margin: "0 auto" }} preserveAspectRatio="none">
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

function StopTimes({ stop, beginLabel }: { stop: { arrivedAt: string | null; beginAt: string | null; leftAt: string | null; delayMinutes: number | null; delayReason: string | null; delayNote: string | null }; beginLabel: string }) {
  const delay = stop.delayReason || stop.delayNote;
  return (
    <div style={{ fontSize: 10.5 }}>
      Arrived {fmtDateTime(stop.arrivedAt) || "—"} · {beginLabel} {fmtDateTime(stop.beginAt) || "—"} · Left {fmtDateTime(stop.leftAt) || "—"}
      {delay ? <> · <b>Delay{stop.delayMinutes != null ? ` ${stop.delayMinutes} min` : ""}:</b> {[stop.delayReason, stop.delayNote].filter(Boolean).join(" — ")}</> : null}
    </div>
  );
}

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
      ? <div style={{ width: 160, color: ink }}><SignatureView path={viewerSignature} height={40} /></div>
      : null;

  return (
    <div style={page} className="ptd-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Product Transfer Document</div>
          <div style={{ color: faint }}>
            {ptd.status === "complete" ? `Completed ${fmtDateTime(ptd.completedAt)}` : ptd.status === "cancelled" ? "Cancelled" : "In progress"}
            {ptd.enteredLate ? " · Entered after the fact" : ""}
          </div>
        </div>
        <Barcode text={ptd.code} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        <Field label="Order #" value={ptd.orderNumbers.join(", ")} wide />
        <Field label="Date" value={fmtDate(ptd.date)} />
        <Field label="Shipper" value={ptd.shipper} wide />
        <Field label="Customer" value={ptd.customer} wide />
        <Field label="Truck" value={truckName} />
        <Field label="Trailer" value={trailerName} />
        <Field label="Begin miles" value={ptd.beginMiles?.toLocaleString("en-US")} />
        <Field label="End miles" value={ptd.endMiles?.toLocaleString("en-US")} />
        <Field label="Total miles" value={ptd.totalMiles?.toLocaleString("en-US")} />
      </div>

      <div style={h2}>Pickups</div>
      {ptd.pickups.length === 0 && <div style={{ color: faint }}>None yet.</div>}
      {ptd.pickups.map((p, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>{p.name}{p.odometer != null ? ` · Odometer ${p.odometer.toLocaleString("en-US")}` : ""}</div>
          <StopTimes stop={p} beginLabel="Began loading" />
        </div>
      ))}

      <div style={h2}>Compartments</div>
      <table style={table}>
        <thead>
          <tr>
            {["C", "Product", "Order", "BOL", "Supplier", "Gross", "Net", "°F", "API", "Delivered to", "Tank"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {ptd.compartments.map((c) => (
            <tr key={c.comp}>
              <td style={td}>{c.comp}</td>
              <td style={td}>{c.product}{c.flag ? <div style={{ color: "#b45309", fontSize: 9 }}>{c.flag}</div> : null}</td>
              <td style={td}>{c.order ?? ""}</td>
              <td style={td}>{c.bol ?? ""}</td>
              <td style={td}>{c.supplier ?? ""}</td>
              <td style={tdR}>{gal(c.gross)}</td>
              <td style={tdR}>{gal(c.net)}</td>
              <td style={tdR}>{dec(c.temp)}</td>
              <td style={tdR}>{dec(c.api)}</td>
              <td style={td}>{c.disposition === "retained" ? "Retained on trailer" : c.delivery ?? ""}</td>
              <td style={td}>{c.tank ?? ""}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 800 }} colSpan={5}>Total</td>
            <td style={{ ...tdR, fontWeight: 800 }}>{gal(ptd.totals.gross)}</td>
            <td style={{ ...tdR, fontWeight: 800 }}>{gal(ptd.totals.net)}</td>
            <td style={td} colSpan={4} />
          </tr>
        </tbody>
      </table>

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
      {ptd.deliveries.map((d, i) => (
        <div key={i} style={{ border: line, padding: 8, marginBottom: 8, breakInside: "avoid" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 800 }}>{d.name}</div>
            <div style={{ color: faint }}>{d.deliveryType === "pump_off" ? "Pump off" : "Drop"}{d.status === "planned" ? " · Not delivered yet" : ""}</div>
          </div>
          <StopTimes stop={d} beginLabel={d.deliveryType === "pump_off" ? "Began pumping" : "Began delivering"} />
          {d.compartments.length > 0 && <div style={{ fontSize: 10.5 }}>Compartments: {d.compartments.map((c) => `C${c}`).join(", ")}</div>}
          {d.tanks.length > 0 && (
            <table style={{ ...table, marginTop: 4 }}>
              <thead><tr>{["Tank", "Product", "Before", "After", "Water"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.tanks.map((t, j) => (
                  <tr key={j}>
                    <td style={td}>{t.tank}</td><td style={td}>{t.product ?? ""}</td>
                    <td style={tdR}>{gal(t.before)}</td><td style={tdR}>{gal(t.after)}</td><td style={tdR}>{dec(t.water)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6 }}>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 9, color: faint, textTransform: "uppercase" }}>Delivering driver</div>
              {sig(d.driverId)}
              <div style={{ fontWeight: 700 }}>{d.driver ?? ""}</div>
              {d.driverSignedAt && <div style={{ fontSize: 10, color: faint }}>Signed electronically {fmtDateTime(d.driverSignedAt)}</div>}
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 9, color: faint, textTransform: "uppercase" }}>Consignee</div>
              {d.consigneeSignature && <div style={{ width: 160, color: ink }}><SignatureView path={d.consigneeSignature} height={40} /></div>}
              <div style={{ fontWeight: 700 }}>{d.consigneeName ?? ""}</div>
            </div>
          </div>
        </div>
      ))}

      <div style={h2}>Loading driver</div>
      {ptd.loadingSigs.length === 0 && <div style={{ color: faint }}>Not signed yet.</div>}
      {ptd.loadingSigs.map((s, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          {sig(s.driverId)}
          <b>{s.name}</b> <span style={{ color: faint }}>· Signed electronically {fmtDateTime(s.at)}</span>
        </div>
      ))}

      <div style={{ marginTop: 14, fontSize: 9, color: faint }}>Generated by ProTankr · {ptd.code}</div>
    </div>
  );
}

// Same layout, nothing filled in.
export function BlankPtd() {
  const blankRows = (n: number, cols: number) =>
    Array.from({ length: n }, (_, i) => <tr key={i}>{Array.from({ length: cols }, (_, j) => <td key={j} style={{ ...td, height: 20 }} />)}</tr>);
  const times = (
    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
      <Field label="Arrived" /><Field label="Began" /><Field label="Left" /><Field label="Delay reason" wide />
    </div>
  );
  return (
    <div style={page} className="ptd-page">
      <div style={{ fontSize: 18, fontWeight: 900 }}>Product Transfer Document</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        <Field label="Order #" wide /><Field label="Date" />
        <Field label="Shipper" wide /><Field label="Customer" wide />
        <Field label="Truck" /><Field label="Trailer" />
        <Field label="Begin miles" /><Field label="End miles" /><Field label="Total miles" />
      </div>
      <div style={h2}>Pickup</div>
      <Field label="Terminal / location" wide />
      {times}
      <div style={h2}>Compartments</div>
      <table style={table}>
        <thead><tr>{["C", "Product", "Order", "BOL", "Supplier", "Gross", "Net", "°F", "API", "Delivered to", "Tank"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{blankRows(6, 11)}</tbody>
      </table>
      {[1, 2].map((n) => (
        <div key={n} style={{ border: line, padding: 8, marginTop: 10, breakInside: "avoid" }}>
          <div style={{ fontWeight: 800 }}>Delivery {n}</div>
          <Field label="Location" wide />
          {times}
          <table style={{ ...table, marginTop: 6 }}>
            <thead><tr>{["Tank", "Product", "Before", "After", "Water"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{blankRows(3, 5)}</tbody>
          </table>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            <Field label="Delivering driver signature" wide /><Field label="Consignee name / signature" wide />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
        <Field label="Loading driver signature" wide /><Field label="Date / time" />
      </div>
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
