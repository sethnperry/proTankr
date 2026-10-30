"use client";
// app/planner/cards/WalletBack.tsx
//
// Badges, Credentials and the older Terminals page no longer share a tab bar: the Wallet on the Driver
// Dashboard is the way in. This is the way back out.

import { useRouter } from "next/navigation";

export default function WalletBack() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push("/planner/home")}
      style={{ background: "none", border: "none", padding: 0, marginBottom: 14, color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
      ‹ Dashboard
    </button>
  );
}
