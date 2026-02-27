// lib/ui/driver/MemberCard.tsx
"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { T, css, fmtDate, expiryColor, daysUntil, expiryLabel } from "./tokens";
import { ComplianceCard, DataRow } from "./primitives";
import type { Member, DriverProfile } from "./types";

export function MemberCard({ member, companyId, supabase, onRefresh, onEditProfile, hideRoleDropdown, hideRemove }: {
  member: Member;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onRefresh: () => void;
  onEditProfile: (m: Member) => void;
  hideRoleDropdown?: boolean; // true on ProfilePage — user can't reassign their own role
  hideRemove?: boolean;       // true on ProfilePage — user can't remove themselves
}) {
  const [expanded,          setExpanded]          = useState(false);
  const [preview,           setPreview]           = useState<DriverProfile | null>(null);
  const [loading,           setLoading]           = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [terminalsExpanded, setTerminalsExpanded] = useState(false);

  async function loadPreview() {
    if (preview || loading) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_driver_profile", {
        p_user_id:    member.user_id,
        p_company_id: companyId,
      });
      setPreview(data as DriverProfile);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadPreview();
  }

  async function changeRole(role: string) {
    setSaving(true);
    await supabase.from("user_companies").update({ role }).eq("user_id", member.user_id).eq("company_id", companyId);
    setSaving(false);
    onRefresh();
  }

  async function remove() {
    if (!confirm(`Remove ${member.email} from the company?`)) return;
    setSaving(true);
    await supabase.rpc("admin_remove_member", {
      p_user_id:    member.user_id,
      p_email:      member.email || null,
      p_company_id: companyId,
    });
    setSaving(false);
    onRefresh();
  }

  const name     = member.display_name || member.email || `User …${member.user_id.slice(-8)}`;
  const subEmail = member.display_name ? member.email : null;

  const lic       = preview?.license;
  const med       = preview?.medical;
  const twic      = preview?.twic;
  const ports     = (preview as any)?.port_ids ?? [];
  const terminals = preview?.terminals ?? [];
  const licDays   = daysUntil(lic?.expiration_date);
  const medDays   = daysUntil(med?.expiration_date);
  const twicDays  = daysUntil(twic?.expiration_date);
  const expiringSoon = [licDays, medDays, twicDays, ...terminals.map(t => t.days_until_expiry)]
    .some(d => d != null && d < 30);

  return (
    <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>

      {/* ── Collapsed row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }} onClick={toggle}>
        <span style={{ color: T.muted, fontSize: 14, transition: "transform 150ms", transform: expanded ? "rotate(90deg)" : "none", flexShrink: 0, userSelect: "none" as const }}>›</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: T.text }}>{name}</span>
            {expiringSoon && <span style={css.tag(T.warning)}>⚠ Expiring</span>}
          </div>
          {subEmail && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{subEmail}</div>}
          {member.hire_date && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              Hired {fmtDate(member.hire_date)}{member.division ? ` · ${member.division}` : ""}{member.region ? ` · ${member.region}` : ""}
            </div>
          )}
        </div>

        <button onClick={e => { e.stopPropagation(); onEditProfile(member); }}
          style={{ ...css.btn("subtle"), fontSize: 11, flexShrink: 0 }}>
          Edit
        </button>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface2 }}>

          {/* Meta row: employee # + role + remove */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" as const }}>
            {member.employee_number && (
              <div style={{ fontSize: 12, color: T.muted }}>
                <span style={{ fontWeight: 700, color: T.text }}>#{member.employee_number}</span>
              </div>
            )}
            <div style={{ flex: 1 }} />

            {!hideRoleDropdown && (
              <select value={member.role} onChange={e => { e.stopPropagation(); changeRole(e.target.value); }} disabled={saving}
                style={{ ...css.select, fontSize: 12, padding: "5px 8px" }}>
                <option value="driver">Driver</option>
                <option value="admin">Admin</option>
              </select>
            )}

            {!hideRemove && (
              <button onClick={e => { e.stopPropagation(); remove(); }} disabled={saving}
                style={{ ...css.btn("ghost"), padding: "5px 10px", color: T.danger, borderColor: `${T.danger}44`, fontSize: 12 }}>
                Remove
              </button>
            )}
          </div>

          {/* Compliance cards */}
          {loading ? (
            <div style={{ fontSize: 12, color: T.muted, padding: "12px 14px" }}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8, padding: "12px 14px" }}>

              <ComplianceCard title="Driver's License" color={lic ? expiryColor(licDays) : T.border}>
                {lic ? (
                  <>
                    {lic.license_class && <DataRow label="Class" value={`Class ${lic.license_class}`} />}
                    {lic.license_number && <DataRow label="License #" value={lic.license_number} />}
                    {(lic.endorsements?.length ?? 0) > 0 && <DataRow label="Endorsements" value={lic.endorsements.join(", ")} />}
                    <DataRow label="Expires" value={fmtDate(lic.expiration_date)} highlight={expiryColor(licDays)} />
                    <div><span style={css.tag(expiryColor(licDays))}>{expiryLabel(licDays)}</span></div>
                  </>
                ) : <div style={{ fontSize: 12, color: T.muted }}>Not on file</div>}
              </ComplianceCard>

              <ComplianceCard title="Medical Card" color={med ? expiryColor(medDays) : T.border}>
                {med ? (
                  <>
                    <DataRow label="Expires" value={fmtDate(med.expiration_date)} highlight={expiryColor(medDays)} />
                    <div><span style={css.tag(expiryColor(medDays))}>{expiryLabel(medDays)}</span></div>
                  </>
                ) : <div style={{ fontSize: 12, color: T.muted }}>Not on file</div>}
              </ComplianceCard>

              <ComplianceCard title="TWIC Card" color={twic ? expiryColor(twicDays) : T.border}>
                {twic ? (
                  <>
                    {twic.card_number && <DataRow label="Card #" value={twic.card_number} />}
                    <DataRow label="Expires" value={fmtDate(twic.expiration_date)} highlight={expiryColor(twicDays)} />
                    <div><span style={css.tag(expiryColor(twicDays))}>{expiryLabel(twicDays)}</span></div>
                  </>
                ) : <div style={{ fontSize: 12, color: T.muted }}>Not on file</div>}
              </ComplianceCard>

              <ComplianceCard title={`Port IDs (${ports.length})`} color={ports.length > 0 ? T.info : T.border}>
                {ports.length > 0
                  ? ports.map((p: any, i: number) => {
                      const d = daysUntil(p.expiration_date);
                      return <DataRow key={i} label={p.port_name || "—"} value={<span style={css.tag(expiryColor(d))}>{expiryLabel(d)}</span>} />;
                    })
                  : <div style={{ fontSize: 12, color: T.muted }}>None on file</div>}
              </ComplianceCard>

              {/* Terminals — expandable, expired first */}
              {(() => {
                const sorted    = [...terminals].sort((a, b) => a.days_until_expiry - b.days_until_expiry);
                const preview3  = sorted.slice(0, 3);
                const rest      = sorted.slice(3);
                return (
                  <ComplianceCard title={`Terminals (${terminals.length})`} color={terminals.length > 0 ? T.accent : T.border}>
                    {terminals.length === 0
                      ? <div style={{ fontSize: 12, color: T.muted }}>No terminals</div>
                      : <>
                          {preview3.map(t => (
                            <DataRow key={t.terminal_id}
                              label={[t.city, t.state].filter(Boolean).join(", ") || t.terminal_name}
                              value={<span style={css.tag(expiryColor(t.days_until_expiry))}>{expiryLabel(t.days_until_expiry)}</span>}
                            />
                          ))}
                          {terminalsExpanded && rest.map(t => (
                            <DataRow key={t.terminal_id}
                              label={[t.city, t.state].filter(Boolean).join(", ") || t.terminal_name}
                              value={<span style={css.tag(expiryColor(t.days_until_expiry))}>{expiryLabel(t.days_until_expiry)}</span>}
                            />
                          ))}
                          {rest.length > 0 && (
                            <button onClick={() => setTerminalsExpanded(v => !v)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: T.accent, fontSize: 11, padding: "4px 0 0", fontWeight: 600 }}>
                              {terminalsExpanded ? "▲ Show less" : `▼ +${rest.length} more`}
                            </button>
                          )}
                        </>
                    }
                  </ComplianceCard>
                );
              })()}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
