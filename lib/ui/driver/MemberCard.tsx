// lib/ui/driver/MemberCard.tsx
"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { T, css, fmtDate, expiryColor, daysUntil, expiryLabel } from "./tokens";
import { DataRow } from "./primitives";
import type { Member, DriverProfile } from "./types";

export function MemberCard({ member, companyId, supabase, onRefresh, onEditProfile, hideRoleDropdown, hideRemove }: {
  member: Member;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onRefresh: () => void;
  onEditProfile: (m: Member, onSaved: () => void) => void;
  hideRoleDropdown?: boolean;
  hideRemove?: boolean;
}) {
  const [expanded,  setExpanded]  = useState(false);
  const [preview,   setPreview]   = useState<DriverProfile | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  // Local member state so header updates immediately after save without parent re-render
  const [local,     setLocal]     = useState<Member>(member);

  async function reload(force = false) {
    if (!force && (preview || loading)) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_driver_profile", {
        p_user_id: member.user_id, p_company_id: companyId,
      });
      const d = data as DriverProfile & { profile: any };
      setPreview(d);
      // Pull fresh header fields from the returned profile object
      if (d?.profile) {
        setLocal(prev => ({
          ...prev,
          display_name:    d.profile.display_name    ?? null,
          hire_date:       d.profile.hire_date       ?? null,
          division:        d.profile.division        ?? null,
          region:          d.profile.region          ?? null,
          local_area:      d.profile.local_area      ?? null,
          employee_number: d.profile.employee_number ?? null,
        }));
      }
    } finally { setLoading(false); }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) reload();
  }

  async function changeRole(role: string) {
    setSaving(true);
    await supabase.from("user_companies").update({ role }).eq("user_id", member.user_id).eq("company_id", companyId);
    setSaving(false);
    onRefresh();
  }

  async function remove() {
    if (!confirm(`Remove ${local.email} from the company?`)) return;
    setSaving(true);
    await supabase.rpc("admin_remove_member", {
      p_user_id: member.user_id, p_email: member.email || null, p_company_id: companyId,
    });
    setSaving(false);
    onRefresh();
  }

  const name     = local.display_name || local.email || `User …${local.user_id.slice(-8)}`;
  const subEmail = local.display_name ? local.email : null;
  const hasName  = !!local.display_name;

  const metaParts: string[] = [];
  if (local.employee_number) metaParts.push(`Emp. #${local.employee_number}`);
  if (local.hire_date)       metaParts.push(`Hired ${fmtDate(local.hire_date)}`);
  if (local.division)        metaParts.push(local.division);
  if (local.region)          metaParts.push(local.region);
  const metaLine = metaParts.join(" · ");

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

      {/* ── Collapsed header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", cursor: "pointer" }} onClick={toggle}>
        <span style={{ color: T.muted, fontSize: 14, transition: "transform 150ms", transform: expanded ? "rotate(90deg)" : "none", flexShrink: 0, userSelect: "none" as const, marginTop: 2 }}>›</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontWeight: hasName ? 600 : 400,
              fontSize: hasName ? 14 : 13,
              color: hasName ? T.text : T.muted,
              flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>{name}</span>
            {expiringSoon && <span style={css.tag(T.warning)}>⚠</span>}
            <button
              onClick={e => {
                e.stopPropagation();
                onEditProfile(local, () => reload(true));
              }}
              style={{ ...css.btn("subtle"), fontSize: 11, flexShrink: 0, padding: "3px 8px" }}
            >
              Edit
            </button>
          </div>
          {subEmail && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{subEmail}</div>}
          {metaLine
            ? <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{metaLine}</div>
            : <div style={{ fontSize: 11, color: T.muted, marginTop: 1, fontStyle: "italic" }}>No profile set up yet</div>
          }
        </div>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface2 }}>

          {(!hideRoleDropdown || !hideRemove) && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" as const }}>
              <div style={{ flex: 1 }} />
              {!hideRoleDropdown && (
                <select value={local.role} onChange={e => { e.stopPropagation(); changeRole(e.target.value); }} disabled={saving}
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
          )}

          {loading ? (
            <div style={{ fontSize: 12, color: T.muted, padding: "12px 14px" }}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8, padding: "12px 14px" }}>

              <ExpandableCard title="Driver's License" color={lic ? expiryColor(licDays) : T.border}
                summary={lic ? <ExpiryRow date={fmtDate(lic.expiration_date)} days={licDays} /> : null}
                empty={!lic}>
                {lic && <>
                  {lic.license_class  && <DataRow label="Class"        value={`Class ${lic.license_class}`} />}
                  {lic.license_number && <DataRow label="License #"    value={lic.license_number} />}
                  {lic.state_code     && <DataRow label="State"        value={lic.state_code} />}
                  {(lic.endorsements?.length ?? 0) > 0 && <DataRow label="Endorsements" value={lic.endorsements.join(", ")} />}
                  {(lic.restrictions?.length ?? 0) > 0 && <DataRow label="Restrictions" value={lic.restrictions.join(", ")} />}
                  <ExpiryRow date={fmtDate(lic.expiration_date)} days={licDays} />
                </>}
              </ExpandableCard>

              <ExpandableCard title="Medical Card" color={med ? expiryColor(medDays) : T.border}
                summary={med ? <ExpiryRow date={fmtDate(med.expiration_date)} days={medDays} /> : null}
                empty={!med}>
                {med && <>
                  {med.examiner_name && <DataRow label="Examiner" value={med.examiner_name} />}
                  <ExpiryRow date={fmtDate(med.expiration_date)} days={medDays} />
                </>}
              </ExpandableCard>

              <ExpandableCard title="TWIC Card" color={twic ? expiryColor(twicDays) : T.border}
                summary={twic ? <ExpiryRow date={fmtDate(twic.expiration_date)} days={twicDays} /> : null}
                empty={!twic}>
                {twic && <>
                  {twic.card_number && <DataRow label="Card #" value={twic.card_number} />}
                  <ExpiryRow date={fmtDate(twic.expiration_date)} days={twicDays} />
                </>}
              </ExpandableCard>

              <ExpandableCard title={`Port IDs (${ports.length})`} color={ports.length > 0 ? T.info : T.border}
                summary={ports.length > 0 ? <div style={{ fontSize: 11, color: T.muted }}>{ports.length} port{ports.length !== 1 ? "s" : ""} on file</div> : null}
                empty={ports.length === 0}>
                {ports.map((p: any, i: number) => {
                  const d = daysUntil(p.expiration_date);
                  return <ExpiryRow key={i} label={p.port_name || "—"} date={fmtDate(p.expiration_date)} days={d} />;
                })}
              </ExpandableCard>

              <ExpandableCard title={`Terminals (${terminals.length})`} color={terminals.length > 0 ? T.accent : T.border}
                summary={terminals.length > 0 ? <div style={{ fontSize: 11, color: T.muted }}>{terminals.length} terminal{terminals.length !== 1 ? "s" : ""} — tap to expand</div> : null}
                empty={terminals.length === 0}>
                {[...terminals].sort((a, b) => a.days_until_expiry - b.days_until_expiry).map(t => (
                  <ExpiryRow key={t.terminal_id}
                    label={[t.city, t.state].filter(Boolean).join(", ") || t.terminal_name}
                    date={t.is_expired ? "Expired" : fmtDate(t.expires_on)}
                    days={t.days_until_expiry}
                  />
                ))}
              </ExpandableCard>

            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Expandable compliance card ────────────────────────────────

function ExpandableCard({ title, color, summary, children, empty }: {
  title: string; color: string; summary?: React.ReactNode; children?: React.ReactNode; empty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => { if (!empty) setOpen(v => !v); }}
      style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "10px 12px", marginBottom: 8, borderLeft: `3px solid ${color}`, cursor: empty ? "default" : "pointer", userSelect: "none" as const }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: (open || empty) ? 8 : 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const, color }}>{title}</div>
        {!empty && <span style={{ fontSize: 11, color: T.muted, transition: "transform 150ms", transform: open ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>}
      </div>
      {!open && !empty && summary && <div>{summary}</div>}
      {empty && <div style={{ fontSize: 12, color: T.muted }}>Not on file</div>}
      {open && !empty && <div>{children}</div>}
    </div>
  );
}

// ── Expiry row ────────────────────────────────────────────────

function ExpiryRow({ label, date, days }: { label?: string; date: string; days: number | null }) {
  const color = expiryColor(days);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4, fontSize: 12 }}>
      {label && <span style={{ color: T.muted, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "45%" }}>{label}</span>}
      <span style={{ color: T.text, flexShrink: 0 }}>{date}</span>
      <span style={{ ...css.tag(color), flexShrink: 0 }}>{expiryLabel(days)}</span>
    </div>
  );
}
