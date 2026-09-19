"use client";
// app/admin/CompanySettingsModal.tsx
//
// Company Settings for a regular fleet/solo admin -- previously there was
// no way for anyone but a super-admin (via ProTankr Dash) to rename their
// own company or even see their own billing status. Two pieces:
//
// 1. Company name -- editable via the new admin_update_company_name RPC
//    (see its own migration comment for why this needed a new function
//    rather than reusing set_solo_company_name, which is owner-gated and
//    solo-only). Tier (Solo/Fleet) shown read-only -- converting tiers has
//    real billing implications that aren't decided yet, so that stays a
//    super-admin-only action.
//
// 2. Plan & Billing -- read-only, sourced from the SAME useCompanySubscription
//    hook the seat pill/InviteModal already use, just reading a few more of
//    its columns (comped/trial/period dates -- see that hook's own comment).
//    "Manage Billing" is a disabled placeholder: company_subscriptions
//    already carries stripe_customer_id/stripe_subscription_id (schema is
//    Stripe-ready), but no processor is wired up yet -- see this file's own
//    comment at that button for exactly what to wire in once it is.

import React, { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { T, css } from "@/lib/ui/driver/tokens";
import { Modal, Field, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import { useCompanySubscription, type SeatCapacity } from "@/lib/billing/useCompanySubscription";

// tokens.ts's own fmtDate assumes a bare YYYY-MM-DD (it appends "T00:00:00"
// itself) -- trial_ends_at/current_period_end are timestamptz columns, full
// ISO instants already, so reusing fmtDate here would double up the time
// portion and silently fail to parse. Plain formatting instead.
function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
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

export default function CompanySettingsModal({
  companyId, companyName, isSolo, seats, onClose, onRenamed,
}: {
  companyId: string;
  companyName: string;
  isSolo: boolean;
  // Passed down from admin/page.tsx (already computed there for the seat
  // pill/InviteModal) rather than re-fetched here, so both stay in sync
  // off one hook instance.
  seats: SeatCapacity;
  onClose: () => void;
  onRenamed: (name: string) => void;
}) {
  const [name, setName] = useState(companyName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "error" | "success"; msg: string } | null>(null);

  // The full subscription row (trial/period dates, comped, tier) -- `seats`
  // (passed in) only carries what computeSeatCapacity itself needs.
  const { subscription } = useCompanySubscription(companyId);

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
    <Modal title="Company Settings" onClose={onClose}>
      {status && <Banner msg={status.msg} type={status.type} />}

      <SubSectionTitle>Company</SubSectionTitle>
      <Field label="Company Name">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && save()}
            style={{ ...css.input, flex: 1 }}
          />
          <button
            type="button"
            style={css.btn("primary")}
            onClick={save}
            disabled={saving || !name.trim() || name.trim() === companyName}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: T.muted }}>Plan tier</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
          background: "rgba(255,255,255,0.06)", color: T.text,
        }}>
          {isSolo ? "Solo" : "Fleet"}
        </span>
        <span style={{ fontSize: 11, color: T.muted }}>— contact us to change your plan tier</span>
      </div>

      <hr style={css.divider} />

      <SubSectionTitle>Plan &amp; Billing</SubSectionTitle>
      {!seats.hasSubscription ? (
        <div style={{ ...css.card, color: T.muted, fontSize: 13, lineHeight: 1.5 }}>
          No billing plan is configured for this company yet. Nothing is gated or blocked on this --
          this section is just informational and will populate once billing is live.
        </div>
      ) : (
        <div style={{ ...css.card, display: "flex", flexDirection: "column" as const, gap: 10 }}>
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
            <div>
              <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 2 }}>Admin Seats</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: seats.adminSeatsFull ? T.warning : T.text }}>{seats.usedAdminSeats} of {seats.paidAdminSeats}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 2 }}>Team Seats</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: seats.otherSeatsFull ? T.warning : T.text }}>{seats.usedOtherSeats} of {seats.paidOtherSeats}</div>
            </div>
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

      {/* "Manage Billing" -- disabled until a real processor is wired up.
          company_subscriptions already has stripe_customer_id/
          stripe_subscription_id columns (schema is ready); what's still
          missing is the actual integration. To wire this in for real:
          1. Build /api/stripe/checkout (creates a Checkout session for
             adding/upgrading seats, using the company's existing
             stripe_customer_id if set) and, for an existing subscriber,
             /api/stripe/portal (creates a Billing Portal session so the
             admin can update payment method / cancel / see invoices
             without a custom UI for any of that).
          2. Point this button at whichever of those applies
             (no subscription yet -> checkout; has one -> portal),
             window.location.href = the returned session URL.
          3. /api/stripe/webhook (not built) is the only writer of
             company_subscriptions -- see that table's own migration
             comment -- so once it exists, everything above (status,
             seat counts, trial/period dates) starts reflecting real
             Stripe state with no further change needed here. */}
      <button
        type="button"
        disabled
        title="Stripe isn't connected yet -- this will open real billing management once it is."
        style={{ ...css.btn("ghost"), width: "100%", justifyContent: "center" as const, marginTop: 14, opacity: 0.45, cursor: "not-allowed" }}
      >
        Manage Billing — Coming Soon
      </button>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button style={css.btn("ghost")} onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
