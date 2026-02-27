// lib/ui/driver/MemberCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { T, css, fmtDate, expiryColor, daysUntil } from "./tokens";
import { DataRow } from "./primitives";
import { AttachmentManager, PaperclipBadge, useAttachmentCounts } from "./AttachmentManager";
import type { Member, DriverProfile } from "./types";

export function MemberCard({ member, companyId, onRefresh, onEditProfile, hideRoleDropdown, hideRemove, currentUserId }: {
  member: Member;
  companyId: string;
  onRefresh: () => void;
  onEditProfile: (m: Member, onSaved: () => void) => void;
  hideRoleDropdown?: boolean;
  hideRemove?: boolean;
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [preview,  setPreview]  = useState<DriverProfile | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [local,    setLocal]    = useState<Member>(member);

  useEffect(() => {
    setLocal(member);
  }, [member.display_name, member.hire_date, member.division, member.region, member.employee_number]);

  const licCounts  = useAttachmentCounts(companyId, "license", [member.user_id]);
  const medCounts  = useAttachmentCounts(companyId, "medical", [member.user_id]);
  const twicCounts = useAttachmentCounts(companyId, "twic",    [member.user_id]);
  const totalAttachments = (licCounts[member.user_id]  ?? 0)
                         + (medCounts[member.user_id]  ?? 0)
                         + (twicCounts[member.user_id] ?? 0);

  async function reload(force = false) {
    if (!force && (preview || loading)) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_driver_profile", {
        p_user_id: member.user_id, p_company_id: companyId,
      });
      const d = data as DriverProfile & { profile: any };
      setPreview(d);
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
  const expiringSoon = [licDays, medDays, twicDays, ...terminals.map((t: any) => t.days_until_expiry)]
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
            <PaperclipBadge count={totalAttachments} />
            <button
              onClick={e => { e.stopPropagation(); onEditProfile(local, () => reload(true)); }}
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
                <AttachmentManager
                  entityType="license" entityId={member.user_id}
                  companyId={companyId} currentUserId={currentUserId}
                  slots={[{ key: "front", label: "Front" }, { key: "back", label: "Back" }]}
                />
              </ExpandableCard>

              <ExpandableCard title="Medical Card" color={med ? expiryColor(medDays) : T.border}
                summary={med ? <ExpiryRow date={fmtDate(med.expiration_date)} days={medDays} /> : null}
                empty={!med}>
                {med && <>
                  {med.examiner_name && <DataRow label="Examiner" value={med.examiner_name} />}
                  <ExpiryRow date={fmtDate(med.expiration_date)} days={medDays} />
                </>}
                <AttachmentManager
                  entityType="medical" entityId={member.user_id}
                  companyId={companyId} currentUserId={currentUserId}
                  slots={[{ key: "card", label: "Card" }]}
                />
              </ExpandableCard>

              <ExpandableCard title="TWIC Card" color={twic ? expiryColor(twicDays) : T.border}
                summary={twic ? <ExpiryRow date={fmtDate(twic.expiration_date)} days={twicDays} /> : null}
                empty={!twic}>
                {twic && <>
                  {twic.card_number && <DataRow label="Card #" value={twic.card_number} />}
                  <ExpiryRow date={fmtDate(twic.expiration_date)} days={twicDays} />
                </>}
                <AttachmentManager
                  entityType="twic" entityId={member.user_id}
                  companyId={companyId} currentUserId={currentUserId}
                  slots={[{ key: "front", label: "Front" }, { key: "back", label: "Back" }]}
                />
              </ExpandableCard>

              <ExpandableCard title={`Port IDs (${ports.length})`} color={ports.length > 0 ? T.info : T.border}
                summary={ports.length > 0 ? <div style={{ fontSize: 11, color: T.muted }}>{ports.length} port{ports.length !== 1 ? "s" : ""} on file</div> : null}
                empty={ports.length === 0}>
                {ports.map((p: any, i: number) => {
                  const d = daysUntil(p.expiration_date);
                  const portKey = (p.port_name || `port_${i}`).toLowerCase().replace(/\s+/g, "_");
                  return (
                    <div key={i}>
                      <ExpiryRow label={p.port_name || "—"} date={fmtDate(p.expiration_date)} days={d} />
                      <AttachmentManager
                        entityType="port_id" entityId={`${member.user_id}_${portKey}`}
                        companyId={companyId} currentUserId={currentUserId}
                        slots={[{ key: "card", label: p.port_name || "Card" }]}
                      />
                    </div>
                  );
                })}
              </ExpandableCard>

              <ExpandableCard title={`Terminals (${terminals.length})`} color={terminals.length > 0 ? T.accent : T.border}
                summary={terminals.length > 0 ? <div style={{ fontSize: 11, color: T.muted }}>{terminals.length} terminal{terminals.length !== 1 ? "s" : ""} — tap to expand</div> : null}
                empty={terminals.length === 0}>
                <TerminalGroups terminals={terminals} />
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
    <div onClick={() => setOpen(v => !v)}
      style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "10px 12px", marginBottom: 8, borderLeft: `3px solid ${color}`, cursor: "pointer", userSelect: "none" as const }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: open ? 8 : 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const, color }}>{title}</div>
        <span style={{ fontSize: 11, color: T.muted, transition: "transform 150ms", transform: open ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
      </div>
      {!open && summary && <div>{summary}</div>}
      {!open && empty && !summary && <div style={{ fontSize: 12, color: T.muted }}>Not on file</div>}
      {open && <div onClick={e => e.stopPropagation()}>{children}</div>}
    </div>
  );
}

// ── Terminal groups — grouped by city/state, collapsed ────────

function TerminalGroups({ terminals }: { terminals: any[] }) {
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set());

  const groups = React.useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of terminals) {
      const key = [t.city, t.state].filter(Boolean).join(", ") || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // Within each group: expired first (soonest expired), then active soonest-expiring first
    for (const [, rows] of map) {
      rows.sort((a: any, b: any) => (a.days_until_expiry ?? 9999) - (b.days_until_expiry ?? 9999));
    }
    // Groups with most-expired/soonest first
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const aMin = a[0]?.days_until_expiry ?? 9999;
      const bMin = b[0]?.days_until_expiry ?? 9999;
      return aMin - bMin;
    });
  }, [terminals]);

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (terminals.length === 0) return null;

  return (
    <div style={{ marginTop: 2 }}>
      {groups.map(([cityState, rows]) => {
        const open = openGroups.has(cityState);
        const activeCount  = rows.filter((t: any) => !t.is_expired).length;
        const expiredCount = rows.length - activeCount;
        // Color header by worst terminal in group
        const worstDays = rows[0]?.days_until_expiry ?? null;
        const groupColor = expiryColor(worstDays);
        const countLabel = expiredCount > 0
          ? `${activeCount} active, ${expiredCount} expired`
          : `${activeCount} active`;

        return (
          <div key={cityState} style={{ marginBottom: 6 }}>
            {/* Group header — city/state left, count right */}
            <div
              onClick={() => toggleGroup(cityState)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer", padding: "5px 0", userSelect: "none" as const }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                <span style={{ color: groupColor, fontSize: 10, transition: "transform 150ms", transform: open ? "rotate(90deg)" : "none", display: "inline-block", flexShrink: 0 }}>›</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{cityState}</span>
              </div>
              <span style={{ fontSize: 11, color: expiredCount > 0 ? T.warning : T.muted, flexShrink: 0, textAlign: "right" as const }}>
                {countLabel}
              </span>
            </div>

            {/* Expanded terminal rows — name left, expiry date right */}
            {open && (
              <div style={{ paddingLeft: 16, borderLeft: `2px solid ${T.border}`, marginLeft: 4 }}>
                {rows.map((t: any) => (
                  <ExpiryRow
                    key={t.terminal_id}
                    label={t.terminal_name || cityState}
                    date={t.expires_on || ""}
                    days={t.days_until_expiry}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Expiry row ────────────────────────────────────────────────
// Format: [label left]  [MM-DD-YYYY (+/-Nd) right-aligned]
// Color:  muted=healthy, warning=<30d, danger=expired

function fmtExpiryInline(isoOrFormatted: string, days: number | null): string {
  if (!isoOrFormatted || isoOrFormatted === "—") return "—";
  try {
    const d = new Date(isoOrFormatted.includes(",") ? isoOrFormatted : isoOrFormatted + "T00:00:00");
    if (isNaN(d.getTime())) return isoOrFormatted;
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    const base = `${mm}-${dd}-${yyyy}`;
    if (days == null)  return base;
    if (days < 0)      return `${base} (${days}d)`;
    if (days === 0)    return `${base} (today)`;
    return `${base} (+${days}d)`;
  } catch { return isoOrFormatted; }
}

function ExpiryRow({ label, date, days }: { label?: string; date: string; days: number | null }) {
  const color = expiryColor(days);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, fontSize: 12 }}>
      {label
        ? <span style={{ color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0, flex: 1 }}>{label}</span>
        : <span style={{ flex: 1 }} />
      }
      <span style={{ color, fontWeight: (days != null && days < 30) ? 600 : 400, flexShrink: 0, textAlign: "right" as const }}>
        {fmtExpiryInline(date, days)}
      </span>
    </div>
  );
}
