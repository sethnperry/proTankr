"use client";
// modals/CredentialsReportModal.tsx
//
// Printable Credentials report: step 1 lets the driver check which
// credentials to include (only ones on file are selectable), step 2 renders
// a clean white print-styled page and hands off to the browser's native
// print dialog (window.print()) -- "Save as PDF" from there is what actually
// produces the .pdf. No PDF library; the same trick every browser-based
// "print report" flow uses (isolate a `.protankr-credentials-print` subtree
// via a print-only stylesheet, hide everything else).

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatMDY, daysUntilISO_ } from "../utils/dates";
import { cardStateFor, EXP_COLOR } from "../cards/cardTheme";

export type LicenseData = {
  license_class: string; license_number: string; state_code: string;
  endorsements: string[]; restrictions: string[];
  issue_date: string | null; expiration_date: string | null;
  hazmat_linked_to_license: boolean;
  hazmat_issue_date: string | null; hazmat_expiration_date: string | null;
} | null;
export type MedicalData = {
  issue_date: string | null; expiration_date: string | null;
  examiner_name: string; attached_to_license: boolean;
} | null;
export type TwicData = {
  card_number: string; issue_date: string | null; expiration_date: string | null;
} | null;

type Props = {
  open: boolean;
  onClose: () => void;
  driverName: string;
  license: LicenseData;
  medical: MedicalData;
  twic: TwicData;
};

function fmt(d: string | null): string {
  return d ? formatMDY(d) : "—";
}

function ExpBadge({ iso }: { iso: string | null }) {
  const state = cardStateFor(iso);
  const days = iso ? daysUntilISO_(iso) : null;
  return (
    <div style={{ textAlign: "right" as const }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Expiration</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: EXP_COLOR[state] }}>{fmt(iso)}</div>
      {days !== null && <div style={{ fontSize: 11, fontWeight: 700, color: EXP_COLOR[state] }}>{days >= 0 ? `${days} days left` : `${Math.abs(days)} days overdue`}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#161616", marginTop: 1 }}>{value}</div>
    </div>
  );
}

function Section({ title, expIso, children }: { title: string; expIso: string | null; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 2, padding: "16px 18px", marginBottom: 16, breakInside: "avoid" as const }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{title}</div>
        <ExpBadge iso={expIso} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
        {children}
      </div>
    </div>
  );
}

const checkboxRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" };
const checkboxRowDisabled: React.CSSProperties = { ...checkboxRow, opacity: 0.4 };

// A driver_licenses/medical_cards/twic_cards row can exist but be entirely
// blank (provisioned with no data ever entered) -- expiration_date is the
// one field every real credential has, so it's the same "on file" signal
// the Reports tile's own credSummary stat already uses.
function isOnFile<T extends { expiration_date: string | null }>(v: T | null): v is T {
  return !!v && !!v.expiration_date;
}

export default function CredentialsReportModal({ open, onClose, driverName, license, medical, twic }: Props) {
  const [step, setStep] = useState<"select" | "preview">("select");
  const [incLicense, setIncLicense] = useState(true);
  const [incMedical, setIncMedical] = useState(true);
  const [incTwic, setIncTwic] = useState(true);

  const licenseOnFile = isOnFile(license);
  const medicalOnFile = isOnFile(medical);
  const twicOnFile = isOnFile(twic);

  useEffect(() => {
    if (!open) return;
    setStep("select");
    setIncLicense(licenseOnFile);
    setIncMedical(medicalOnFile);
    setIncTwic(twicOnFile);
  }, [open, licenseOnFile, medicalOnFile, twicOnFile]);

  if (!open || typeof document === "undefined") return null;

  const anySelected = (incLicense && licenseOnFile) || (incMedical && medicalOnFile) || (incTwic && twicOnFile);
  const generated = formatMDY(new Date().toISOString());

  return createPortal(
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .protankr-credentials-print, .protankr-credentials-print * { visibility: visible !important; }
          .protankr-credentials-print { position: absolute !important; top: 0; left: 0; width: 100% !important; }
        }
      `}</style>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.80)", display: "flex", flexDirection: "column" }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ background: step === "preview" ? "#e9e9ea" : "#111518", margin: "auto 0 0", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", width: "100%", height: "92dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {/* Header (hidden on print) */}
          <div style={{ display: "flex", alignItems: "center", padding: "14px 18px 12px", gap: 10, background: step === "preview" ? "#111518" : undefined }}>
            {step === "preview" && (
              <button type="button" onClick={() => setStep("select")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, flexShrink: 0 }}>
                ‹ Back
              </button>
            )}
            <div style={{ flex: 1, fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>
              {step === "select" ? "Credentials Report" : "Preview"}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
          </div>

          {step === "select" ? (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "6px 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>Choose what to include</div>

                <label style={licenseOnFile ? checkboxRow : checkboxRowDisabled}>
                  <input type="checkbox" disabled={!licenseOnFile} checked={incLicense && licenseOnFile} onChange={(e) => setIncLicense(e.target.checked)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Driver's License</div>
                    {!licenseOnFile && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Not on file</div>}
                  </div>
                </label>

                <label style={medicalOnFile ? checkboxRow : checkboxRowDisabled}>
                  <input type="checkbox" disabled={!medicalOnFile} checked={incMedical && medicalOnFile} onChange={(e) => setIncMedical(e.target.checked)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Medical Card</div>
                    {!medicalOnFile && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Not on file</div>}
                  </div>
                </label>

                <label style={twicOnFile ? checkboxRow : checkboxRowDisabled}>
                  <input type="checkbox" disabled={!twicOnFile} checked={incTwic && twicOnFile} onChange={(e) => setIncTwic(e.target.checked)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>TWIC</div>
                    {!twicOnFile && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Not on file</div>}
                  </div>
                </label>
              </div>
              <div style={{ padding: "12px 18px 28px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <button
                  type="button"
                  disabled={!anySelected}
                  onClick={() => setStep("preview")}
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)",
                    background: anySelected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.06)",
                    color: anySelected ? "#111" : "rgba(255,255,255,0.25)",
                    fontSize: 14, fontWeight: 800, cursor: anySelected ? "pointer" : "default",
                  }}
                >
                  Generate Report
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px 18px" }}>
                <div className="protankr-credentials-print" style={{ background: "#fff", borderRadius: 2, padding: "24px 22px", color: "#111" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, paddingBottom: 14, borderBottom: "2px solid #111" }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#111" }}>Driver Credentials Report</div>
                      <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>{driverName || "Driver"}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.4)" }}>Generated {generated}</div>
                  </div>

                  {incLicense && license && (
                    <Section title="Driver's License" expIso={license.expiration_date}>
                      <Field label="Class" value={license.license_class || "—"} />
                      <Field label="State" value={license.state_code || "—"} />
                      <Field label="License Number" value={license.license_number || "—"} />
                      <Field label="Issue Date" value={fmt(license.issue_date)} />
                      <Field label="Endorsements" value={license.endorsements.length ? license.endorsements.join(", ") : "—"} />
                      <Field label="Restrictions" value={license.restrictions.length ? license.restrictions.join(", ") : "—"} />
                      {license.hazmat_linked_to_license && (
                        <>
                          <Field label="Hazmat Issue" value={fmt(license.hazmat_issue_date)} />
                          <Field label="Hazmat Expiration" value={fmt(license.hazmat_expiration_date)} />
                        </>
                      )}
                    </Section>
                  )}

                  {incMedical && medical && (
                    <Section title="Medical Card" expIso={medical.expiration_date}>
                      <Field label="Examiner" value={medical.examiner_name || "—"} />
                      <Field label="Issue Date" value={fmt(medical.issue_date)} />
                      <Field label="Attached to License" value={medical.attached_to_license ? "Yes" : "No"} />
                    </Section>
                  )}

                  {incTwic && twic && (
                    <Section title="TWIC" expIso={twic.expiration_date}>
                      <Field label="Card Number" value={twic.card_number || "—"} />
                      <Field label="Issue Date" value={fmt(twic.issue_date)} />
                    </Section>
                  )}
                </div>
              </div>
              <div style={{ padding: "12px 18px 28px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 2, border: "1px solid rgba(0,0,0,0.15)", background: "#111", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                >
                  Print / Save PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
