"use client";
// app/planner/vault/VaultDetails.tsx
//
// A quiet gray link at the bottom of the Vault screens that explains, in plain words, how the Vault is
// protected, what it can't do, and what is and isn't hidden.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

const h: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", margin: "18px 0 6px" };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.8)", margin: 0 };
const li: React.CSSProperties = { fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.8)", marginBottom: 4 };

export function VaultDetails() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: "block", margin: "28px auto 8px", background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.32)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
        How your Vault is protected
      </button>
      <FullscreenModal open={open} title="How your Vault is protected" onClose={() => setOpen(false)} footer={null}>
        <p style={p}>Your Vault is locked with a key that only you hold. ProTankr, your company and your admin cannot open it, reset it or look inside it.</p>

        <div style={h}>How it works</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>Your passphrase never leaves this phone. It is used on the phone to unlock a secret key, and that key scrambles and unscrambles your entries.</li>
          <li style={li}>What we store is scrambled text and a copy of your key that is itself locked, once by your passphrase and once by your recovery code. Without one of those, it can't be opened.</li>
          <li style={li}>Entries are scrambled with AES-256 encryption. Your passphrase is stretched with 600,000 rounds of PBKDF2 before it is used, to make guessing slow.</li>
          <li style={li}>Fingerprint or face unlock, if you turn it on, works only on that phone and never sends anything to us.</li>
        </ul>

        <div style={h}>What is hidden, and what isn't</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}><b>Hidden:</b> passwords, usernames, websites, notes, the name on a card, card numbers and PINs.</li>
          <li style={li}><b>Not hidden:</b> an entry's label and category, a card's type, its expiration month and its last few digits. These stay readable so your cards can show up in the fuel screen and the Expirations list.</li>
        </ul>

        <div style={h}>If you lose access</div>
        <p style={p}>If you forget your passphrase, your recovery code opens the Vault and lets you set a new passphrase. If you lose both, nobody can get your entries back, including us. The only option then is to erase the Vault and start over. That is by design: it is what makes the Vault yours alone.</p>

        <div style={h}>What it can't protect against</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>Someone who knows your passphrase or has your recovery code.</li>
          <li style={li}>A phone with malware, or someone watching you type or looking over your shoulder while the Vault is open.</li>
          <li style={li}>Anything you copy out of the Vault. Copied items are cleared from the clipboard after 30 seconds, but anything you paste elsewhere is outside the Vault.</li>
          <li style={li}>A weak passphrase. Use a few unrelated words rather than something short or guessable.</li>
        </ul>

        <div style={h}>Good habits</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>Keep your recovery code on paper, away from this phone.</li>
          <li style={li}>The Vault locks itself after a few idle minutes or a minute in the background. Tap Lock to lock it right away.</li>
          <li style={li}>Keep only what you need here. Card PINs are convenient at the pump, but you can leave a PIN out of an entry if you'd rather not store it.</li>
        </ul>

        <p style={{ ...p, color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 20 }}>This describes how the Vault is built so you know what to expect. No system is perfectly secure, and the Vault is only as safe as your passphrase and your phone.</p>
      </FullscreenModal>
    </>
  );
}
