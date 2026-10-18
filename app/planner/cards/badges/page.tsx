"use client";
// app/planner/cards/badges/page.tsx — Badges sub-tab (Cards tab rework, Phase 2)
//
// Renamed/broadened from "Ports" -- a driver may carry facility-access
// badges beyond port terminals (rail yard, refinery, other), so this is a
// free-text "category" alongside the existing driver_port_ids.port_name/
// expiration_date (category column added by
// supabase/migrations/20260727000000_badges_category.sql). Portrait card
// shape, generated-look only (no photo upload -- deferred per prior
// decision). Personal to the driver, not shared with the company, same as
// Credentials.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { formatMDY, formatMDYWithCountdown_ } from "../../utils/dates";
import CardsSubTabs from "../CardsSubTabs";
import FlippableCard from "../FlippableCard";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import {
  cardStateFor, matchesFilter, FILTERS, DARK_EXP_COLOR,
  fieldLabel, fieldInput, btnDanger,
  CARD_BG, CARD_BORDER,
  type FilterKey,
} from "../cardTheme";

type BadgeRow = {
  id: string;
  port_name: string;
  category: string | null;
  expiration_date: string | null;
};

const CATEGORY_SUGGESTIONS = ["Port", "Rail Yard", "Refinery", "Other"];

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// ── Portrait badge card (front + back) ──────────────────────────────────────

function BadgeCard({
  badge, isFlipped, onFlipOpen, onFlipClose, onSave, onRemove,
}: {
  badge: BadgeRow;
  isFlipped: boolean;
  onFlipOpen: () => void;
  onFlipClose: () => void;
  onSave: (patch: { port_name: string; category: string | null; expiration_date: string | null }) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(badge.port_name);
  const [category, setCategory] = useState(badge.category ?? "");
  const [expiration, setExpiration] = useState(badge.expiration_date ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (isFlipped) {
      setName(badge.port_name);
      setCategory(badge.category ?? "");
      setExpiration(badge.expiration_date ?? "");
      setConfirmRemove(false);
    }
  }, [isFlipped, badge]);

  const state = cardStateFor(badge.expiration_date);
  const inactive = state === "inactive";

  const handleDone = () => {
    onSave({ port_name: name.trim() || badge.port_name, category: category.trim() || null, expiration_date: expiration || null });
    onFlipClose();
  };

  const front = (
    <div style={{
      height: "100%", borderRadius: 2, padding: 14, boxSizing: "border-box",
      background: CARD_BG, border: CARD_BORDER,
      boxShadow: "0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" as const,
      aspectRatio: "3 / 4",
      opacity: inactive ? 0.55 : 1, filter: inactive ? "grayscale(0.5)" : "none",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.7)", marginTop: 6,
      }}>
        {initialsFor(badge.port_name)}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, width: "100%" }}>
        {badge.port_name}
      </div>
      {badge.category && (
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.08)", borderRadius: 2, padding: "2px 8px", marginTop: 6, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
          {badge.category}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {inactive && (
        <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)", borderRadius: 2, padding: "2px 6px", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 6 }}>
          Inactive
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 800, color: DARK_EXP_COLOR[state] }}>
        {badge.expiration_date ? formatMDY(badge.expiration_date) : "No expiration"}
      </div>
    </div>
  );

  const back = (
    <div style={{
      height: "100%", borderRadius: 2, overflow: "hidden", boxSizing: "border-box",
      background: CARD_BG, border: CARD_BORDER,
      boxShadow: "0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      <div style={{ background: "rgba(0,0,0,0.35)", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>Edit Badge</div>
        <button type="button" onClick={handleDone} style={{ border: "none", background: "none", color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "3px 5px" }}>Done</button>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
        <div>
          <div style={fieldLabel}>Name</div>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={fieldInput} />
        </div>
        <div>
          <div style={fieldLabel}>Category</div>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Port, Rail Yard…" style={fieldInput} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginTop: 5 }}>
            {CATEGORY_SUGGESTIONS.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: category === c ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={fieldLabel}>Expiration</div>
          <input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} style={fieldInput} />
        </div>
        {!confirmRemove ? (
          <button type="button" onClick={() => setConfirmRemove(true)} style={{ ...btnDanger, width: "100%", marginTop: 2 }}>Remove</button>
        ) : (
          <div style={{ padding: 8, borderRadius: 2, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Remove this badge?</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={onRemove} style={{ ...btnDanger, flex: 1, padding: "8px 0" }}>Yes</button>
              <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return <FlippableCard flipped={isFlipped} onFlipToBack={onFlipOpen} front={front} back={back} />;
}

// ── Add Badge sheet ──────────────────────────────────────────────────────────

function AddBadgeSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (v: { port_name: string; category: string | null; expiration_date: string | null }) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [expiration, setExpiration] = useState("");

  const reset = () => { setName(""); setCategory(""); setExpiration(""); };

  return (
    <FullscreenModal open={open} title="Add Badge" onClose={() => { onClose(); reset(); }} footer={null}>
      <div className="space-y-3">
        <div>
          <div className="text-xs text-white/40 mb-1 font-medium">Name</div>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Port Everglades" className="w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30" autoFocus />
        </div>
        <div>
          <div className="text-xs text-white/40 mb-1 font-medium">Category (optional)</div>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Port, Rail Yard, Refinery…" className="w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 6 }}>
            {CATEGORY_SUGGESTIONS.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} className="text-xs font-semibold px-2.5 py-1 rounded-full border border-white/15 text-white/60" style={{ background: category === c ? "rgba(255,255,255,0.12)" : "transparent" }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/40 mb-1 font-medium">Expiration (optional)</div>
          <input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} className="w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
        </div>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => { onAdd({ port_name: name.trim(), category: category.trim() || null, expiration_date: expiration || null }); onClose(); reset(); }}
          className="w-full rounded-[2px] border border-white/15 bg-white/90 py-2.5 text-sm font-bold text-black disabled:opacity-40"
        >
          Add Badge
        </button>
      </div>
    </FullscreenModal>
  );
}

// ── Badges sub-tab ────────────────────────────────────────────────────────────

export default function BadgesPage() {
  const shell = useCalculatorShell();
  const { effectiveUserId } = shell;

  // Contextual for dispatch/admin viewing a selected driver -- see
  // cards/page.tsx's own header comment for the full rationale (cards
  // should look identical for every role, only whose data differs).
  const isDispatchContext = (shell.role === "dispatch" || shell.role === "admin" || shell.isSuperAdmin) && Boolean(shell.selectedDriverId);
  const targetUserId = isDispatchContext ? shell.selectedDriverId : effectiveUserId;
  const [driverName, setDriverName] = useState("");

  useEffect(() => {
    if (!isDispatchContext || !shell.selectedDriverId) { setDriverName(""); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [shell.selectedDriverId] });
      if (!cancelled) setDriverName((data ?? [])[0]?.display_name ?? "this driver");
    })();
    return () => { cancelled = true; };
  }, [isDispatchContext, shell.selectedDriverId]);

  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    if (!targetUserId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("driver_port_ids")
      .select("id, port_name, category, expiration_date")
      .eq("user_id", targetUserId)
      .order("expiration_date", { ascending: true, nullsFirst: false });
    if (err) setError(err.message);
    else setBadges((data ?? []) as BadgeRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [targetUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () => badges.filter((b) => matchesFilter(cardStateFor(b.expiration_date), filter)),
    [badges, filter]
  );

  const handleSave = async (id: string, patch: { port_name: string; category: string | null; expiration_date: string | null }) => {
    setBadges((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const { error: err } = await supabase.from("driver_port_ids").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (err) setError(err.message);
  };

  const handleRemove = async (id: string) => {
    setBadges((prev) => prev.filter((b) => b.id !== id));
    setFlippedId(null);
    const { error: err } = await supabase.from("driver_port_ids").delete().eq("id", id);
    if (err) setError(err.message);
  };

  const handleAdd = async (v: { port_name: string; category: string | null; expiration_date: string | null }) => {
    const { data, error: err } = await supabase
      .from("driver_port_ids")
      .insert({ user_id: targetUserId, company_id: shell.companyId, ...v })
      .select("id, port_name, category, expiration_date")
      .single();
    if (err) { setError(err.message); return; }
    setBadges((prev) => [...prev, data as BadgeRow]);
  };

  return (
    <div>
      <CardsSubTabs />

      {isDispatchContext && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Viewing <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>{driverName || "…"}</span>'s badges.
        </div>
      )}

      {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

      {!loading && badges.length === 0 ? (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "60px 20px", lineHeight: 1.5 }}>
          {isDispatchContext
            ? <>No badges yet for {driverName || "this driver"}.</>
            : <>No badges yet.<br />Add a facility-access badge to keep track of its expiration.</>}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <CustomSelect
              value={filter}
              onChange={(v) => setFilter(v as FilterKey)}
              options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
              buttonStyle={{ padding: "6px 10px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map((b) => (
              <BadgeCard
                key={b.id}
                badge={b}
                isFlipped={flippedId === b.id}
                onFlipOpen={() => setFlippedId(b.id)}
                onFlipClose={() => setFlippedId(null)}
                onSave={(patch) => handleSave(b.id, patch)}
                onRemove={() => handleRemove(b.id)}
              />
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        style={{
          width: "100%", marginTop: 18, padding: "13px 0", borderRadius: 2,
          border: "1px dashed rgba(255,255,255,0.20)", background: "transparent",
          color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}
      >
        + Add Badge
      </button>

      <AddBadgeSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAdd} />
    </div>
  );
}
