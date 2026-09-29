"use client";
// lib/ui/driver/SettingsModal.tsx
//
// Merged Settings / Company Settings -- previously two separate components
// (app/planner/modals/SettingsModal.tsx for the driver-facing hamburger-menu
// "Settings", app/admin/CompanySettingsModal.tsx for the admin-only "Company
// Settings" tile). With only one person to manage both in a solo company,
// splitting personal settings from company settings was pure friction --
// this is the one place both live now, titled per tier/role:
//
//   "Settings"          -- solo (always admin, sees everything below), or
//                           any fleet role that isn't admin (sees only
//                           Profile -- nothing company-level applies to them)
//   "Company Settings"  -- fleet admin (sees Profile AND the company/
//                           billing sections)
//
// Deliberately self-sufficient: takes only companyId/myRole/authUserId, and
// resolves company_name/is_solo itself on open (same resolver-fetch-before-
// render shape as EquipmentModal.tsx -> SoloEquipmentModal.tsx's own
// "Phase 1" isSolo threading) -- this is what lets it mount identically from
// both ShellChrome (app/planner/CalculatorLayoutClient.tsx, inside the
// CalculatorShellContext tree) and app/admin/page.tsx (outside that tree
// entirely, confirmed -- /admin has no access to shell.* at all). Neither
// caller has to already know isSolo/companyName to render this.
//
// Accent Color (the old Appearance section) is gone -- the app no longer
// offers any appearance customization, per explicit direction. useTheme.ts's
// accentColor/setAccentColor themselves are untouched (still consumed by
// PlannerControls.tsx/CancelLoadSheet.tsx/etc. for the Load button, CG puck,
// and a few sheet accents) -- only this settings entry point is removed.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { SelfProfileView } from "./SelfProfileView";
import { supabase } from "@/lib/supabase/client";
import JoinFleetView from "@/app/planner/components/JoinFleetView";
import { T, css } from "./tokens";
import { useCompanySubscription, computeSeatCapacity } from "@/lib/billing/useCompanySubscription";
import type { Role } from "./role";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function SettingsRow({ label, sub, right, onClick }: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)", cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
      {onClick && <span style={{ fontSize: 15, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>›</span>}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past Due",
  canceled: "Canceled",
  incomplete: "Incomplete",
};
const STATUS_COLOR: Record<string, string> = {
  trialing: T.info,
  active: T.success,
  past_due: T.warning,
  canceled: T.danger,
  incomplete: T.muted,
};

// company_subscriptions' trial_ends_at/current_period_end are full ISO
// timestamptz instants -- tokens.ts's fmtDate assumes a bare YYYY-MM-DD and
// appends its own "T00:00:00", which would double up the time portion here.
function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

export default function SettingsModal({ open, onClose, companyId, myRole, authUserId, onCompanyRenamed }: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  myRole: Role | string;
  authUserId: string;
  // Only meaningful from the admin/page.tsx mount, which keeps its own
  // companyName state for the page header -- the ShellChrome mount has no
  // analogous state to sync, so it simply omits this.
  onCompanyRenamed?: (name: string) => void;
}) {
  const [view, setView] = useState<"root" | "profile" | "joinFleet">("root");
  const [company, setCompany] = useState<{ name: string; isSolo: boolean } | null>(null);

  useEffect(() => { if (open) setView("root"); }, [open]);

  useEffect(() => {
    if (!open || !companyId) { setCompany(null); return; }
    let cancelled = false;
    supabase.from("companies").select("company_name, is_solo").eq("company_id", companyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setCompany({ name: data?.company_name ?? "", isSolo: Boolean(data?.is_solo) }); });
    return () => { cancelled = true; };
  }, [open, companyId]);

  const isAdmin = myRole === "admin";
  const isSolo = company?.isSolo ?? false;
  const title = view === "profile" ? "Profile" : view === "joinFleet" ? "Join a Fleet"
    : !isSolo && isAdmin ? "Company Settings" : "Settings";

  return (
    <FullscreenModal open={open} title={title} onClose={onClose}>
      {view === "profile" ? (
        <div>
          <BackRow title={title === "Company Settings" ? "Company Settings" : "Settings"} onBack={() => setView("root")} />
          <SelfProfileView />
        </div>
      ) : view === "joinFleet" ? (
        <div>
          <BackRow title="Settings" onBack={() => setView("root")} />
          <JoinFleetView onJoined={() => { window.location.href = "/planner"; }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <SectionLabel>Account</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              <SettingsRow
                label="Profile"
                sub="Name, hire date, division/region, pay & schedule"
                onClick={() => setView("profile")}
              />
              {isSolo && (
                <SettingsRow
                  label="Join a Fleet"
                  sub="Have an invite code from your company?"
                  onClick={() => setView("joinFleet")}
                />
              )}
            </div>
          </div>

          {isAdmin && company && (
            <CompanySection
              companyId={companyId}
              companyName={company.name}
              isSolo={isSolo}
              onRenamed={(name) => { setCompany((c) => c ? { ...c, name } : c); onCompanyRenamed?.(name); }}
            />
          )}
        </div>
      )}
    </FullscreenModal>
  );
}

function BackRow({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        display: "flex", alignItems: "center", gap: 4, marginBottom: 16,
        border: "none", background: "none", padding: 0, cursor: "pointer",
        fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.55)",
      }}
    >
      ‹ Back to {title}
    </button>
  );
}

// Admin-only company/billing sections -- folded in from the old
// CompanySettingsModal.tsx unchanged, except: Admin Seats/Team Seats rows
// now only render when !isSolo (a solo account is always 1 of 1, so those
// two rows were pure noise for that tier -- Trial/Renews dates and the
// status badge still show for solo, they're genuinely informative either
// way). Seat usage is computed here directly (own roster-role fetch +
// useCompanySubscription) rather than accepted as a prop, so this stays
// self-sufficient for both mount sites.
function CompanySection({ companyId, companyName, isSolo, onRenamed }: {
  companyId: string;
  companyName: string;
  isSolo: boolean;
  onRenamed: (name: string) => void;
}) {
  const [name, setName] = useState(companyName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [memberRoles, setMemberRoles] = useState<string[]>([]);

  useEffect(() => { setName(companyName); }, [companyName]);

  useEffect(() => {
    let cancelled = false;
    supabase.from("user_companies").select("role").eq("company_id", companyId)
      .then(({ data }) => { if (!cancelled) setMemberRoles(((data ?? []) as any[]).map((r) => r.role)); });
    return () => { cancelled = true; };
  }, [companyId]);

  const { subscription } = useCompanySubscription(companyId);
  const seats = useMemo(() => computeSeatCapacity(memberRoles, subscription), [memberRoles, subscription]);

  async function openBillingPortal() {
    setStatus(null);
    setOpeningPortal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "Could not open billing management.");
      window.location.href = data.url;
    } catch (e: any) {
      setStatus({ type: "error", msg: e?.message ?? "Could not open billing management." });
      setOpeningPortal(false);
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === companyName) return;
    setSaving(true);
    setStatus(null);
    try {
      const { error } = await supabase.rpc("admin_update_company_name", { p_company_id: companyId, p_name: trimmed });
      if (error) throw error;
      onRenamed(trimmed);
      setStatus({ type: "success", msg: "Company name updated." });
    } catch (e: any) {
      setStatus({ type: "error", msg: e?.message ?? "Could not update the company name." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionLabel>Company</SectionLabel>
      {status && (
        <div style={{
          marginBottom: 10, fontSize: 12, padding: "8px 10px", borderRadius: 6,
          color: status.type === "error" ? T.danger : T.success,
          background: status.type === "error" ? "rgba(239,68,68,0.08)" : "rgba(76,175,130,0.08)",
        }}>
          {status.msg}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ padding: "12px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 8 }}>
            Company Name
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              style={{ ...css.input, flex: 1 }}
            />
            <button type="button" style={css.btn("primary")} onClick={save} disabled={saving || !name.trim() || name.trim() === companyName}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: T.muted }}>Plan tier</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: T.text }}>
              {isSolo ? "Solo" : "Fleet"}
            </span>
            <span style={{ fontSize: 11, color: T.muted }}>— contact us to change your plan tier</span>
          </div>
        </div>

        <div style={{ padding: "12px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 8 }}>
            Plan &amp; Billing
          </div>
          {!seats.hasSubscription ? (
            <div style={{ color: T.muted, fontSize: 13, lineHeight: 1.5 }}>
              No billing plan is configured for this company yet. Nothing is gated or blocked on this --
              this section is just informational and will populate once billing is live.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
                  background: `${STATUS_COLOR[seats.status ?? ""] ?? T.muted}22`,
                  color: STATUS_COLOR[seats.status ?? ""] ?? T.muted,
                }}>
                  {STATUS_LABEL[seats.status ?? ""] ?? seats.status}
                </span>
                {subscription?.comped && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: "rgba(76,175,130,0.15)", color: T.success }}>
                    Complimentary Access
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const }}>
                {/* Admin Seats / Team Seats: a solo account is always 1 of 1
                    -- pure noise, not shown at all. Fleet keeps both, unchanged. */}
                {!isSolo && (
                  <>
                    <div>
                      <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 2 }}>Admin Seats</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: seats.adminSeatsFull ? T.warning : T.text }}>{seats.usedAdminSeats} of {seats.paidAdminSeats}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 2 }}>Team Seats</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: seats.otherSeatsFull ? T.warning : T.text }}>{seats.usedOtherSeats} of {seats.paidOtherSeats}</div>
                    </div>
                  </>
                )}
                {subscription?.trial_ends_at && (
                  <div>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 2 }}>Trial Ends</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{fmtTimestamp(subscription.trial_ends_at)}</div>
                  </div>
                )}
                {subscription?.current_period_end && (
                  <div>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 2 }}>Renews</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{fmtTimestamp(subscription.current_period_end)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={!subscription?.stripe_customer_id || openingPortal}
            title={subscription?.stripe_customer_id ? undefined : "No billing account on file for this company yet."}
            onClick={openBillingPortal}
            style={{
              ...css.btn("ghost"), width: "100%", justifyContent: "center" as const, marginTop: 14,
              opacity: subscription?.stripe_customer_id ? 1 : 0.45,
              cursor: subscription?.stripe_customer_id ? "pointer" : "not-allowed",
            }}
          >
            {openingPortal ? "Opening…" : "Manage Billing"}
          </button>
        </div>
      </div>
    </div>
  );
}
