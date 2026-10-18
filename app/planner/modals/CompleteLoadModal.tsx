"use client";

import React, { useMemo } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type Styles = {
  table: React.CSSProperties;
  th: React.CSSProperties;
  td: React.CSSProperties;
  help: React.CSSProperties;
  smallBtn: React.CSSProperties;
  doneBtn: React.CSSProperties;
  error: React.CSSProperties;
};

type PlanRow = any;

export type ActualByComp = Record<
  number,
  {
    actual_gallons: number | null;
    actual_lbs: number | null;
    temp_f: number | null;
  }
>;

export default function CompleteLoadModal(props: {
  open: boolean;
  onClose: () => void;

  styles: Styles;

  loadId: string;
  planRows: PlanRow[];

  actualByComp: ActualByComp;
  setActualByComp: React.Dispatch<React.SetStateAction<ActualByComp>>;

  busy?: boolean;
  error?: string | null;

  onSubmit: () => void;
}) {
  const { open, onClose, styles, loadId, planRows, actualByComp, setActualByComp, busy, error, onSubmit } = props;

  const rows = useMemo(() => {
    const out: Array<{
      comp: number;
      productLabel: string;
      planned_gal: number | null;
      planned_lbs: number | null;
      planned_temp: number | null;
    }> = [];

    for (const r of planRows ?? []) {
      const comp = Number((r as any).comp_number ?? (r as any).compNumber ?? 0);
      if (!Number.isFinite(comp) || comp <= 0) continue;

      const productLabel =
        String((r as any).product_name ?? (r as any).productName ?? (r as any).product_id ?? (r as any).productId ?? "")
          .trim() || "—";

      const planned_gal = (() => {
        const v = (r as any).planned_gallons ?? (r as any).plannedGallons ?? null;
        const n = v == null ? null : Number(v);
        return Number.isFinite(n as number) ? (n as number) : null;
      })();

      const planned_lbs = (() => {
        const v = (r as any).planned_lbs ?? (r as any).plannedLbs ?? null;
        const n = v == null ? null : Number(v);
        return Number.isFinite(n as number) ? (n as number) : null;
      })();

      const planned_temp = (() => {
        const v = (r as any).temp_f ?? (r as any).tempF ?? (r as any).planned_temp_f ?? null;
        const n = v == null ? null : Number(v);
        return Number.isFinite(n as number) ? (n as number) : null;
      })();

      out.push({ comp, productLabel, planned_gal, planned_lbs, planned_temp });
    }

    // stable sort by compartment number
    out.sort((a, b) => a.comp - b.comp);
    return out;
  }, [planRows]);

  const setField = (comp: number, key: "actual_gallons" | "actual_lbs" | "temp_f", raw: string) => {
    const trimmed = raw.trim();
    const val = trimmed === "" ? null : Number(trimmed);
    setActualByComp((prev) => {
      const next = { ...prev };
      const cur = next[comp] ?? { actual_gallons: null, actual_lbs: null, temp_f: null };
      next[comp] = { ...cur, [key]: Number.isFinite(val as number) ? (val as number) : null };
      return next;
    });
  };

  const prefillFromPlanned = () => {
    setActualByComp((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const cur = next[r.comp] ?? { actual_gallons: null, actual_lbs: null, temp_f: null };
        next[r.comp] = {
          actual_gallons: cur.actual_gallons ?? r.planned_gal ?? null,
          actual_lbs: cur.actual_lbs ?? r.planned_lbs ?? null,
          temp_f: cur.temp_f ?? r.planned_temp ?? null,
        };
      }
      return next;
    });
  };

  return (
    <FullscreenModal open={open} title="Complete Load" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={styles.help}>
          Load ID: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{loadId}</span>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={styles.smallBtn} onClick={prefillFromPlanned} disabled={busy}>
            Prefill from planned
          </button>
        </div>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Comp</th>
              <th style={styles.th}>Product</th>
              <th style={styles.th}>Planned gal</th>
              <th style={styles.th}>Actual gal</th>
              <th style={styles.th}>Planned lbs</th>
              <th style={styles.th}>Actual lbs</th>
              <th style={styles.th}>Temp °F</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = actualByComp[r.comp] ?? { actual_gallons: null, actual_lbs: null, temp_f: null };
              return (
                <tr key={r.comp}>
                  <td style={styles.td}>{r.comp}</td>
                  <td style={styles.td}>{r.productLabel}</td>
                  <td style={styles.td}>{r.planned_gal == null ? "—" : Math.round(r.planned_gal * 10) / 10}</td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={a.actual_gallons ?? ""}
                      onChange={(e) => setField(r.comp, "actual_gallons", e.target.value)}
                      style={{ width: 110 }}
                      className="rounded-[2px] border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                      disabled={busy}
                    />
                  </td>
                  <td style={styles.td}>{r.planned_lbs == null ? "—" : Math.round(r.planned_lbs)}</td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={a.actual_lbs ?? ""}
                      onChange={(e) => setField(r.comp, "actual_lbs", e.target.value)}
                      style={{ width: 110 }}
                      className="rounded-[2px] border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                      disabled={busy}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={a.temp_f ?? ""}
                      onChange={(e) => setField(r.comp, "temp_f", e.target.value)}
                      style={{ width: 90 }}
                      className="rounded-[2px] border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                      disabled={busy}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={styles.smallBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button aria-busy={!!(busy)} type="button" style={styles.doneBtn} onClick={onSubmit} disabled={busy}>
            {busy ? "Completing…" : "Complete Load"}
          </button>
        </div>
      </div>
    </FullscreenModal>
  );
}
