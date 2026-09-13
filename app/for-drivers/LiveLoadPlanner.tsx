"use client";
// app/for-drivers/LiveLoadPlanner.tsx
// A genuinely interactive load planner for the marketing site -- not a
// screenshot, not a canned animation. Runs the SAME pure math the real
// app's planner uses (app/planner/utils/planMath.ts: CG-bias allocation,
// water-fill distribution across compartments, capacity solving against a
// weight ceiling), driven here by curated example compartments/products
// instead of a live Supabase-backed account.
//
// Deliberately does NOT talk to Supabase at all -- there is no safe way
// to let anonymous public traffic write real rows (or even read a real
// account's data) from a page with no auth. Tapping "Load" shows a
// preview screen built from local state; nothing is submitted anywhere.
// This is disclosed in the tool's own footnote rather than left implicit.

import { useMemo, useState } from "react";
import {
  cgSliderToBias,
  lbsPerGallonAtTemp,
  planForGallons,
  solveMaxGallons,
} from "../planner/utils/planMath";

type DemoProduct = {
  id: string;
  code: string;
  name: string;
  api60: number;
  alpha: number;
  color: string;
};

const PRODUCTS: DemoProduct[] = [
  { id: "d2", code: "D2", name: "ULSD Diesel #2", api60: 36.4, alpha: 0.00035, color: "#eab308" },
  { id: "87", code: "87", name: "Regular Unleaded", api60: 58.0, alpha: 0.0006, color: "#ffffff" },
  { id: "93", code: "93", name: "Premium 93", api60: 56.0, alpha: 0.00058, color: "#ef4444" },
];

type DemoComp = { compNumber: number; maxGallons: number; position: number };

const COMPARTMENTS: DemoComp[] = [
  { compNumber: 1, maxGallons: 2200, position: -1 },
  { compNumber: 2, maxGallons: 2500, position: -0.33 },
  { compNumber: 3, maxGallons: 2500, position: 0.33 },
  { compNumber: 4, maxGallons: 2300, position: 1 },
];
const DISPLAY_ORDER = [...COMPARTMENTS].sort((a, b) => b.compNumber - a.compNumber);

const TERMINALS = [
  { id: "t1", name: "Marathon", city: "Tampa, FL" },
  { id: "t2", name: "Kinder Morgan", city: "Port Everglades, FL" },
];

const TARE_LBS = 33000;
const TARGET_LBS = 79500;
const LOAD_TEMP_F = 72;

function productById(id: string) {
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];
}
function fmtGal(n: number) {
  return `${Math.round(n).toLocaleString("en-US")} gal`;
}
function fmtLbs(n: number) {
  return `${Math.round(n).toLocaleString("en-US")} lbs`;
}

export default function LiveLoadPlanner() {
  const [terminalIdx, setTerminalIdx] = useState(0);
  const [productByComp, setProductByComp] = useState<Record<number, string>>({
    1: "d2",
    2: "d2",
    3: "93",
    4: "87",
  });
  const [capByComp, setCapByComp] = useState<Record<number, number>>({});
  const [editingComp, setEditingComp] = useState<number | null>(null);
  const [cgSlider, setCgSlider] = useState(0.5);
  const [showPreview, setShowPreview] = useState(false);

  const terminal = TERMINALS[terminalIdx];

  const { rows, totalGallons, grossLbs, marginLbs } = useMemo(() => {
    const compsForMath = COMPARTMENTS.map((c) => {
      const productId = productByComp[c.compNumber] ?? PRODUCTS[0].id;
      const product = productById(productId);
      const lbsPerGal = lbsPerGallonAtTemp(product.api60, product.alpha, LOAD_TEMP_F);
      const cap = Math.min(capByComp[c.compNumber] ?? c.maxGallons, c.maxGallons);
      return { compNumber: c.compNumber, maxGallons: cap, position: c.position, lbsPerGal, productId };
    });
    const totalVolume = compsForMath.reduce((s, c) => s + c.maxGallons, 0);
    const bias = cgSliderToBias(cgSlider);
    const allowedLbs = Math.max(0, TARGET_LBS - TARE_LBS);
    const maxGal = solveMaxGallons(totalVolume, compsForMath, allowedLbs, bias);
    const planRows = planForGallons(maxGal, compsForMath, bias);
    const gal = planRows.reduce((s, r) => s + r.planned_gallons, 0);
    const lbs = TARE_LBS + planRows.reduce((s, r) => s + r.planned_gallons * r.lbsPerGal, 0);
    return { rows: planRows, totalGallons: gal, grossLbs: lbs, marginLbs: TARGET_LBS - lbs };
  }, [productByComp, capByComp, cgSlider]);

  const rowByComp = new Map(rows.map((r) => [r.comp_number, r]));
  const overWeight = marginLbs < 0;

  function setProduct(comp: number, productId: string) {
    setProductByComp((m) => ({ ...m, [comp]: productId }));
  }
  function setCap(comp: number, gallons: number) {
    setCapByComp((m) => ({ ...m, [comp]: gallons }));
  }

  return (
    <div className="live-planner">
      <div className="lp-titlebar">
        <span className="lp-titlebar-label">ProTankr Planner</span>
        <span className="lp-titlebar-badge">Interactive demo</span>
      </div>

      {!showPreview ? (
        <div className="lp-body">
          <div className="lp-terminal-row">
            {TERMINALS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className={`lp-terminal-btn${i === terminalIdx ? " lp-terminal-btn-active" : ""}`}
                onClick={() => setTerminalIdx(i)}
              >
                <span className="lp-terminal-name">{t.name}</span>
                <span className="lp-terminal-city">{t.city}</span>
              </button>
            ))}
          </div>

          <div className="lp-bars">
            {DISPLAY_ORDER.map((c) => {
              const row = rowByComp.get(c.compNumber);
              const planned = row?.planned_gallons ?? 0;
              const product = productById(productByComp[c.compNumber] ?? PRODUCTS[0].id);
              const fillPct = Math.max(2, Math.min(100, (planned / c.maxGallons) * 100));
              const isEditing = editingComp === c.compNumber;
              return (
                <button
                  key={c.compNumber}
                  type="button"
                  className={`lp-bar-col${isEditing ? " lp-bar-col-active" : ""}`}
                  onClick={() => setEditingComp(isEditing ? null : c.compNumber)}
                >
                  <div className="lp-bar-track">
                    <div
                      className="lp-bar-fill"
                      style={{ height: `${fillPct}%`, background: product.color }}
                    />
                  </div>
                  <span className="lp-bar-code" style={{ color: product.color }}>
                    {product.code}
                  </span>
                  <span className="lp-bar-gal">{Math.round(planned).toLocaleString("en-US")}</span>
                  <span className="lp-bar-num">{c.compNumber}</span>
                </button>
              );
            })}
          </div>

          {editingComp != null && (
            <div className="lp-editor">
              <div className="lp-editor-head">
                <span>Compartment {editingComp}</span>
                <button type="button" className="lp-editor-close" onClick={() => setEditingComp(null)}>
                  Done
                </button>
              </div>
              <div className="lp-product-chips">
                {PRODUCTS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`lp-chip${productByComp[editingComp] === p.id ? " lp-chip-active" : ""}`}
                    onClick={() => setProduct(editingComp, p.id)}
                  >
                    <span className="lp-chip-dot" style={{ background: p.color }} />
                    {p.code}
                  </button>
                ))}
              </div>
              <label className="lp-cap-field">
                <div className="lp-cap-head">
                  <span>Cap</span>
                  <span>
                    {(
                      capByComp[editingComp] ??
                      COMPARTMENTS.find((c) => c.compNumber === editingComp)!.maxGallons
                    ).toLocaleString("en-US")}{" "}
                    / {COMPARTMENTS.find((c) => c.compNumber === editingComp)!.maxGallons.toLocaleString("en-US")} gal
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={COMPARTMENTS.find((c) => c.compNumber === editingComp)!.maxGallons}
                  step={50}
                  value={
                    capByComp[editingComp] ??
                    COMPARTMENTS.find((c) => c.compNumber === editingComp)!.maxGallons
                  }
                  onChange={(e) => setCap(editingComp, Number(e.target.value))}
                />
              </label>
            </div>
          )}

          <label className="lp-cg">
            <div className="lp-cg-head">
              <span>Center of gravity</span>
              <span>{cgSlider < 0.48 ? "Rear bias" : cgSlider > 0.52 ? "Front bias" : "Neutral"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cgSlider}
              onChange={(e) => setCgSlider(Number(e.target.value))}
            />
            <div className="lp-cg-ends">
              <span>Rear</span>
              <span>Front</span>
            </div>
          </label>

          <div className="lp-stats-row">
            <div className="lp-stat">
              <span className="lp-stat-label">Total</span>
              <span className="lp-stat-value">{fmtGal(totalGallons)}</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-label">Gross weight</span>
              <span className="lp-stat-value">{fmtLbs(grossLbs)}</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-label">Margin</span>
              <span className={`lp-stat-value${overWeight ? " lp-stat-over" : ""}`}>
                {overWeight ? `${fmtLbs(Math.abs(marginLbs))} over` : `${fmtLbs(marginLbs)} safe`}
              </span>
            </div>
          </div>

          <button type="button" className="lp-load-btn" onClick={() => setShowPreview(true)}>
            Load
          </button>
        </div>
      ) : (
        <div className="lp-body">
          <div className="lp-preview-head">
            <span className="lp-preview-title">Plan review</span>
            <span className="lp-preview-terminal">
              {terminal.name} &middot; {terminal.city}
            </span>
          </div>
          <div className="lp-preview-rows">
            {[...rows]
              .filter((r) => r.planned_gallons > 0.5)
              .sort((a, b) => b.comp_number - a.comp_number)
              .map((r) => {
                const product = productById(r.productId ?? "");
                return (
                  <div key={r.comp_number} className="lp-preview-row">
                    <span className="lp-preview-row-left">
                      <span className="lp-chip-dot" style={{ background: product.color }} />
                      C{r.comp_number} &middot; {product.code}
                    </span>
                    <span className="lp-preview-row-right">
                      {fmtGal(r.planned_gallons)} &middot; API {product.api60.toFixed(1)} &middot; {LOAD_TEMP_F}&deg;F
                    </span>
                  </div>
                );
              })}
            <div className="lp-preview-row lp-preview-total">
              <span>Total</span>
              <span>
                {fmtGal(totalGallons)} &middot; {fmtLbs(grossLbs)} gross
              </span>
            </div>
          </div>
          <button type="button" className="lp-back-btn" onClick={() => setShowPreview(false)}>
            &larr; Back to plan
          </button>
        </div>
      )}

      <p className="lp-footnote">
        Same math the real app uses for CG bias, compartment allocation, and
        capacity solving — running here with example compartments and
        products, not a live terminal. Tapping Load only previews the next
        screen; nothing is submitted anywhere.
      </p>

      <style jsx global>{`
        .live-planner {
          width: 100%;
          max-width: 480px;
          border-radius: 20px;
          background: #111111;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 20px 50px rgba(0,0,0,0.18);
          overflow: hidden;
        }
        .lp-titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
        }
        .lp-titlebar-label { font: 700 12px var(--font); color: rgba(255,255,255,0.55); }
        .lp-titlebar-badge {
          font: 800 9.5px var(--font);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.85);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 999px;
          padding: 4px 9px;
        }
        .lp-body { padding: 22px 22px 20px; }

        .lp-terminal-row { display: flex; gap: 8px; }
        .lp-terminal-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 9px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.12);
          background: transparent;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          font-family: var(--font);
          text-align: left;
        }
        .lp-terminal-btn-active { border-color: #fff; background: rgba(255,255,255,0.08); color: #fff; }
        .lp-terminal-name { font: 800 12.5px var(--font); }
        .lp-terminal-city { font: 500 10.5px var(--font); opacity: 0.7; }

        .lp-bars {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin-top: 20px;
          height: 150px;
        }
        .lp-bar-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          height: 100%;
          border: 1px solid transparent;
          border-radius: 10px;
          background: none;
          cursor: pointer;
          padding: 4px;
          font-family: var(--font);
        }
        .lp-bar-col-active { border-color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.05); }
        .lp-bar-track {
          width: 100%;
          flex: 1;
          min-height: 0;
          border-radius: 6px;
          background: rgba(255,255,255,0.08);
          display: flex;
          align-items: flex-end;
          overflow: hidden;
        }
        .lp-bar-fill { width: 100%; border-radius: 6px 6px 0 0; transition: height 150ms ease; }
        .lp-bar-code { font: 800 11px var(--font); }
        .lp-bar-gal { font: 700 10px var(--font); color: rgba(255,255,255,0.5); }
        .lp-bar-num { font: 600 9px var(--font); color: rgba(255,255,255,0.3); }

        .lp-editor {
          margin-top: 14px;
          padding: 14px;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .lp-editor-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font: 700 12px var(--font);
          color: rgba(255,255,255,0.7);
        }
        .lp-editor-close {
          background: none;
          border: none;
          color: #fff;
          font: 700 12px var(--font);
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
        }
        .lp-product-chips { display: flex; gap: 8px; margin-top: 12px; }
        .lp-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.16);
          background: transparent;
          color: rgba(255,255,255,0.6);
          font: 700 11.5px var(--font);
          cursor: pointer;
        }
        .lp-chip-active { border-color: #fff; color: #fff; background: rgba(255,255,255,0.08); }
        .lp-chip-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
        .lp-cap-field { display: block; margin-top: 14px; }
        .lp-cap-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          font: 700 11px var(--font);
          color: rgba(255,255,255,0.5);
        }
        .lp-cap-field input[type="range"] { width: 100%; margin-top: 6px; accent-color: #fff; }

        .lp-cg { display: block; margin-top: 18px; }
        .lp-cg-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          font: 700 11.5px var(--font);
          color: rgba(255,255,255,0.55);
        }
        .lp-cg input[type="range"] { width: 100%; margin-top: 6px; accent-color: #fff; }
        .lp-cg-ends { display: flex; justify-content: space-between; font: 600 10px var(--font); color: rgba(255,255,255,0.3); margin-top: 2px; }

        .lp-stats-row {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        .lp-stat { display: flex; flex-direction: column; gap: 3px; }
        .lp-stat-label { font: 700 9.5px var(--font); letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .lp-stat-value { font: 800 13.5px var(--font); color: #fff; }
        .lp-stat-over { color: #ef4444; }

        .lp-load-btn {
          width: 100%;
          margin-top: 16px;
          padding: 13px;
          border-radius: 10px;
          border: none;
          background: #fff;
          color: #111;
          font: 800 14px var(--font);
          cursor: pointer;
        }
        .lp-load-btn:hover { opacity: 0.88; }

        .lp-preview-head { display: flex; flex-direction: column; gap: 2px; }
        .lp-preview-title { font: 800 15px var(--font); color: #fff; }
        .lp-preview-terminal { font: 600 12px var(--font); color: rgba(255,255,255,0.5); }
        .lp-preview-rows { margin-top: 16px; display: flex; flex-direction: column; }
        .lp-preview-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font: 600 12.5px var(--font);
          color: rgba(255,255,255,0.8);
        }
        .lp-preview-row-left { display: flex; align-items: center; gap: 7px; }
        .lp-preview-row-right { color: rgba(255,255,255,0.5); font-weight: 500; font-size: 12px; }
        .lp-preview-total { border-bottom: none; font-weight: 800; color: #fff; }
        .lp-back-btn {
          width: 100%;
          margin-top: 16px;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.16);
          background: transparent;
          color: rgba(255,255,255,0.8);
          font: 700 13px var(--font);
          cursor: pointer;
        }
        .lp-back-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }

        .lp-footnote {
          margin: 0;
          padding: 14px 22px 18px;
          font: 400 11px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.35);
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        @media (max-width: 420px) {
          .lp-bars { height: 130px; }
          .lp-product-chips { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
