"use client";
// app/get-the-app/page.tsx
// Currently a "Request Early Access" contact form (emails the team via
// /api/early-access) -- per explicit product direction, this exact route
// is what eventually becomes the real subscription enrollment/checkout
// page once pricing is finalized, so the URL is intentionally kept stable
// rather than living at a throwaway "/early-access" path.

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";

const FLEET_SIZE_OPTIONS = ["Just me", "2–5 trucks", "6–20 trucks", "20+ trucks"];

export default function GetTheAppPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [fleetSize, setFleetSize] = useState("");
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, fleetSize, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong. Please try again.");
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <SiteHeader active="get-the-app" />

      <section className="hero">
        <h1 className="hero-h1">Get Early Access</h1>
        <p className="hero-sub">
          ProTankr is rolling out access gradually. Tell us a bit about you
          and your operation, and we'll reach out when a spot opens up.
        </p>
        <p className="hero-login-note">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>

      <section className="form-section">
        {sent ? (
          <div className="confirm-card">
            <div className="confirm-title">Request received.</div>
            <p className="confirm-body">
              Thanks, {name.split(" ")[0] || "there"} — we'll be in touch at{" "}
              <strong>{email}</strong> soon.
            </p>
          </div>
        ) : (
          <form className="form-card" onSubmit={onSubmit}>
            {error && <div className="form-error">{error}</div>}

            <label className="field">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>

            <label className="field">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
                inputMode="email"
              />
            </label>

            <label className="field">
              Company <span className="optional">(optional)</span>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
                autoComplete="organization"
              />
            </label>

            <label className="field">
              Fleet size <span className="optional">(optional)</span>
              <select value={fleetSize} onChange={(e) => setFleetSize(e.target.value)}>
                <option value="">Select one</option>
                {FLEET_SIZE_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Anything else? <span className="optional">(optional)</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your operation, timeline, or questions."
                rows={4}
              />
            </label>

            <button aria-busy={!!(sending)} type="submit" disabled={sending} className="submit-btn">
              {sending ? "Sending…" : "Request Early Access"}
            </button>
          </form>
        )}
      </section>

      <style jsx global>{`
        .page {
          --ink: #0d0d0c;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh;
          background: #ffffff;
          color: var(--ink);
          font-family: var(--font);
          overflow-x: hidden;
        }

        .hero { padding: 40px 48px 0; max-width: 620px; }
        .hero-h1 { margin: 0; font: 900 48px var(--font); letter-spacing: -0.02em; color: #111; }
        .hero-sub { margin: 14px 0 0; font: 400 16px var(--font); color: rgba(0,0,0,0.6); line-height: 1.55; }
        .hero-login-note { margin: 14px 0 0; font: 500 13px var(--font); color: rgba(0,0,0,0.5); }
        .hero-login-note a { color: #111; text-decoration: underline; }

        .form-section { padding: 36px 48px 100px; }

        .form-card, .confirm-card {
          max-width: 460px;
          border-radius: 20px;
          background: #f6f6f5;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 32px;
        }

        .form-error {
          margin-bottom: 16px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(200,30,30,0.08);
          color: #b91c1c;
          font: 500 13px var(--font);
        }

        .field {
          display: block;
          margin-bottom: 16px;
          font: 700 12px var(--font);
          letter-spacing: 0.03em;
          color: rgba(0,0,0,0.55);
        }
        .field .optional { font-weight: 400; color: rgba(0,0,0,0.35); text-transform: none; letter-spacing: normal; }
        .field input,
        .field select,
        .field textarea {
          display: block;
          width: 100%;
          margin-top: 6px;
          padding: 11px 13px;
          border-radius: 10px;
          border: 1px solid rgba(0,0,0,0.14);
          background: #ffffff;
          font: 400 14px var(--font);
          color: #111;
          box-sizing: border-box;
        }
        .field textarea { resize: vertical; font-family: var(--font); }
        .field input:focus,
        .field select:focus,
        .field textarea:focus { outline: 2px solid rgba(17,17,17,0.25); outline-offset: 1px; }

        .submit-btn {
          width: 100%;
          margin-top: 4px;
          padding: 13px 16px;
          border-radius: 999px;
          border: none;
          background: #111111;
          color: #ffffff;
          font: 700 14px var(--font);
          cursor: pointer;
        }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .submit-btn:not(:disabled):hover { opacity: 0.85; }

        .confirm-title { font: 800 20px var(--font); color: #111; }
        .confirm-body { margin: 10px 0 0; font: 400 14px var(--font); color: rgba(0,0,0,0.6); line-height: 1.6; }

        @media (max-width: 760px) {
          .hero { padding: 28px 24px 0; }
          .hero-h1 { font-size: 36px; }
          .form-section { padding: 28px 24px 64px; }
          .form-card, .confirm-card { max-width: none; padding: 24px; }
        }
      `}</style>
    </div>
  );
}
