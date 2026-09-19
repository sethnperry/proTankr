"use client";
// lib/billing/useCompanySubscription.ts
//
// Reads company_subscriptions (see its own migration comment for the full
// design) and turns it + the current roster into a simple seat-usage
// picture the UI can render directly. Deliberately fails open: no row
// (billing not live for this company yet, or the migration hasn't been
// applied at all) means hasSubscription: false, which callers should
// treat as "don't show seat UI, don't gate anything" -- this is a
// pre-launch scaffold, not enforcement. There is no Stripe/RevenueCat
// integration wired up yet, so nothing here actually blocks an invite or
// changes a bill; it only renders the warning a real integration would
// eventually act on. See CLAUDE.md for the fuller design conversation.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type CompanySubscriptionRow = {
  tier: "solo" | "fleet";
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  paid_admin_seats: number;
  paid_other_seats: number;
  // Extra fields beyond what computeSeatCapacity itself reads -- carried
  // through for CompanySettingsModal's own plan/billing display. Additive:
  // existing consumers (computeSeatCapacity, the admin seat pill) only ever
  // destructure the four fields above, so this widened select/type can't
  // affect them.
  comped: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export type SeatCapacity = {
  hasSubscription: boolean;
  tier: "solo" | "fleet" | null;
  status: CompanySubscriptionRow["status"] | null;
  paidAdminSeats: number;
  paidOtherSeats: number;
  usedAdminSeats: number;
  usedOtherSeats: number;
  adminSeatsFull: boolean;
  otherSeatsFull: boolean;
};

/** Pure so it's trivially testable and reusable outside a hook (e.g. in the invite modal's own state). */
export function computeSeatCapacity(
  memberRoles: string[],
  sub: CompanySubscriptionRow | null
): SeatCapacity {
  const usedAdminSeats = memberRoles.filter((r) => r === "admin").length;
  const usedOtherSeats = memberRoles.length - usedAdminSeats;

  if (!sub) {
    return {
      hasSubscription: false,
      tier: null,
      status: null,
      paidAdminSeats: 0,
      paidOtherSeats: 0,
      usedAdminSeats,
      usedOtherSeats,
      adminSeatsFull: false,
      otherSeatsFull: false,
    };
  }

  return {
    hasSubscription: true,
    tier: sub.tier,
    status: sub.status,
    paidAdminSeats: sub.paid_admin_seats,
    paidOtherSeats: sub.paid_other_seats,
    usedAdminSeats,
    usedOtherSeats,
    adminSeatsFull: usedAdminSeats >= sub.paid_admin_seats,
    otherSeatsFull: usedOtherSeats >= sub.paid_other_seats,
  };
}

/** Would adding one more member with `role` push this company over its paid capacity? */
export function wouldExceedCapacity(seats: SeatCapacity, role: string): boolean {
  if (!seats.hasSubscription) return false;
  return role === "admin" ? seats.adminSeatsFull : seats.otherSeatsFull;
}

export function useCompanySubscription(companyId: string | null) {
  const [subscription, setSubscription] = useState<CompanySubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("company_subscriptions")
          .select("tier, status, paid_admin_seats, paid_other_seats, comped, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id")
          .eq("company_id", companyId)
          .maybeSingle();
        if (cancelled) return;
        // Fail open on any error (table not migrated yet, RLS denies, etc.)
        // -- this is a pre-billing scaffold, never a reason to break the
        // page for companies that don't have a subscription row.
        setSubscription(error ? null : (data as CompanySubscriptionRow | null));
      } catch {
        if (!cancelled) setSubscription(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { subscription, loading };
}
