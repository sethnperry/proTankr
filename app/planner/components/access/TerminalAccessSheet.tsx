"use client";
// app/planner/components/access/TerminalAccessSheet.tsx
//
// The steps to get access at one terminal, for one driver. Opened from the
// Planner when a load starts at a terminal with no access (or one already in
// progress), from the dashboard's access strip, and from the terminal list.
//
// If nobody has said what this terminal requires yet, it asks: training loads
// (including the final check load with an operator), video or PowerPoint,
// new-user web address, company letter (and when it's needed), onsite
// orientation (days and times). Answers are shared with every driver. Then
// it asks for the company authorization letter, which stays with the driver
// and can be reused at other terminals.
//
// Steps can be checked off in any order. Training loads count the driver's
// completed loads here since the steps started; the count can be adjusted.

import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import {
  accessSteps, loadsDone as countDone, requirementsComplete,
  type AccessRequirements, type AccessStep, type LetterDue,
} from "@/lib/terminals/accessSteps";
import { invalidateAccess, useTerminalAccessDetail, type AuthorizationLetter } from "./useAccessSteps";

const BUCKET = "equipment-docs";
const MUTED = "rgba(255,255,255,0.55)";
const FAINT = "rgba(255,255,255,0.32)";
const BORDER = "1px solid rgba(255,255,255,0.12)";
const AMBER = "#fbbf24";

const btn: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 2, border: BORDER, background: "rgba(255,255,255,0.05)",
  color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left",
};
const primary: React.CSSProperties = { ...btn, background: "#fff", color: "#000", textAlign: "center", border: "1px solid #fff" };
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 2, border: BORDER,
  background: "rgba(0,0,0,0.35)", color: "#fff", fontSize: 16,
};
const qText: React.CSSProperties = { fontSize: 18, fontWeight: 800, lineHeight: 1.3, marginBottom: 14 };

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
}

function ensureUrl(u: string) {
  const t = u.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

async function viewLetter(l: AuthorizationLetter) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(l.file_path, 300);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

type Draft = {
  loads: string;
  media: boolean | null; mediaUrl: string;
  newUserUrl: string;
  letter: boolean | null; letterDue: LetterDue;
  orientation: boolean | null; schedule: string;
};

const draftFrom = (r: AccessRequirements | null): Draft => ({
  loads: r?.training_loads_required != null ? String(r.training_loads_required) : "",
  media: r?.has_training_media ?? null, mediaUrl: r?.training_media_url ?? "",
  newUserUrl: r?.new_user_url ?? "",
  letter: r?.letter_required ?? null, letterDue: r?.letter_due ?? "unknown",
  orientation: r?.has_orientation ?? null, schedule: r?.orientation_schedule ?? "",
});

const QUESTIONS = 5;

export function TerminalAccessSheet({
  open, terminalId, terminalName, userId, companyId, fromLoad, onClose, onCardIssued,
}: {
  open: boolean;
  terminalId: string | null;
  terminalName: string;
  userId: string | null;
  companyId: string | null;
  fromLoad?: boolean;
  onClose: () => void;
  onCardIssued: (terminalId: string) => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useTerminalAccessDetail(open ? terminalId : null, userId);
  const req = data?.req ?? null;
  const prog = data?.prog ?? null;
  const letters = data?.letters ?? [];

  const [mode, setMode] = useState<"steps" | "setup" | "letter" | "loads" | "card">("steps");
  const [q, setQ] = useState(0);
  const [draft, setDraft] = useState<Draft>(draftFrom(null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [initFor, setInitFor] = useState<string | null>(null);

  // First open for a terminal: ask the setup questions if they aren't answered.
  useEffect(() => {
    if (!open) { setInitFor(null); return; }
    if (!data || !terminalId || initFor === terminalId) return;
    setInitFor(terminalId);
    setErr(null);
    setDraft(draftFrom(data.req));
    if (!requirementsComplete(data.req)) { setQ(0); setMode("setup"); }
    else setMode("steps");
  }, [open, data, terminalId, initFor]);

  const loadsCompleted = data?.loadsCompleted ?? 0;
  const steps: AccessStep[] = useMemo(
    () => (requirementsComplete(req) ? accessSteps(req, prog, loadsCompleted) : []),
    [req, prog, loadsCompleted],
  );
  const loadsRequired = Math.max(1, Number(req?.training_loads_required ?? 1) || 1);
  const done = countDone(prog, loadsCompleted);
  const letter = letters.find((l) => l.id === prog?.letter_id) ?? null;

  const refresh = () => invalidateAccess(qc);

  async function run(fn: () => Promise<void>): Promise<boolean> {
    setBusy(true); setErr(null);
    try { await fn(); await refresh(); return true; }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "Couldn't save.")); return false; }
    finally { setBusy(false); }
  }

  async function ensureProgress(): Promise<string> {
    if (prog) return prog.id;
    const { data: row, error: e } = await supabase.from("driver_terminal_qualifications")
      .insert({ user_id: userId, terminal_id: terminalId, company_id: companyId })
      .select("id").single();
    if (e) throw e;
    return String(row.id);
  }

  async function patchProgress(patch: Record<string, unknown>) {
    const id = await ensureProgress();
    const { error: e } = await supabase.from("driver_terminal_qualifications").update(patch).eq("id", id);
    if (e) throw e;
  }

  async function saveRequirements() {
    const loads = Math.round(Number(draft.loads));
    if (!Number.isFinite(loads) || loads < 1 || loads > 50) { setErr("Enter how many loads, 1 to 50."); setQ(0); return; }
    const ok = await run(async () => {
      const row = {
        terminal_id: terminalId,
        training_loads_required: loads,
        has_training_media: !!draft.media,
        training_media_url: draft.media && draft.mediaUrl.trim() ? ensureUrl(draft.mediaUrl) : null,
        new_user_url: draft.newUserUrl.trim() ? ensureUrl(draft.newUserUrl) : null,
        letter_required: draft.letter !== false,
        letter_due: draft.letter === false ? null : draft.letterDue,
        has_orientation: !!draft.orientation,
        orientation_schedule: draft.orientation && draft.schedule.trim() ? draft.schedule.trim() : null,
      };
      const { error: e } = await supabase.from("terminal_access_requirements").upsert(row, { onConflict: "terminal_id" });
      if (e) throw e;
      if (fromLoad) await ensureProgress();
    });
    if (!ok) return;
    const needsLetter = draft.letter !== false && !prog?.letter_attached_at;
    setMode(needsLetter && (fromLoad || prog) ? "letter" : "steps");
  }

  async function attachLetter(l: AuthorizationLetter) {
    if (await run(() => patchProgress({ letter_id: l.id, letter_attached_at: new Date().toISOString() }))) setMode("steps");
  }

  async function uploadLetter(file: File) {
    if (!companyId || !userId) { setErr("No company on file."); return; }
    const ok = await run(async () => {
      const id = crypto.randomUUID();
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${companyId}/authorization_letters/${userId}/${id}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) throw up.error;
      const ins = await supabase.from("driver_authorization_letters").insert({
        id, user_id: userId, company_id: companyId, file_path: path, original_name: file.name, mime_type: file.type || null,
      });
      if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); throw ins.error; }
      await patchProgress({ letter_id: id, letter_attached_at: new Date().toISOString() });
    });
    if (ok) setMode("steps");
  }

  async function toggle(field: "media_done_at" | "registered_at" | "orientation_done_at", isDone: boolean) {
    await run(() => patchProgress({ [field]: isDone ? null : new Date().toISOString() }));
  }

  async function issueCard() {
    if (!terminalId) return;
    const ok = await run(async () => {
      const now = new Date().toISOString();
      await patchProgress({ card_issued_at: now, completed_at: now });
      await onCardIssued(terminalId);
    });
    if (ok) setMode("steps");
  }

  async function stopTracking() {
    if (!prog) return;
    const ok = await run(async () => {
      const { error: e } = await supabase.from("driver_terminal_qualifications").delete().eq("id", prog.id);
      if (e) throw e;
    });
    if (ok) onClose();
  }

  const title = mode === "setup" ? "Terminal Access Setup" : mode === "letter" ? "Company Letter" : "Access Steps";

  // ── Setup questions ───────────────────────────────────────────────────────
  const yesNo = (value: boolean | null, set: (v: boolean) => void) => (
    <div style={{ display: "flex", gap: 8 }}>
      {[true, false].map((v) => (
        <button key={String(v)} type="button" onClick={() => set(v)}
          style={{ ...btn, textAlign: "center", flex: 1, background: value === v ? "#fff" : btn.background, color: value === v ? "#000" : "#fff" }}>
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );

  const setupBody = () => {
    const nextBtn = (canNext: boolean) => (
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {q > 0 && <button type="button" onClick={() => setQ(q - 1)} style={{ ...btn, textAlign: "center", width: 110 }}>Back</button>}
        <button aria-busy={!!(busy)} type="button" disabled={!canNext || busy} onClick={() => (q < QUESTIONS - 1 ? setQ(q + 1) : void saveRequirements())}
          style={{ ...primary, flex: 1, opacity: canNext && !busy ? 1 : 0.4 }}>
          {q < QUESTIONS - 1 ? "Next" : busy ? "Saving…" : "Save"}
        </button>
      </div>
    );
    return (
      <div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>
          {terminalName} · Question {q + 1} of {QUESTIONS}
        </div>
        <div style={{ fontSize: 13, color: FAINT, marginBottom: 18 }}>
          Your answers set up this terminal for every driver.
        </div>
        {q === 0 && (<>
          <div style={qText}>How many training loads are required, including the final check load with an operator?</div>
          <input type="number" inputMode="numeric" min={1} max={50} value={draft.loads} autoFocus
            onChange={(e) => setDraft({ ...draft, loads: e.target.value })} style={input} placeholder="e.g. 3" />
          {nextBtn(Number(draft.loads) >= 1)}
        </>)}
        {q === 1 && (<>
          <div style={qText}>Is there a training video or PowerPoint?</div>
          {yesNo(draft.media, (v) => setDraft({ ...draft, media: v }))}
          {draft.media && (
            <input value={draft.mediaUrl} onChange={(e) => setDraft({ ...draft, mediaUrl: e.target.value })}
              style={{ ...input, marginTop: 12 }} placeholder="Link, if there is one (optional)" inputMode="url" />
          )}
          {nextBtn(draft.media != null)}
        </>)}
        {q === 2 && (<>
          <div style={qText}>What is the web address for new users?</div>
          <input value={draft.newUserUrl} onChange={(e) => setDraft({ ...draft, newUserUrl: e.target.value })}
            style={input} placeholder="Leave blank if there isn't one" inputMode="url" />
          {nextBtn(true)}
        </>)}
        {q === 3 && (<>
          <div style={qText}>Is a company authorization letter required?</div>
          {yesNo(draft.letter, (v) => setDraft({ ...draft, letter: v }))}
          {draft.letter && (<>
            <div style={{ fontSize: 14, fontWeight: 700, margin: "18px 0 8px" }}>When is it needed?</div>
            <div style={{ display: "grid", gap: 8 }}>
              {([
                ["before_first_load", "Before the first load"],
                ["before_check_load", "Before the check load"],
                ["before_card", "Before the card is issued"],
                ["unknown", "Not sure"],
              ] as [LetterDue, string][]).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setDraft({ ...draft, letterDue: k })}
                  style={{ ...btn, background: draft.letterDue === k ? "#fff" : btn.background, color: draft.letterDue === k ? "#000" : "#fff" }}>
                  {label}
                </button>
              ))}
            </div>
          </>)}
          {nextBtn(draft.letter != null)}
        </>)}
        {q === 4 && (<>
          <div style={qText}>Is there an onsite orientation?</div>
          {yesNo(draft.orientation, (v) => setDraft({ ...draft, orientation: v }))}
          {draft.orientation && (
            <textarea value={draft.schedule} onChange={(e) => setDraft({ ...draft, schedule: e.target.value })}
              style={{ ...input, marginTop: 12, minHeight: 80, fontFamily: "inherit" }}
              placeholder="What days and times? e.g. Mon–Thu 8:00 and 1:00" />
          )}
          {nextBtn(draft.orientation != null)}
        </>)}
      </div>
    );
  };

  // ── Letter ────────────────────────────────────────────────────────────────
  const letterBody = () => (
    <div>
      <div style={qText}>
        {letters.length > 0 ? "Attach the stored company authorization letter? Or attach a new letter?" : "Upload your company authorization letter."}
      </div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
        The letter stays with you and can be used at other terminals.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {letters.map((l) => (
          <div key={l.id} style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => void attachLetter(l)} style={{ ...btn, flex: 1 }}>
              Attach stored letter
              <div style={{ fontSize: 12, fontWeight: 500, color: MUTED, marginTop: 3 }}>
                {l.original_name ?? "Letter"} · {fmtDate(l.created_at)}
              </div>
            </button>
            <button type="button" onClick={() => void viewLetter(l)} style={{ ...btn, width: 72, textAlign: "center" }}>View</button>
          </div>
        ))}
        <label style={{ ...(letters.length ? btn : primary), display: "block", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Uploading…" : letters.length ? "Attach a new letter" : "Choose letter (photo or PDF)"}
          <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadLetter(f); }} />
        </label>
        <button type="button" onClick={() => setMode("steps")} style={{ ...btn, textAlign: "center", color: MUTED }}>Not now</button>
      </div>
    </div>
  );

  // ── Steps ─────────────────────────────────────────────────────────────────
  const stepAction = (s: AccessStep): { sub?: string; onTap?: () => void; link?: string } => {
    const isDone = s.state === "done";
    if (s.key === "letter") return {
      sub: letter ? `${letter.original_name ?? "Letter"} · tap to change` : s.state === "blocked" ? "Needed first" : "Tap to attach",
      onTap: () => setMode("letter"),
    };
    if (s.key === "media") return {
      sub: isDone ? `Done ${fmtDate(prog?.media_done_at)}` : "Tap when done",
      onTap: () => void toggle("media_done_at", isDone), link: req?.training_media_url ?? undefined,
    };
    if (s.key === "register") return {
      sub: isDone ? `Done ${fmtDate(prog?.registered_at)}` : req?.new_user_url ?? "",
      onTap: () => void toggle("registered_at", isDone), link: req?.new_user_url ?? undefined,
    };
    if (s.key === "orientation") return {
      sub: isDone ? `Done ${fmtDate(prog?.orientation_done_at)}` : req?.orientation_schedule || "Tap when done",
      onTap: () => void toggle("orientation_done_at", isDone),
    };
    if (s.key === "card") return {
      sub: isDone ? `Issued ${fmtDate(prog?.card_issued_at)}` : s.state === "blocked" ? "Letter needed first" : "Tap when your card is issued",
      onTap: isDone ? undefined : () => setMode("card"),
    };
    return { sub: s.state === "blocked" ? "Letter needed first" : undefined, onTap: () => setMode("loads") };
  };

  const mark = (s: AccessStep) => (s.state === "done" ? "✓" : s.state === "next" ? "›" : s.state === "blocked" ? "!" : "○");

  const stepsBody = () => {
    if (!requirementsComplete(req)) {
      return (
        <div>
          <div style={qText}>Nobody has set up {terminalName} yet.</div>
          <button type="button" style={primary} onClick={() => { setDraft(draftFrom(req)); setQ(0); setMode("setup"); }}>Answer a few questions</button>
        </div>
      );
    }
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>{terminalName}</div>
          {prog && <div style={{ fontSize: 13, color: MUTED }}>{steps.filter((s) => s.state === "done").length}/{steps.length} steps</div>}
        </div>
        {fromLoad && prog && !prog.completed_at && (
          <div style={{ marginTop: 10, padding: "10px 12px", border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", borderRadius: 2, fontSize: 14 }}>
            {done + 1 >= loadsRequired
              ? "This load counts as the check load. An operator needs to be with you."
              : `This load counts as training load ${done + 1} of ${loadsRequired}.`}
          </div>
        )}
        {prog?.completed_at && (
          <div style={{ marginTop: 10, fontSize: 14, color: MUTED }}>Card issued {fmtDate(prog.card_issued_at)}. Access is tracked on your terminal card now.</div>
        )}
        {!prog && (
          <button aria-busy={!!(busy)} type="button" style={{ ...primary, marginTop: 14 }} disabled={busy}
            onClick={() => void run(async () => { await ensureProgress(); })}>
            {busy ? "Starting…" : "Start access steps"}
          </button>
        )}
        <div style={{ marginTop: 14, borderTop: BORDER }}>
          {steps.map((s) => {
            const a = stepAction(s);
            const color = s.state === "done" ? MUTED : s.state === "blocked" ? AMBER : "#fff";
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: BORDER }}>
                <button type="button" disabled={!prog || !a.onTap || busy} onClick={a.onTap}
                  style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, padding: "13px 0", background: "none", border: "none", color: "#fff", textAlign: "left", cursor: prog && a.onTap ? "pointer" : "default" }}>
                  <span style={{ width: 22, textAlign: "center", fontWeight: 800, fontSize: 16, color: s.state === "done" ? "#fff" : color }}>{mark(s)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 700, color, textDecoration: s.state === "done" ? "line-through" : undefined }}>{s.label}</span>
                    {a.sub && <span style={{ display: "block", fontSize: 12, color: s.state === "blocked" ? AMBER : MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.sub}</span>}
                  </span>
                </button>
                {a.link && (
                  <a href={a.link} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 13, fontWeight: 700, color: "#fff", border: BORDER, borderRadius: 2, padding: "6px 10px", textDecoration: "none" }}>
                    Open
                  </a>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 16, fontSize: 13 }}>
          <button type="button" onClick={() => { setDraft(draftFrom(req)); setQ(0); setMode("setup"); }}
            style={{ background: "none", border: "none", color: MUTED, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
            Edit terminal steps
          </button>
          {prog && !prog.completed_at && (
            <button type="button" onClick={() => setMode("card")}
              style={{ background: "none", border: "none", color: MUTED, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
              I already have a card here
            </button>
          )}
          {prog && (
            <button type="button" onClick={() => { if (window.confirm("Stop tracking access steps here?")) void stopTracking(); }}
              style={{ background: "none", border: "none", color: MUTED, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
              Stop tracking
            </button>
          )}
        </div>
        {req?.updated_at && <div style={{ marginTop: 12, fontSize: 11, color: FAINT }}>Terminal steps last updated {fmtDate(req.updated_at)}</div>}
      </div>
    );
  };

  const loadsBody = () => (
    <div>
      <div style={qText}>Training loads at {terminalName}</div>
      <div style={{ fontSize: 14, color: MUTED, marginBottom: 16 }}>
        {loadsRequired} required, the last one a check load with an operator. The app counted {loadsCompleted} completed load{loadsCompleted === 1 ? "" : "s"} here since you started. Adjust if you did loads before the app.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", margin: "10px 0 20px" }}>
        <button type="button" disabled={busy || done <= 0} onClick={() => void run(() => patchProgress({ loads_adjust: Number(prog?.loads_adjust ?? 0) - 1 }))}
          style={{ ...btn, width: 60, textAlign: "center", fontSize: 22 }}>−</button>
        <div style={{ fontSize: 34, fontWeight: 800, minWidth: 90, textAlign: "center" }}>{done}<span style={{ fontSize: 18, color: MUTED }}>/{loadsRequired}</span></div>
        <button type="button" disabled={busy} onClick={() => void run(() => patchProgress({ loads_adjust: Number(prog?.loads_adjust ?? 0) + 1 }))}
          style={{ ...btn, width: 60, textAlign: "center", fontSize: 22 }}>+</button>
      </div>
      <button type="button" style={primary} onClick={() => setMode("steps")}>Done</button>
    </div>
  );

  const cardBody = () => (
    <div>
      <div style={qText}>Card issued at {terminalName}?</div>
      <div style={{ fontSize: 14, color: MUTED, marginBottom: 18 }}>
        This finishes the access steps and starts your access here today.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <button aria-busy={!!(busy)} type="button" style={primary} disabled={busy} onClick={() => void issueCard()}>{busy ? "Saving…" : "Yes, card issued"}</button>
        <button type="button" style={{ ...btn, textAlign: "center" }} onClick={() => setMode("steps")}>Cancel</button>
      </div>
    </div>
  );

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      <div style={{ color: "#fff", padding: "4px 2px 24px" }}>
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {error ? <div style={{ color: "#f87171", fontSize: 14 }}>{error instanceof Error ? error.message : "Couldn't load."}</div>
          : isLoading || !data ? <div style={{ color: MUTED, fontSize: 14 }}>Loading…</div>
          : mode === "setup" ? setupBody()
          : mode === "letter" ? letterBody()
          : mode === "loads" ? loadsBody()
          : mode === "card" ? cardBody()
          : stepsBody()}
      </div>
    </FullscreenModal>
  );
}
