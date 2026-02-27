// lib/ui/driver/DriverProfileModal.tsx
"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { T, css, fmtDate } from "./tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "./primitives";
import { PortIdEditor, TerminalAccessEditor } from "./editors";
import type { Member, DriverProfile } from "./types";

export function DriverProfileModal({ member, companyId, supabase, onClose, onDone, onRemove }: {
  member: Member;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void;
  onDone: () => void;
  onRemove?: () => void; // optional — omit on ProfilePage to hide Remove User button
}) {
  const [profile,  setProfile]  = useState<DriverProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  // Profile fields
  const [displayName,    setDisplayName]    = useState(member.display_name ?? "");
  const [hireDate,       setHireDate]       = useState(member.hire_date ?? "");
  const [division,       setDivision]       = useState(member.division ?? "");
  const [region,         setRegion]         = useState(member.region ?? "");
  const [localArea,      setLocalArea]      = useState(member.local_area ?? "");
  const [employeeNumber, setEmployeeNumber] = useState(member.employee_number ?? "");

  // License
  const [licClass,    setLicClass]    = useState("");
  const [licEndorse,  setLicEndorse]  = useState("");
  const [licRestrict, setLicRestrict] = useState("");
  const [licNumber,   setLicNumber]   = useState("");
  const [licIssue,    setLicIssue]    = useState("");
  const [licExpiry,   setLicExpiry]   = useState("");
  const [licState,    setLicState]    = useState("");

  // Medical
  const [medIssue,         setMedIssue]         = useState("");
  const [medExpiry,        setMedExpiry]        = useState("");
  const [medExaminer,      setMedExaminer]      = useState("");
  const [medAttachedToLic, setMedAttachedToLic] = useState(false);

  // TWIC
  const [twicNumber, setTwicNumber] = useState("");
  const [twicIssue,  setTwicIssue]  = useState("");
  const [twicExpiry, setTwicExpiry] = useState("");

  // HazMat
  const [hazmatLinked, setHazmatLinked] = useState(false);

  // Port IDs
  const [portIds, setPortIds] = useState<{ port_name: string; expiration_date: string }[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_driver_profile", {
          p_user_id: member.user_id,
          p_company_id: companyId,
        });
        if (error) throw error;
        const d = data as DriverProfile;
        setProfile(d);

        setDisplayName(d.profile?.display_name ?? member.display_name ?? "");
        setHireDate(d.profile?.hire_date ?? "");
        setDivision(d.profile?.division ?? "");
        setRegion(d.profile?.region ?? "");
        setLocalArea(d.profile?.local_area ?? "");
        setEmployeeNumber((d.profile as any)?.employee_number ?? member.employee_number ?? "");

        if (d.license) {
          setLicClass(d.license.license_class ?? "");
          setLicEndorse((d.license.endorsements ?? []).join(", "));
          setLicRestrict((d.license.restrictions ?? []).join(", "));
          setLicNumber(d.license.license_number ?? "");
          setLicIssue(d.license.issue_date ?? "");
          setLicExpiry(d.license.expiration_date ?? "");
          setLicState(d.license.state_code ?? "");
        }
        if (d.medical) {
          setMedIssue(d.medical.issue_date ?? "");
          setMedExpiry(d.medical.expiration_date ?? "");
          setMedExaminer(d.medical.examiner_name ?? "");
          setMedAttachedToLic(!!(d.medical as any).attached_to_license);
        }
        setHazmatLinked(!!(d as any).hazmat_linked_to_license);
        if (d.twic) {
          setTwicNumber(d.twic.card_number ?? "");
          setTwicIssue(d.twic.issue_date ?? "");
          setTwicExpiry(d.twic.expiration_date ?? "");
        }
        if (d.port_ids) setPortIds(d.port_ids ?? []);
      } catch (e: any) {
        setErr(e?.message ?? "Load failed.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [member.user_id, companyId, supabase]);

  async function save() {
    setSaving(true); setErr(null); setSuccess(false);

    const payload: any = {
      display_name:    displayName || null,
      hire_date:       hireDate || null,
      division:        division || null,
      region:          region || null,
      local_area:      localArea || null,
      employee_number: employeeNumber || null,
    };

    if (licClass || licNumber || licExpiry) {
      payload.license = {
        license_class:   licClass || null,
        endorsements:    licEndorse ? licEndorse.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : [],
        restrictions:    licRestrict ? licRestrict.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : [],
        card_number:     licNumber || null,
        issue_date:      licIssue || null,
        expiration_date: licExpiry || null,
        state_code:      licState || null,
      };
    }
    if (medExpiry || medIssue) {
      payload.medical = {
        issue_date:          medIssue || null,
        expiration_date:     medExpiry || null,
        examiner_name:       medExaminer || null,
        attached_to_license: medAttachedToLic,
      };
    }
    // Always save hazmat flag even if no other hazmat data
    payload.hazmat_linked_to_license = hazmatLinked;
    if (twicNumber || twicExpiry) {
      payload.twic = {
        card_number:     twicNumber || null,
        issue_date:      twicIssue || null,
        expiration_date: twicExpiry || null,
      };
    }
    payload.port_ids = portIds.filter(p => p.port_name.trim());

    try {
      const { error } = await supabase.rpc("upsert_driver_profile", {
        p_user_id:    member.user_id,
        p_company_id: companyId,
        p_data:       payload,
      });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => onDone(), 800);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const terminals = profile?.terminals ?? [];

  function reloadProfile() {
    supabase.rpc("get_driver_profile", { p_user_id: member.user_id, p_company_id: companyId })
      .then(({ data }) => { if (data) setProfile(data as DriverProfile); });
  }

  return (
    <Modal title={`Edit Profile — ${member.display_name || member.email}`} onClose={onClose} wide>
      {err     && <Banner msg={err} type="error" />}
      {success && <Banner msg="Saved successfully." type="success" />}

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center" as const, color: T.muted }}>Loading profile…</div>
      ) : (
        <>
          {/* Profile */}
          <SubSectionTitle>Profile</SubSectionTitle>
          <FieldRow>
            <Field label="Display Name" half><input value={displayName} onChange={e => setDisplayName(e.target.value)} style={css.input} placeholder="Full name" /></Field>
            <Field label="Hire Date" half><input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={css.input} /></Field>
            <Field label="Employee #" half><input value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} style={css.input} placeholder="e.g. EMP-001" /></Field>
            <Field label="Division" half><input value={division} onChange={e => setDivision(e.target.value)} style={css.input} placeholder="e.g. Refined" /></Field>
            <Field label="Region" half><input value={region} onChange={e => setRegion(e.target.value)} style={css.input} placeholder="e.g. Southeast" /></Field>
            <Field label="Local Area" half><input value={localArea} onChange={e => setLocalArea(e.target.value)} style={css.input} placeholder="e.g. Tampa Bay" /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* Driver's License */}
          <SubSectionTitle>Driver's License</SubSectionTitle>
          <FieldRow>
            <Field label="State" half>
              <input value={licState} onChange={e => setLicState(e.target.value)} style={css.input} placeholder="FL" maxLength={2} />
            </Field>
            <Field label="Class" half>
              <select value={licClass} onChange={e => setLicClass(e.target.value)} style={{ ...css.select, width: "100%" }}>
                <option value="">—</option>
                <option value="A">Class A</option>
                <option value="B">Class B</option>
                <option value="C">Class C</option>
                <option value="D">Class D</option>
              </select>
            </Field>
            <Field label="License Number" half><input value={licNumber} onChange={e => setLicNumber(e.target.value)} style={css.input} placeholder="License #" /></Field>
            <Field label="Endorsements" half><input value={licEndorse} onChange={e => setLicEndorse(e.target.value)} style={css.input} placeholder="H, N, X (comma separated)" /></Field>
            <Field label="Restrictions" half><input value={licRestrict} onChange={e => setLicRestrict(e.target.value)} style={css.input} placeholder="B, E (comma separated)" /></Field>
            <div style={{ width: "100%" }} />
            <Field label="Issue Date" half><input type="date" value={licIssue} onChange={e => setLicIssue(e.target.value)} style={css.input} /></Field>
            <Field label="Expiration Date" half><input type="date" value={licExpiry} onChange={e => setLicExpiry(e.target.value)} style={css.input} /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* Medical Card */}
          <SubSectionTitle>Medical Card</SubSectionTitle>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.muted, marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={medAttachedToLic} onChange={e => {
              setMedAttachedToLic(e.target.checked);
              if (e.target.checked && licIssue) setMedIssue(licIssue);
              if (e.target.checked && licExpiry) setMedExpiry(licExpiry);
            }} style={{ width: 14, height: 14, accentColor: T.accent }} />
            <span>Attached to driver's license <span style={{ color: T.muted, fontSize: 11 }}>(copies license dates)</span></span>
          </label>
          <FieldRow>
            <Field label="Issue Date" half>
              <input type="date" value={medIssue}
                onChange={e => { if (!medAttachedToLic) setMedIssue(e.target.value); }}
                style={{ ...css.input, opacity: medAttachedToLic ? 0.5 : 1 }} readOnly={medAttachedToLic} />
            </Field>
            <Field label="Expiration Date" half>
              <input type="date" value={medAttachedToLic ? licExpiry : medExpiry}
                onChange={e => { if (!medAttachedToLic) setMedExpiry(e.target.value); }}
                style={{ ...css.input, opacity: medAttachedToLic ? 0.5 : 1 }} readOnly={medAttachedToLic} />
            </Field>
            <Field label="Examiner Name"><input value={medExaminer} onChange={e => setMedExaminer(e.target.value)} style={css.input} placeholder="Dr. Name" /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* HazMat */}
          <SubSectionTitle>HazMat Endorsement</SubSectionTitle>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.muted, marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={hazmatLinked} onChange={e => setHazmatLinked(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: T.accent }} />
            <span>HazMat renewal tied to driver's license <span style={{ color: T.muted, fontSize: 11 }}>(renews with CDL)</span></span>
          </label>
          {hazmatLinked
            ? <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>HazMat will renew on <strong style={{ color: T.text }}>{fmtDate(licExpiry) || "—"}</strong> with the CDL.</div>
            : <FieldRow>
                <Field label="Issue Date" half><input type="date" value={licIssue} readOnly style={{ ...css.input, opacity: 0.4 }} /></Field>
                <Field label="Expiration Date" half><input type="date" value={licExpiry} readOnly style={{ ...css.input, opacity: 0.4 }} /></Field>
              </FieldRow>
          }

          <hr style={css.divider} />

          {/* TWIC */}
          <SubSectionTitle>TWIC Card</SubSectionTitle>
          <FieldRow>
            <Field label="Card Number" half><input value={twicNumber} onChange={e => setTwicNumber(e.target.value)} style={css.input} placeholder="TWIC #" /></Field>
            <div style={{ width: "calc(50% - 5px)" }} />
            <Field label="Issue Date" half><input type="date" value={twicIssue} onChange={e => setTwicIssue(e.target.value)} style={css.input} /></Field>
            <Field label="Expiration Date" half><input type="date" value={twicExpiry} onChange={e => setTwicExpiry(e.target.value)} style={css.input} /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* Port IDs */}
          <SubSectionTitle>Port IDs</SubSectionTitle>
          <PortIdEditor portIds={portIds} onChange={setPortIds} />

          <hr style={css.divider} />

          {/* Terminal Access */}
          <TerminalAccessEditor
            userId={member.user_id}
            companyId={companyId}
            supabase={supabase}
            existing={terminals}
            onReload={reloadProfile}
          />

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
            {onRemove && (
              <button
                style={{ ...css.btn("ghost"), color: T.danger, borderColor: `${T.danger}44`, marginRight: "auto" }}
                onClick={async () => {
                  if (!confirm(`Remove ${member.email} from the company? Their data will be preserved.`)) return;
                  await supabase.rpc("admin_remove_member", {
                    p_user_id: member.user_id,
                    p_email: member.email || null,
                    p_company_id: companyId,
                  });
                  onRemove();
                }}
              >
                Remove User
              </button>
            )}
            <button style={{ ...css.btn("ghost"), marginLeft: onRemove ? 0 : "auto" }} onClick={onClose}>Cancel</button>
            <button style={css.btn("primary")} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
