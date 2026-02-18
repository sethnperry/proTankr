"use client";

import React from "react";

type ComboRow = {
  combo_id: string | number;
  combo_name?: string | null;
  truck_id?: string | number | null;
  trailer_id?: string | number | null;
};

type Styles = {
  section: React.CSSProperties;
  badge: React.CSSProperties;
  error: React.CSSProperties;
  label: React.CSSProperties;
  select: React.CSSProperties;
  help: React.CSSProperties;
};

export default function EquipmentBar(props: {
  styles: Styles;

  combosLoading: boolean;
  combosError: string | null;
  combos: ComboRow[];

  selectedComboId: string;
  onChangeSelectedComboId: (nextId: string) => void;

  selectedCombo: ComboRow | null;
}) {
  const {
    styles,
    combosLoading,
    combosError,
    combos,
    selectedComboId,
    onChangeSelectedComboId,
    selectedCombo,
  } = props;

  return (
    <section style={styles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Equipment</h2>
        <span style={styles.badge}>{combosLoading ? "Loading…" : `${combos.length} combos`}</span>
      </div>

      {combosError && <div style={styles.error}>Error loading equipment: {combosError}</div>}

      <div style={{ marginTop: 10 }}>
        <label style={styles.label}>Truck + Trailer</label>
        <select
          value={selectedComboId}
          onChange={(e) => onChangeSelectedComboId(e.target.value)}
          style={{ ...styles.select, width: 420, maxWidth: "100%" }}
          disabled={combosLoading || combos.length === 0}
        >
          <option value="">Select…</option>
          {combos.map((c) => (
            <option key={String(c.combo_id)} value={String(c.combo_id)}>
              {c.combo_name ? c.combo_name : `Truck ${c.truck_id ?? "?"} + Trailer ${c.trailer_id ?? "?"}`}
            </option>
          ))}
        </select>

        {selectedCombo && (
          <div style={styles.help}>
            Selected:{" "}
            <strong>
              {selectedCombo.combo_name ?? `${selectedCombo.truck_id ?? "?"} / ${selectedCombo.trailer_id ?? "?"}`}
            </strong>
          </div>
        )}
      </div>
    </section>
  );
}
