"use client";
// app/planner/components/access/AccessStepsHost.tsx
//
// One shared TerminalAccessSheet for the planner layout. Opens on
// openAccessSteps() from anywhere (dashboard strip, terminal list, Planner).
//
// From a load: if the driver has no access here (never carded, or access
// timed out 30+ days after expiring) the access steps start automatically and
// this load counts as the first training load. If steps are already underway
// the sheet opens so the driver can check off anything done since.

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { expiryStateFor } from "@/lib/expiry";
import { addDaysISO_ } from "../../utils/dates";
import { TerminalAccessSheet } from "./TerminalAccessSheet";
import { OPEN_ACCESS_STEPS_EVENT, invalidateAccess, type OpenAccessStepsDetail } from "./useAccessSteps";

// Loads count from a little before the steps start, so the load that
// started them counts as training load 1.
const START_LEAD_MS = 15 * 60 * 1000;

type CatalogRow = { terminal_id: string | number; terminal_name?: string | null; renewal_days?: number | null };

export function AccessStepsHost({ userId, companyId, onCardIssued }: {
  userId: string | null;
  companyId: string | null;
  onCardIssued: (terminalId: string) => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const { data: catalog } = useTerminalsCatalog();
  const [open, setOpen] = useState<{ terminalId: string; fromLoad: boolean } | null>(null);

  useEffect(() => {
    const onOpen = async (ev: Event) => {
      const d = (ev as CustomEvent<OpenAccessStepsDetail>).detail;
      if (!d?.terminalId) return;
      if (!d.fromLoad) { setOpen({ terminalId: d.terminalId, fromLoad: false }); return; }
      if (!userId) return;
      try {
        const t = ((catalog ?? []) as CatalogRow[]).find((x) => String(x.terminal_id) === d.terminalId);
        const renewal = Number(t?.renewal_days ?? 90) || 90;
        const prev = d.fromLoad.prevCardedOn ? String(d.fromLoad.prevCardedOn).slice(0, 10) : null;
        const state = prev ? expiryStateFor(addDaysISO_(prev, renewal), { access: true }) : "inactive";
        const noAccess = state === "inactive";
        const { data: existing } = await supabase.from("driver_terminal_qualifications")
          .select("id, completed_at").eq("user_id", userId).eq("terminal_id", d.terminalId).maybeSingle();
        const startedAt = new Date(Date.now() - START_LEAD_MS).toISOString();
        if (noAccess) {
          if (!existing) {
            await supabase.from("driver_terminal_qualifications")
              .insert({ user_id: userId, terminal_id: d.terminalId, company_id: companyId, started_at: startedAt });
          } else if (existing.completed_at) {
            // Access ran out: a new sequence. The stored letter stays on file.
            await supabase.from("driver_terminal_qualifications").update({
              started_at: startedAt, letter_id: null, letter_attached_at: null, media_done_at: null,
              registered_at: null, orientation_done_at: null, loads_adjust: 0, card_issued_at: null, completed_at: null,
            }).eq("id", existing.id);
          }
          await invalidateAccess(qc);
          setOpen({ terminalId: d.terminalId, fromLoad: true });
        } else if (existing && !existing.completed_at) {
          setOpen({ terminalId: d.terminalId, fromLoad: true });
        }
      } catch (e) {
        console.warn("access steps:", e instanceof Error ? e.message : e);
      }
    };
    window.addEventListener(OPEN_ACCESS_STEPS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ACCESS_STEPS_EVENT, onOpen);
  }, [userId, companyId, catalog, qc]);

  const name = open
    ? String(((catalog ?? []) as CatalogRow[]).find((x) => String(x.terminal_id) === open.terminalId)?.terminal_name ?? "Terminal")
    : "";

  return (
    <TerminalAccessSheet
      open={!!open}
      terminalId={open?.terminalId ?? null}
      terminalName={name}
      userId={userId}
      companyId={companyId}
      fromLoad={open?.fromLoad}
      onClose={() => setOpen(null)}
      onCardIssued={onCardIssued}
    />
  );
}
