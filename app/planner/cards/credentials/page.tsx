"use client";
// app/planner/cards/credentials/page.tsx — Credentials sub-tab (Cards tab rework, Phase 2)
//
// Government/regulatory credentials: driver's license, medical card, TWIC.
// Unlike Terminals/Badges (repeatable lists), a driver realistically has at
// most one of each -- three fixed landscape cards, each a "get or create by
// user_id" slot against its own table (driver_licenses/driver_medical_cards/
// driver_twic_cards, all already live with real data for the real account).
// Generated-look only, no photo upload (deferred, same as Badges).

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { formatMDY, formatMDYWithCountdown_ } from "../../utils/dates";
import WalletBack from "../WalletBack";
import { IdCardFace } from "../../components/wallet/IdCardFace";
import { WalletOverlay } from "../../components/wallet/WalletOverlay";
import { PhotoButton, uploadWalletPhoto, useSignedUrl } from "../../components/wallet/walletPhoto";
import { DateField } from "@/lib/ui/DateField";
import {
  cardStateFor, DARK_EXP_COLOR,
  fieldLabel, fieldInput, btnDanger,
  CARD_BG, CARD_BORDER,
} from "../cardTheme";

type LicenseRow = {
  id?: string;
  image_path?: string | null;
  license_class: string; license_number: string; state_code: string;
  endorsements: string[]; restrictions: string[];
  issue_date: string | null; expiration_date: string | null;
  hazmat_linked_to_license: boolean;
  hazmat_issue_date: string | null; hazmat_expiration_date: string | null;
};
type MedicalRow = {
  id?: string;
  image_path?: string | null;
  issue_date: string | null; expiration_date: string | null;
  examiner_name: string; attached_to_license: boolean;
};
type TwicRow = {
  id?: string;
  image_path?: string | null;
  card_number: string; issue_date: string | null; expiration_date: string | null;
};

const emptyLicense: LicenseRow = { license_class: "", license_number: "", state_code: "", endorsements: [], restrictions: [], issue_date: null, expiration_date: null, hazmat_linked_to_license: false, hazmat_issue_date: null, hazmat_expiration_date: null };
const emptyMedical: MedicalRow = { issue_date: null, expiration_date: null, examiner_name: "", attached_to_license: false };
const emptyTwic: TwicRow = { card_number: "", issue_date: null, expiration_date: null };

function BackFrame({ title, onDone, children }: { title: string; onDone: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      height: "100%", borderRadius: 2, overflow: "hidden", boxSizing: "border-box",
      background: CARD_BG,
      border: CARD_BORDER,
      boxShadow: "0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      <div style={{ background: "rgba(0,0,0,0.35)", padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{title}</div>
        <button type="button" onClick={onDone} style={{ border: "none", background: "none", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}>Done</button>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

type Ids = { companyId: string | null; userId: string | null };

function CredPhoto({ path, onPath, ids }: { path: string | null | undefined; onPath: (p: string | null) => void; ids: Ids }) {
  const src = useSignedUrl(path);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const take = async (f: File) => {
    if (!ids.companyId || !ids.userId) return;
    setBusy(true); setErr(null);
    try { onPath(await uploadWalletPhoto(f, ids.companyId, ids.userId)); } catch (e: any) { setErr(e?.message ?? "Couldn't upload the photo."); }
    setBusy(false);
  };
  return (
    <>
      {src && <img src={src} alt="Credential" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 2 }} />}
      <PhotoButton hasPhoto={!!path} busy={busy} onFile={(f) => void take(f)} onRemove={() => onPath(null)} />
      {err && <div style={{ fontSize: 12, color: "#f87171" }}>{err}</div>}
    </>
  );
}

const row2: React.CSSProperties = { display: "flex", gap: 8 };
const col: React.CSSProperties = { flex: 1, minWidth: 0 };
const checkboxRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" };

// ── License card ─────────────────────────────────────────────────────────────

function LicenseEditor({ value, onSave, onRemove, onClose, ids }: { value: LicenseRow | null; onSave: (v: LicenseRow) => void; onRemove: () => void; onClose: () => void; ids: Ids }) {
  const [draft, setDraft] = useState<LicenseRow>(value ?? emptyLicense);
  const [confirmRemove, setConfirmRemove] = useState(false);


  const handleDone = () => { onSave(draft); onClose(); };

  const back = (
    <BackFrame title="Edit Driver's License" onDone={handleDone}>
      <CredPhoto path={draft.image_path} onPath={(p) => setDraft((d) => ({ ...d, image_path: p }))} ids={ids} />
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Class</div><input type="text" value={draft.license_class} onChange={(e) => setDraft((d) => ({ ...d, license_class: e.target.value }))} style={fieldInput} /></div>
        <div style={col}><div style={fieldLabel}>State</div><input type="text" value={draft.state_code} onChange={(e) => setDraft((d) => ({ ...d, state_code: e.target.value.toUpperCase().slice(0, 2) }))} style={fieldInput} /></div>
      </div>
      <div><div style={fieldLabel}>License Number</div><input type="text" value={draft.license_number} onChange={(e) => setDraft((d) => ({ ...d, license_number: e.target.value }))} style={fieldInput} /></div>
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Issue Date</div><DateField value={draft.issue_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, issue_date: v || null }))} placeholder="Set date" /></div>
        <div style={col}><div style={fieldLabel}>Expiration</div><DateField value={draft.expiration_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, expiration_date: v || null }))} placeholder="Set date" /></div>
      </div>
      <div><div style={fieldLabel}>Endorsements (comma-separated)</div><input type="text" value={draft.endorsements.join(", ")} onChange={(e) => setDraft((d) => ({ ...d, endorsements: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} style={fieldInput} /></div>
      <div><div style={fieldLabel}>Restrictions (comma-separated)</div><input type="text" value={draft.restrictions.join(", ")} onChange={(e) => setDraft((d) => ({ ...d, restrictions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} style={fieldInput} /></div>
      <label style={checkboxRow}>
        <input type="checkbox" checked={draft.hazmat_linked_to_license} onChange={(e) => setDraft((d) => ({ ...d, hazmat_linked_to_license: e.target.checked }))} />
        Hazmat endorsement linked to this license
      </label>
      {draft.hazmat_linked_to_license && (
        <div style={row2}>
          <div style={col}><div style={fieldLabel}>Hazmat Issue</div><DateField value={draft.hazmat_issue_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, hazmat_issue_date: v || null }))} placeholder="Set date" /></div>
          <div style={col}><div style={fieldLabel}>Hazmat Exp</div><DateField value={draft.hazmat_expiration_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, hazmat_expiration_date: v || null }))} placeholder="Set date" /></div>
        </div>
      )}
      {value && (!confirmRemove ? (
        <button type="button" onClick={() => setConfirmRemove(true)} style={btnDanger}>Remove</button>
      ) : (
        <div style={{ padding: 8, borderRadius: 2, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Remove this license record?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { onRemove(); onClose(); }} style={{ ...btnDanger, flex: 1 }}>Yes</button>
            <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ))}
    </BackFrame>
  );

  return back;
}

// ── Medical card ──────────────────────────────────────────────────────────────

function MedicalEditor({ value, onSave, onRemove, onClose, ids }: { value: MedicalRow | null; onSave: (v: MedicalRow) => void; onRemove: () => void; onClose: () => void; ids: Ids }) {
  const [draft, setDraft] = useState<MedicalRow>(value ?? emptyMedical);
  const [confirmRemove, setConfirmRemove] = useState(false);


  const handleDone = () => { onSave(draft); onClose(); };

  const back = (
    <BackFrame title="Edit Medical Card" onDone={handleDone}>
      <CredPhoto path={draft.image_path} onPath={(p) => setDraft((d) => ({ ...d, image_path: p }))} ids={ids} />
      <div><div style={fieldLabel}>Examiner Name</div><input type="text" value={draft.examiner_name} onChange={(e) => setDraft((d) => ({ ...d, examiner_name: e.target.value }))} style={fieldInput} /></div>
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Issue Date</div><DateField value={draft.issue_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, issue_date: v || null }))} placeholder="Set date" /></div>
        <div style={col}><div style={fieldLabel}>Expiration</div><DateField value={draft.expiration_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, expiration_date: v || null }))} placeholder="Set date" /></div>
      </div>
      <label style={checkboxRow}>
        <input type="checkbox" checked={draft.attached_to_license} onChange={(e) => setDraft((d) => ({ ...d, attached_to_license: e.target.checked }))} />
        Attached to license
      </label>
      {value && (!confirmRemove ? (
        <button type="button" onClick={() => setConfirmRemove(true)} style={btnDanger}>Remove</button>
      ) : (
        <div style={{ padding: 8, borderRadius: 2, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Remove this medical card record?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { onRemove(); onClose(); }} style={{ ...btnDanger, flex: 1 }}>Yes</button>
            <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ))}
    </BackFrame>
  );

  return back;
}

// ── TWIC card ─────────────────────────────────────────────────────────────────

function TwicEditor({ value, onSave, onRemove, onClose, ids }: { value: TwicRow | null; onSave: (v: TwicRow) => void; onRemove: () => void; onClose: () => void; ids: Ids }) {
  const [draft, setDraft] = useState<TwicRow>(value ?? emptyTwic);
  const [confirmRemove, setConfirmRemove] = useState(false);


  const handleDone = () => { onSave(draft); onClose(); };

  const back = (
    <BackFrame title="Edit TWIC" onDone={handleDone}>
      <CredPhoto path={draft.image_path} onPath={(p) => setDraft((d) => ({ ...d, image_path: p }))} ids={ids} />
      <div><div style={fieldLabel}>Card Number</div><input type="text" value={draft.card_number} onChange={(e) => setDraft((d) => ({ ...d, card_number: e.target.value }))} style={fieldInput} /></div>
      <div style={row2}>
        <div style={col}><div style={fieldLabel}>Issue Date</div><DateField value={draft.issue_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, issue_date: v || null }))} placeholder="Set date" /></div>
        <div style={col}><div style={fieldLabel}>Expiration</div><DateField value={draft.expiration_date ?? ""} onChange={(v) => setDraft((d) => ({ ...d, expiration_date: v || null }))} placeholder="Set date" /></div>
      </div>
      {value && (!confirmRemove ? (
        <button type="button" onClick={() => setConfirmRemove(true)} style={btnDanger}>Remove</button>
      ) : (
        <div style={{ padding: 8, borderRadius: 2, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>Remove this TWIC record?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { onRemove(); onClose(); }} style={{ ...btnDanger, flex: 1 }}>Yes</button>
            <button type="button" onClick={() => setConfirmRemove(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ))}
    </BackFrame>
  );

  return back;
}

// ── Credentials sub-tab ───────────────────────────────────────────────────────

export default function CredentialsPage() {
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

  const [license, setLicense] = useState<(LicenseRow & { id: string }) | null | undefined>(undefined);
  const [medical, setMedical] = useState<(MedicalRow & { id: string }) | null | undefined>(undefined);
  const [twic, setTwic] = useState<(TwicRow & { id: string }) | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<null | "license" | "medical" | "twic">(null);
  const [holder, setHolder] = useState("");
  // Optional: lay the cards on their side (kept on this phone).
  const [landscape, setLandscape] = useState(false);
  useEffect(() => { try { setLandscape(localStorage.getItem("proTankr:credLandscape") === "1"); } catch { /* default */ } }, []);
  const setLand = (v: boolean) => { setLandscape(v); try { localStorage.setItem("proTankr:credLandscape", v ? "1" : "0"); } catch { /* ignore */ } };
  useEffect(() => {
    if (!targetUserId) return;
    void supabase.from("profiles").select("display_name").eq("user_id", targetUserId).maybeSingle().then(({ data }) => setHolder(((data as { display_name?: string | null } | null)?.display_name ?? "").trim()));
  }, [targetUserId]);

  useEffect(() => {
    if (!targetUserId) return;
    setLicense(undefined); setMedical(undefined); setTwic(undefined);
    (async () => {
      const [{ data: l, error: le }, { data: m, error: me }, { data: t, error: te }] = await Promise.all([
        supabase.from("driver_licenses").select("*").eq("user_id", targetUserId).maybeSingle(),
        supabase.from("driver_medical_cards").select("*").eq("user_id", targetUserId).maybeSingle(),
        supabase.from("driver_twic_cards").select("*").eq("user_id", targetUserId).maybeSingle(),
      ]);
      if (le || me || te) setError((le ?? me ?? te)?.message ?? "Failed to load credentials.");
      setLicense((l as any) ?? null);
      setMedical((m as any) ?? null);
      setTwic((t as any) ?? null);
    })();
  }, [targetUserId]);

  const saveLicense = async (v: LicenseRow) => {
    if (license?.id) {
      const { error: err } = await supabase.from("driver_licenses").update({ ...v, updated_at: new Date().toISOString() }).eq("id", license.id);
      if (err) { setError(err.message); return; }
      setLicense({ ...v, id: license.id });
    } else {
      const { data, error: err } = await supabase.from("driver_licenses").insert({ user_id: targetUserId, company_id: shell.companyId, ...v }).select("*").single();
      if (err) { setError(err.message); return; }
      setLicense(data as any);
    }
  };
  const removeLicense = async () => {
    if (!license?.id) return;
    const { error: err } = await supabase.from("driver_licenses").delete().eq("id", license.id);
    if (err) { setError(err.message); return; }
    setLicense(null);
  };

  const saveMedical = async (v: MedicalRow) => {
    if (medical?.id) {
      const { error: err } = await supabase.from("driver_medical_cards").update({ ...v, updated_at: new Date().toISOString() }).eq("id", medical.id);
      if (err) { setError(err.message); return; }
      setMedical({ ...v, id: medical.id });
    } else {
      const { data, error: err } = await supabase.from("driver_medical_cards").insert({ user_id: targetUserId, company_id: shell.companyId, ...v }).select("*").single();
      if (err) { setError(err.message); return; }
      setMedical(data as any);
    }
  };
  const removeMedical = async () => {
    if (!medical?.id) return;
    const { error: err } = await supabase.from("driver_medical_cards").delete().eq("id", medical.id);
    if (err) { setError(err.message); return; }
    setMedical(null);
  };

  const saveTwic = async (v: TwicRow) => {
    if (twic?.id) {
      const { error: err } = await supabase.from("driver_twic_cards").update({ ...v, updated_at: new Date().toISOString() }).eq("id", twic.id);
      if (err) { setError(err.message); return; }
      setTwic({ ...v, id: twic.id });
    } else {
      const { data, error: err } = await supabase.from("driver_twic_cards").insert({ user_id: targetUserId, company_id: shell.companyId, ...v }).select("*").single();
      if (err) { setError(err.message); return; }
      setTwic(data as any);
    }
  };
  const removeTwic = async () => {
    if (!twic?.id) return;
    const { error: err } = await supabase.from("driver_twic_cards").delete().eq("id", twic.id);
    if (err) { setError(err.message); return; }
    setTwic(null);
  };

  const ids: Ids = { companyId: shell.companyId ?? null, userId: targetUserId ?? null };
  const loading = license === undefined || medical === undefined || twic === undefined;

  return (
    <div>
      <WalletBack />
      {isDispatchContext && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Viewing <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>{driverName || "…"}</span>'s credentials.
        </div>
      )}
      {error && <div className="text-sm text-red-400 mb-3">{error}</div>}
      {loading ? (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "60px 20px" }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[{ v: false, l: "Portrait" }, { v: true, l: "Landscape" }].map((o) => (
              <button key={o.l} type="button" onClick={() => setLand(o.v)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 2, fontSize: 12, fontWeight: 800, cursor: "pointer", border: `1px solid ${landscape === o.v ? "#fff" : "rgba(255,255,255,0.15)"}`, background: landscape === o.v ? "#fff" : "transparent", color: landscape === o.v ? "#000" : "rgba(255,255,255,0.6)" }}>{o.l}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: landscape ? "1fr" : "1fr 1fr", gap: 12 }}>
            <IdCardFace landscape={landscape} empty={!license} header={`${holder || "Driver"} · License`} sub={license?.license_class ? `Class ${license.license_class}${license.state_code ? ` · ${license.state_code}` : ""}` : null}
              imagePath={license?.image_path} footer={license?.expiration_date ? formatMDY(license.expiration_date) : "No expiration"} footerColor={DARK_EXP_COLOR[cardStateFor(license?.expiration_date ?? null)]} onClick={() => setOpen("license")} />
            <IdCardFace landscape={landscape} empty={!medical} header={`${holder || "Driver"} · Medical`} sub={medical ? "Medical card" : null}
              imagePath={medical?.image_path} footer={medical?.expiration_date ? formatMDY(medical.expiration_date) : "No expiration"} footerColor={DARK_EXP_COLOR[cardStateFor(medical?.expiration_date ?? null)]} onClick={() => setOpen("medical")} />
            <IdCardFace landscape={landscape} empty={!twic} header={`${holder || "Driver"} · TWIC`} sub={twic ? "TWIC card" : null}
              imagePath={twic?.image_path} footer={twic?.expiration_date ? formatMDY(twic.expiration_date) : "No expiration"} footerColor={DARK_EXP_COLOR[cardStateFor(twic?.expiration_date ?? null)]} onClick={() => setOpen("twic")} />
          </div>
          <WalletOverlay open={!!open} onClose={() => setOpen(null)}>
            {open === "license" && <LicenseEditor key="l" value={license ?? null} onSave={saveLicense} onRemove={removeLicense} onClose={() => setOpen(null)} ids={ids} />}
            {open === "medical" && <MedicalEditor key="m" value={medical ?? null} onSave={saveMedical} onRemove={removeMedical} onClose={() => setOpen(null)} ids={ids} />}
            {open === "twic" && <TwicEditor key="t" value={twic ?? null} onSave={saveTwic} onRemove={removeTwic} onClose={() => setOpen(null)} ids={ids} />}
          </WalletOverlay>
        </>
      )}
    </div>
  );
}
