"use client";
// app/planner/components/wallet/WalletHub.tsx
//
// The Wallet tool on the Driver Dashboard. One pop-out to pick what you want: Terminal Cards (opens right
// here), Badges, Credentials, or the Vault. The last three open their existing pages for now.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "@/app/planner/home/dashLook";
import type { ToolItem } from "@/app/planner/home/DashboardChrome";
import { WalletTerminalCards } from "./WalletTerminalCards";

export const walletTool = (onClick: () => void): ToolItem => ({ icon: "card", label: "Wallet", sub: "Cards, badges, credentials, vault", onClick });

const ROWS = [
  { id: "cards", label: "Terminal Cards", sub: "Access cards, training and letter" },
  { id: "badges", label: "Badges", sub: "Port and site IDs" },
  { id: "credentials", label: "Credentials", sub: "License, medical, TWIC" },
  { id: "vault", label: "Vault", sub: "Passwords and cards" },
] as const;

export function WalletHub({ open, onClose }: { open: boolean; onClose: () => void }) {
  const L = useDashLook();
  const router = useRouter();
  const [kind, setKind] = useState<"cards" | null>(null);
  const pick = (id: (typeof ROWS)[number]["id"]) => {
    if (id === "cards") return setKind("cards");
    onClose();
    router.push(id === "badges" ? "/planner/cards/badges" : id === "credentials" ? "/planner/cards/credentials" : "/planner/vault");
  };
  return (
    <>
      <FullscreenModal open={open && !kind} title="Wallet" onClose={onClose} footer={null}>
        {ROWS.map((r) => (
          <button key={r.id} type="button" className="dash-press" onClick={() => pick(r.id)}
            style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "14px 14px", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{r.label} ›</div>
            <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{r.sub}</div>
          </button>
        ))}
      </FullscreenModal>
      <WalletTerminalCards open={open && kind === "cards"} onClose={() => setKind(null)} />
    </>
  );
}
