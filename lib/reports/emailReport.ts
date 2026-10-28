"use client";
// Sends a ReportDoc to the signed-in person's own address as a PDF, and says so on screen.

import { supabase } from "@/lib/supabase/client";
import type { ReportDoc } from "./reportDoc";

function toast(msg: string) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = msg;
  el.setAttribute("role", "status");
  el.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:100000;background:#fff;color:#000;padding:10px 16px;border-radius:2px;font:700 13px Arial,sans-serif;max-width:86vw;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.5)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export async function emailReportPdf(doc: ReportDoc): Promise<boolean> {
  toast("Sending…");
  try {
    const { data: sess } = await supabase.auth.getSession();
    const r = await fetch("/api/report-email", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session?.access_token ?? ""}` }, body: JSON.stringify(doc) });
    const j = (await r.json().catch(() => ({}))) as { to?: string; error?: string };
    toast(r.ok ? `PDF sent to ${j.to}` : j.error ?? "Couldn't send the email.");
    return r.ok;
  } catch (e) { toast((e as Error).message || "Couldn't send the email."); return false; }
}
