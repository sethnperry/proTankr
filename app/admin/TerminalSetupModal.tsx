"use client";
// app/admin/TerminalSetupModal.tsx
//
// Company Dashboard → Terminal Setup. Admin and dispatch. The answers to each terminal's access
// questions (training loads, video, letter, orientation) are shared by every driver; the first
// driver to load there answers them, and this is where they are corrected afterward.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { requirementsComplete, type AccessRequirements } from "@/lib/terminals/accessSteps";
import { TerminalAccessSheet } from "@/app/planner/components/access/TerminalAccessSheet";
import { invalidateAccess } from "@/app/planner/components/access/useAccessSteps";

const row: React.CSSProperties = {
  width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 2,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "#fff", cursor: "pointer",
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, boxSizing: "border-box", marginBottom: 12,
};

type Cat = { terminal_id: string | number; terminal_name?: string | null; city?: string | null; state?: string | null };

function summary(r: AccessRequirements | undefined): string {
  if (!r || !requirementsComplete(r)) return "Not answered yet";
  const parts = [`${r.training_loads_required} load${r.training_loads_required === 1 ? "" : "s"}`];
  if (r.has_training_media) parts.push("video");
  if (r.letter_required) parts.push("letter");
  if (r.has_orientation) parts.push("orientation");
  return parts.join(" · ");
}

export default function TerminalSetupModal({ open, onClose, userId, companyId }: {
  open: boolean; onClose: () => void; userId: string | null; companyId: string | null;
}) {
  const qc = useQueryClient();
  const { data: catalog = [] } = useTerminalsCatalog();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const { data: reqs = [] } = useQuery({
    queryKey: ["terminalSetupAnswers"],
    enabled: open,
    queryFn: async (): Promise<AccessRequirements[]> => {
      const { data, error } = await supabase.from("terminal_access_requirements").select("*");
      if (error) throw error;
      return (data ?? []) as AccessRequirements[];
    },
  });
  const byId = useMemo(() => new Map(reqs.map((r) => [String(r.terminal_id), r])), [reqs]);
  const cat = catalog as Cat[];
  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    const base = q
      ? cat.filter((t) => `${t.terminal_name ?? ""} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(q))
      : cat.filter((t) => byId.has(String(t.terminal_id)));
    return base.slice(0, 60);
  }, [cat, byId, q]);

  return (
    <>
      <FullscreenModal open={open} onClose={onClose} title="Terminal Setup">
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
          These answers are shared by every driver. Tap a terminal to change them, or search for one that hasn&apos;t been answered yet.
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search terminals" style={input} />
        {list.length === 0 && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>{q ? "No terminals match." : "No terminal has been set up yet."}</div>}
        {list.map((t) => {
          const id = String(t.terminal_id);
          return (
            <button key={id} type="button" style={row} onClick={() => setEditing({ id, name: t.terminal_name ?? "Terminal" })}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.terminal_name}{t.city ? ` · ${t.city}${t.state ? `, ${t.state}` : ""}` : ""}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{summary(byId.get(id))}</div>
            </button>
          );
        })}
      </FullscreenModal>
      <TerminalAccessSheet
        open={!!editing}
        terminalId={editing?.id ?? null}
        terminalName={editing?.name ?? ""}
        userId={userId}
        companyId={companyId}
        setupOnly
        editSetup
        onClose={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ["terminalSetupAnswers"] }); void invalidateAccess(qc); }}
        onCardIssued={() => {}}
      />
    </>
  );
}
