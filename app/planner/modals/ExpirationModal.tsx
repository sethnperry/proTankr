"use client";
// modals/ExpirationModal.tsx
//
// Rework (2026-08-11), per explicit user direction: this modal used to show
// a full "directory" of every terminal in the currently-selected city
// (active/expired/not-carded, all of them) underneath a separate list of
// real alert items -- confusing, ungrouped, and scoped to only one city.
// It now shows ONLY things that are actually expired or expiring soon
// (equipment permits, terminal cards -- any city, not just the current
// one -- badges, and license/medical/TWIC credentials), organized into
// the same section groupings the Dispatch tab uses (Equipment / Terminal
// Cards grouped by city / Badges / Credentials -- see
// app/planner/dispatch/page.tsx).
//
// Rework (2026-09-15), per explicit user direction: the generic per-item
// "—" dismiss (useExpirations.ts's localStorage-backed "defer" set) was
// wrong for two reasons at once -- it was offered on every item type
// (equipment/badges/credentials included), and it was only ever a client-
// side hide, not a real fix, which is why a driver reported it "grays out
// the item then returns on refresh" (a real race in useExpirations.ts's
// own auto-prune effect: if the terminals catalog resolves before
// accessDateByTerminalId does, dataLoaded can flip true while a just-
// deferred terminal's item is still momentarily absent from `items`, and
// the auto-prune effect reads that as "this id no longer applies" and
// silently un-defers it). Per the user's own framing: "the only reason to
// stay [carded] at a terminal is to load the truck... it would be starting
// over like a new terminal" -- dismissing an alert should mean something
// real. Now:
// - Equipment/Badges/Credentials get NO dismiss control at all -- the only
//   real fix for those is renewing the permit/credential, which this modal
//   already routes to (tapping the row).
// - Terminal Cards only get a control when actually EXPIRED (red) -- an
//   "expiring soon" (amber) card is still actionable by re-carding before
//   it lapses, nothing to dismiss yet.
// - That control isn't a dismiss anymore -- it deactivates the card for
//   real (deletes the terminal_access row via onDeactivateTerminal, the
//   same "not carded" state a terminal that's never been visited is
//   already in), behind an inline confirm-in-place step (same pattern
//   Cards tab's own Deactivate/Remove already use). Since this removes the
//   underlying data driving the item's existence rather than just hiding
//   it, it can't "return on refresh" the way the old defer bug did, and it
//   genuinely reflects "you'll start fresh here next time," matching the
//   confirm copy.
// The old localStorage "defer" mechanism (useExpirations.ts's
// toggleDefer/deferredItems) is untouched and still backs
// expiredCount/warningCount/the bell badge -- just no longer wired into
// this modal's own per-item controls.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { btnDanger, btnSecondary } from "../cards/cardTheme";
import type { ExpirationItem } from "../hooks/useExpirations";

type Props = {
  open: boolean;
  onClose: () => void;
  items: ExpirationItem[];
  activeItems: ExpirationItem[];
  onOpenEquipment: () => void;
  onOpenTerminals: () => void;
  formatMDYWithCountdown_: (iso: string) => string;
  // Deletes the terminal_access row for this terminal (real "not carded"
  // reset, same call the Loading modal's "Back to Planner" exit uses) --
  // see useTerminals.ts's own deleteAccessDateForTerminal.
  onDeactivateTerminal: (terminalId: string) => Promise<void>;
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const BTN: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.80)",
  fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2,
};

function SectionLabel({ left, right }: { left: string; right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.30)" }}>{left}</div>
      {right && <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.20)" }}>{right}</div>}
    </div>
  );
}

// ── Unified card — used for every entity type ─────────────────────────────────
// deactivate is only ever passed for an expired terminal card (see ExpGroup
// below) -- every other item renders with no button at all now.
function ExpirationCard({
  label, statusText, expired, urgent, onTap,
  deactivate,
}: {
  label: string;
  statusText: string;
  expired: boolean;
  urgent: boolean;
  onTap: () => void;
  deactivate?: DeactivateProps;
}) {
  const border = expired
    ? "1px solid rgba(239,68,68,0.22)"
    : urgent
      ? "1px solid rgba(234,179,8,0.22)"
      : "1px solid rgba(255,255,255,0.07)";

  const bg = expired
    ? "rgba(239,68,68,0.06)"
    : urgent
      ? "rgba(234,179,8,0.05)"
      : "rgba(255,255,255,0.03)";

  const statusColor = expired
    ? "rgba(239,68,68,0.88)"
    : urgent
      ? "rgba(234,179,8,0.88)"
      : "rgba(255,255,255,0.38)";

  if (deactivate?.confirming) {
    return (
      <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 8 }}>
          Deactivate this terminal card? You'll need to card in again next time you're here -- but nothing stops you from loading there in the future.
        </div>
        {deactivate.error && (
          <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{deactivate.error}</div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={deactivate.onConfirm} disabled={deactivate.busy} style={{ ...btnDanger, flex: 1, opacity: deactivate.busy ? 0.6 : 1 }}>
            {deactivate.busy ? "Deactivating…" : "Yes, deactivate"}
          </button>
          <button type="button" onClick={deactivate.onCancel} disabled={deactivate.busy} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border, background: bg }}>
      <div
        role="button" tabIndex={0}
        onClick={onTap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: statusColor, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
        {statusText}
      </div>

      {deactivate && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); deactivate.onRequest(); }}
          title="Deactivate this terminal card"
          aria-label="Deactivate"
          style={{
            background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5,
            cursor: "pointer", padding: "2px 7px", fontSize: 13, color: "#ef4444", flexShrink: 0, lineHeight: 1.6, fontWeight: 700,
          }}
        >
          —
        </button>
      )}
    </div>
  );
}

// Per-item deactivate-confirm state, threaded down to ExpirationCard.
type DeactivateProps = {
  confirming: boolean; busy: boolean; error: string | null;
  onRequest: () => void; onConfirm: () => void; onCancel: () => void;
};

// A section of cards for an arbitrary item list. Used for Equipment/Badges/
// Credentials (no deactivate control at all) and once per city for Terminal
// Cards (deactivate control on expired items only). Renders nothing if
// there's genuinely nothing to show.
function ExpGroup({
  items, tapAction, labelFor, formatMDYWithCountdown_, deactivateTerminal,
}: {
  items: ExpirationItem[];
  tapAction: (item: ExpirationItem) => void;
  labelFor: (item: ExpirationItem) => string;
  formatMDYWithCountdown_: (iso: string) => string;
  // Only passed for the Terminal Cards group -- wires the per-item
  // deactivate confirm state (see ExpirationModal's own confirmDeactivateId).
  deactivateTerminal?: (item: ExpirationItem) => DeactivateProps;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {items.map((item) => (
        <ExpirationCard
          key={item.id}
          label={labelFor(item)}
          statusText={`${item.expired ? "⛔" : "⚠"} ${formatMDYWithCountdown_(item.expiresISO)}`}
          expired={item.expired} urgent={!item.expired}
          onTap={() => tapAction(item)}
          deactivate={item.expired && deactivateTerminal ? deactivateTerminal(item) : undefined}
        />
      ))}
    </div>
  );
}

function equipmentLabel(item: ExpirationItem): string {
  const kind = item.entityType === "truck" ? "Truck" : "Trailer";
  return `${kind} ${item.entityName} — ${item.label}`;
}

// ── Report ────────────────────────────────────────────────────────────────────
// Mirrors the modal's own section grouping exactly -- Equipment, Terminal
// Cards grouped by city, Badges, Credentials -- built only from active
// (non-dismissed) items, same scope as what the modal itself shows front
// and center.
function buildReport(activeItems: ExpirationItem[], formatMDYWithCountdown_: (iso: string) => string): string {
  const date = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const lines: string[] = [`Expiration Report — ${date}`, ""];
  let any = false;

  const equipment = activeItems.filter((i) => i.entityType === "truck" || i.entityType === "trailer");
  if (equipment.length > 0) {
    any = true;
    lines.push("EQUIPMENT");
    for (const i of equipment) lines.push(`${equipmentLabel(i)}  ${formatMDYWithCountdown_(i.expiresISO)}`);
    lines.push("");
  }

  const terminals = activeItems.filter((i) => i.entityType === "terminal");
  if (terminals.length > 0) {
    any = true;
    lines.push("TERMINAL CARDS");
    const byCity = new Map<string, ExpirationItem[]>();
    for (const i of terminals) {
      const city = i.city && i.state ? `${i.city}, ${i.state}` : i.city || i.state || "Other";
      if (!byCity.has(city)) byCity.set(city, []);
      byCity.get(city)!.push(i);
    }
    const cities = Array.from(byCity.entries()).sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
    for (const [city, cityItems] of cities) {
      lines.push(city.toUpperCase());
      for (const i of cityItems) lines.push(`${i.entityName}  ${formatMDYWithCountdown_(i.expiresISO)}`);
    }
    lines.push("");
  }

  const badges = activeItems.filter((i) => i.entityType === "badge");
  if (badges.length > 0) {
    any = true;
    lines.push("BADGES");
    for (const i of badges) lines.push(`${i.entityName}  ${formatMDYWithCountdown_(i.expiresISO)}`);
    lines.push("");
  }

  const credentials = activeItems.filter((i) => i.entityType === "credential");
  if (credentials.length > 0) {
    any = true;
    lines.push("CREDENTIALS");
    for (const i of credentials) lines.push(`${i.entityName}  ${formatMDYWithCountdown_(i.expiresISO)}`);
    lines.push("");
  }

  if (!any) lines.push("Nothing expired or expiring soon.");

  return lines.join("\n").trimEnd();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function ExpirationModal({
  open, onClose, items, activeItems,
  onOpenEquipment, onOpenTerminals, formatMDYWithCountdown_, onDeactivateTerminal,
}: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");

  // Per-item deactivate confirm state -- only one at a time, keyed by the
  // item's own id (terminal-{terminalId}).
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const report = buildReport(activeItems, formatMDYWithCountdown_);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setShareError("Could not copy to clipboard."); }
  };
  const handleShare = async () => {
    setShareError("");
    if (navigator.share) { try { await navigator.share({ title: "Expiration Report", text: report }); } catch {} }
    else { window.open(`mailto:?subject=${encodeURIComponent("Expiration Report")}&body=${encodeURIComponent(report)}`); }
  };

  const tapAction = (item: ExpirationItem) => {
    onClose();
    if (item.entityType === "terminal") onOpenTerminals();
    else if (item.entityType === "badge") router.push("/planner/cards/badges");
    else if (item.entityType === "credential") router.push("/planner/cards/credentials");
    else onOpenEquipment();
  };

  const activeEquipment   = activeItems.filter((i) => i.entityType === "truck" || i.entityType === "trailer");
  const activeTerminals   = activeItems.filter((i) => i.entityType === "terminal");
  const activeBadges      = activeItems.filter((i) => i.entityType === "badge");
  const activeCredentials = activeItems.filter((i) => i.entityType === "credential");

  async function handleConfirmDeactivate(item: ExpirationItem) {
    setDeactivateBusy(true);
    setDeactivateError(null);
    try {
      await onDeactivateTerminal(item.entityId);
      setConfirmDeactivateId(null);
    } catch (e: any) {
      setDeactivateError(e?.message ?? "Could not deactivate this card. Try again.");
    } finally {
      setDeactivateBusy(false);
    }
  }

  const deactivateTerminal = (item: ExpirationItem) => ({
    confirming: confirmDeactivateId === item.id,
    busy: confirmDeactivateId === item.id && deactivateBusy,
    error: confirmDeactivateId === item.id ? deactivateError : null,
    onRequest: () => { setConfirmDeactivateId(item.id); setDeactivateError(null); },
    onConfirm: () => handleConfirmDeactivate(item),
    onCancel: () => { setConfirmDeactivateId(null); setDeactivateError(null); },
  });

  // Terminal cards grouped by city -- "Other" bucket sorts last, same
  // convention as the Dispatch tab's own cardsByCity ("No City" there).
  const terminalCities = (() => {
    const byCity = new Map<string, ExpirationItem[]>();
    const bucketFor = (i: ExpirationItem) => (i.city && i.state ? `${i.city}, ${i.state}` : i.city || i.state || "Other");
    for (const i of activeTerminals) {
      const city = bucketFor(i);
      if (!byCity.has(city)) byCity.set(city, []);
      byCity.get(city)!.push(i);
    }
    return Array.from(byCity.entries()).sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  })();

  return (
    <FullscreenModal open={open} title="Expirations" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {activeEquipment.length > 0 && (
          <div>
            <SectionLabel left="Equipment" />
            <ExpGroup
              items={activeEquipment}
              tapAction={tapAction}
              labelFor={equipmentLabel} formatMDYWithCountdown_={formatMDYWithCountdown_}
            />
          </div>
        )}

        {terminalCities.length > 0 && (
          <div>
            <SectionLabel left="Terminal Cards" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {terminalCities.map(([city, cityItems]) => (
                <div key={city}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>
                    {city}
                  </div>
                  <ExpGroup
                    items={cityItems}
                    tapAction={tapAction}
                    labelFor={(item) => item.entityName} formatMDYWithCountdown_={formatMDYWithCountdown_}
                    deactivateTerminal={deactivateTerminal}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeBadges.length > 0 && (
          <div>
            <SectionLabel left="Badges" />
            <ExpGroup
              items={activeBadges}
              tapAction={tapAction}
              labelFor={(item) => item.entityName} formatMDYWithCountdown_={formatMDYWithCountdown_}
            />
          </div>
        )}

        {activeCredentials.length > 0 && (
          <div>
            <SectionLabel left="Credentials" />
            <ExpGroup
              items={activeCredentials}
              tapAction={tapAction}
              labelFor={(item) => item.entityName} formatMDYWithCountdown_={formatMDYWithCountdown_}
            />
          </div>
        )}

        {items.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>Nothing expired or expiring soon.</div>
        )}

        {/* ── Share ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>Share Report</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleCopy} style={BTN}>{copied ? "✓ Copied" : "Copy"}</button>
            <button type="button" onClick={handleShare} style={BTN}>Share / Email</button>
          </div>
          {shareError && <div style={{ marginTop: 6, fontSize: 11, color: "rgba(239,68,68,0.80)" }}>{shareError}</div>}
        </div>

      </div>
    </FullscreenModal>
  );
}
