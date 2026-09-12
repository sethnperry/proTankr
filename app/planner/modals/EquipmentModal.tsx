"use client";

/**
 * EquipmentModal — thin entry point.
 *
 * Resolves the active company + tier and always renders the shared
 * `SoloEquipmentModal`, which is THE equipment modal for both tiers. The fleet
 * tier gets exactly the deltas the shared modal already handles via `isSolo`:
 * add/remove equipment is staff-only (admin/dispatch/lead); solo is always
 * admin, so unaffected. Everything else — the two-column pool grid (which
 * replaces the old "Browse Fleet" pool), couple/decouple/swap, the per-unit
 * commandeer-confirm, the Region/Local Area filter, the report section, and
 * Binder edit — is shared by every role in both tiers.
 *
 * History: this file used to carry a separate ~1,900-line fleet shell
 * (browse-fleet pool, star-primary "My Equipment", SELECT/DECOUPLE/SLIP-SEAT
 * rows, blue/orange tints). That was retired once the reworked solo modal
 * became the single shared modal for both tiers — see
 * snug-petting-starlight.md. The `combos`/`combosLoading`/`combosError` props
 * are still accepted for call-site compatibility but unused: the shared modal
 * loads its own equipment/combos by `company_id`.
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import SoloEquipmentModal from "./SoloEquipmentModal";
import type { SetupSession } from "@/lib/setupSession";

// Kept exported for any historical importer; the shared modal has its own
// internal ComboRow shape and does not depend on this one.
export type ComboRow = {
  combo_id: string;
  combo_name?: string | null;
  truck_id?: string | null;
  trailer_id?: string | null;
  tare_lbs?: number | null;
  target_weight?: number | null;
  active?: boolean | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  company_id?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  authUserId: string | null;
  setupSession?: SetupSession | null;
  // Accepted for call-site compatibility, unused — see file header.
  combos?: ComboRow[];
  combosLoading?: boolean;
  combosError?: string | null;
  selectedComboId: string;
  onSelectComboId: (id: string) => void;
  onRefreshCombos: () => void;
  myRole?: string | null;
};

export default function EquipmentModal({
  open, onClose, authUserId, setupSession,
  selectedComboId, onSelectComboId, onRefreshCombos,
  myRole,
}: Props) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isSolo, setIsSolo] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // Resolve the active company — via the service-role proxy when
      // impersonating, so we get the TARGET driver's company, not the admin's.
      let cid: string | null = null;
      if (setupSession) {
        const { getCompanyId } = await import("@/lib/adminSetupClient");
        ({ companyId: cid } = await getCompanyId(setupSession.targetUserId));
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const { data: s } = await supabase
            .from("user_settings")
            .select("active_company_id")
            .eq("user_id", u.user.id)
            .maybeSingle();
          cid = (s?.active_company_id as string | null) ?? null;
        }
      }
      if (cancelled) return;
      setCompanyId(cid);

      if (cid) {
        const { data: co } = await supabase
          .from("companies")
          .select("is_solo")
          .eq("company_id", cid)
          .maybeSingle();
        if (!cancelled) setIsSolo(Boolean((co as any)?.is_solo));
      } else if (!cancelled) {
        setIsSolo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, setupSession]);

  // companyId/isSolo are null until the company fetch resolves — render
  // nothing rather than flashing an empty modal before they land. Once
  // resolved they persist across a close/reopen, so the modal still renders
  // (invisibly, via FullscreenModal's own open handling) while closed.
  if (companyId === null || isSolo === null) return null;

  return (
    <SoloEquipmentModal
      open={open}
      onClose={onClose}
      authUserId={authUserId}
      companyId={companyId}
      selectedComboId={selectedComboId}
      onSelectComboId={onSelectComboId}
      onRefreshCombos={onRefreshCombos}
      setupSession={setupSession}
      myRole={myRole}
      isSolo={isSolo}
    />
  );
}
