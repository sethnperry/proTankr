// lib/worklog/emailWorklog.ts
//
// The Work Log email: a short message and the report as a PDF attachment. (The report itself used to
// be the email body; mail apps render that too differently to be trusted.)

import type { Worklog } from "./buildWorklog";
import { renderWorklogPdf, worklogFileName } from "./pdfWorklog";
import { worklogSubject } from "./renderWorklog";
import { isLongRange } from "@/lib/reports/periodOptions";

const LOGO_URL = "https://protankr.com/icons/icon-email-black.png";
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${wd} ${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
};

export function worklogMessage(w: Pick<Worklog, "range" | "title">): string {
  const kind = ["Weekly", "Biweekly", "Semi-monthly", "Monthly"].includes(w.title) ? `${w.title.toLowerCase()} DROP report` : "DROP report";
  return `Attached is your ${kind} for the period ${longDate(w.range.start)} - ${longDate(w.range.end)}. Save this email for your personal records and/or print the attachment to file as payroll backup.`;
}

async function fetchLogo(): Promise<Uint8Array | null> {
  try {
    const r = await fetch(LOGO_URL);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}

export async function sendWorklogEmail(to: string, w: Worklog, o: { sample?: boolean } = {}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const from = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  const pdf = await renderWorklogPdf(w, { mode: isLongRange(w.range.start, w.range.end) ? "condensed" : "full", logo: await fetchLogo() });
  const msg = worklogMessage(w);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `ProTankr <${from}>`, to: [to],
      subject: `${o.sample ? "[Sample] " : ""}${worklogSubject(w)}`,
      text: msg,
      html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111">${msg}</p>`,
      attachments: [{ filename: worklogFileName(w), content: Buffer.from(pdf).toString("base64") }],
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}
