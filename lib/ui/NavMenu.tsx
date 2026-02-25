"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

// ── Types ─────────────────────────────────────────────────────────────

type Membership = {
  company_id: string;
  role: string;
  company: { company_id: string; company_name: string } | null;
};

// ── NavMenu ───────────────────────────────────────────────────────────

export default function NavMenu({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  const supabase   = useMemo(() => createSupabaseBrowser(), []);
  const router     = useRouter();
  const panelRef   = useRef<HTMLDivElement>(null);
  const btnRef     = useRef<HTMLButtonElement>(null);

  const [open,         setOpen]         = useState(false);
  const [memberships,  setMemberships]  = useState<Membership[]>([]);
  const [activeId,     setActiveId]     = useState<string>("");
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [switching,    setSwitching]    = useState(false);

  // ── Load memberships + active company ─────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      const [{ data: mRows }, { data: sRow }] = await Promise.all([
        supabase
          .from("user_companies")
          .select("company_id, role, company:companies(company_id, company_name)")
          .eq("user_id", userId),
        supabase
          .from("user_settings")
          .select("active_company_id")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const ms = (mRows ?? []) as unknown as Membership[];
      const current = (sRow?.active_company_id as string | null) ?? ms[0]?.company_id ?? "";

      setMemberships(ms);
      setActiveId(current);

      const activeMem = ms.find(m => m.company_id === current);
      setIsAdmin(activeMem?.role === "admin");
    }

    load();
    return () => { cancelled = true; };
  }, [userId, supabase]);

  // ── Close on outside click ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Switch company ────────────────────────────────────────────────
  async function switchCompany(id: string) {
    if (id === activeId || switching) return;
    setSwitching(true);
    setActiveId(id);

    const mem = memberships.find(m => m.company_id === id);
    setIsAdmin(mem?.role === "admin");

    await supabase.rpc("set_active_company", { p_company_id: id });
    setSwitching(false);

    // Reload the page so all equipment data re-fetches under new company
    router.refresh();
  }

  // ── Sign out ──────────────────────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const activeName = memberships.find(m => m.company_id === activeId)?.company?.company_name ?? "";

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>

      {/* Hamburger button */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Open navigation menu"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 5,
          width: 36,
          height: 36,
          borderRadius: 10,
          border: open
            ? "1px solid rgba(255,255,255,0.2)"
            : "1px solid rgba(255,255,255,0.08)",
          background: open
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.04)",
          cursor: "pointer",
          padding: 0,
          transition: "background 150ms, border 150ms",
          flexShrink: 0,
        }}
      >
        {/* Animated burger → X */}
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            display: "block",
            width: 16,
            height: 1.5,
            borderRadius: 2,
            background: "rgba(255,255,255,0.7)",
            transition: "transform 200ms, opacity 200ms",
            transform: open
              ? i === 0 ? "translateY(6.5px) rotate(45deg)"
              : i === 2 ? "translateY(-6.5px) rotate(-45deg)"
              : "scaleX(0)"
              : "none",
            opacity: open && i === 1 ? 0 : 1,
          }} />
        ))}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 240,
            background: "#111",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
            overflow: "hidden",
            zIndex: 500,
          }}
        >
          {/* User info */}
          <div style={{
            padding: "12px 14px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 3,
            }}>
              Signed in as
            </div>
            <div style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {email || "—"}
            </div>
          </div>

          {/* Company section */}
          {memberships.length > 0 && (
            <div style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)",
                marginBottom: 8,
              }}>
                Company
              </div>

              {memberships.length === 1 ? (
                // Single company — just show the name
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.9)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "#f5a623", flexShrink: 0,
                  }} />
                  {activeName}
                  {isAdmin && (
                    <span style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 10,
                      background: "rgba(245,166,35,0.15)",
                      color: "#f5a623",
                      border: "1px solid rgba(245,166,35,0.3)",
                    }}>
                      ADMIN
                    </span>
                  )}
                </div>
              ) : (
                // Multiple companies — show switcher
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {memberships.map(m => {
                    const isActive = m.company_id === activeId;
                    return (
                      <button
                        key={m.company_id}
                        type="button"
                        onClick={() => switchCompany(m.company_id)}
                        disabled={switching}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: isActive
                            ? "1px solid rgba(245,166,35,0.3)"
                            : "1px solid transparent",
                          background: isActive
                            ? "rgba(245,166,35,0.08)"
                            : "rgba(255,255,255,0.03)",
                          cursor: switching ? "wait" : "pointer",
                          textAlign: "left",
                          transition: "background 120ms",
                          width: "100%",
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                          background: isActive ? "#f5a623" : "rgba(255,255,255,0.2)",
                          transition: "background 120ms",
                        }} />
                        <span style={{
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {m.company?.company_name ?? "Company"}
                        </span>
                        {m.role === "admin" && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: 8,
                            background: "rgba(245,166,35,0.12)",
                            color: "#f5a623",
                            flexShrink: 0,
                          }}>
                            ADMIN
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Nav links */}
          <div style={{ padding: "8px 6px" }}>
            {isAdmin && (
              <NavLink
                href="/admin"
                icon="⚙"
                label="Company Admin"
                onClick={() => setOpen(false)}
              />
            )}
            <NavLink
              href="#"
              icon="↩"
              label="Sign Out"
              onClick={(e) => { e.preventDefault(); signOut(); }}
              danger
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── NavLink ───────────────────────────────────────────────────────────

function NavLink({
  href,
  icon,
  label,
  onClick,
  danger,
}: {
  href: string;
  icon: string;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  danger?: boolean;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        color: danger ? "#e05555" : "rgba(255,255,255,0.75)",
        textDecoration: "none",
        cursor: "pointer",
        transition: "background 100ms",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 14, opacity: 0.7, width: 18, textAlign: "center" }}>{icon}</span>
      {label}
    </a>
  );
}
