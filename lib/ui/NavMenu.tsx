"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ROLE_LABELS, isRole, type Role } from "./driver/role";
import { canReachDestination } from "./driver/navDestinations";

type Membership = {
  company_id: string;
  role: string;
  company: { company_id: string; company_name: string; is_solo: boolean | null } | null;
};

export default function NavMenu({ darkMode, anchor, onOpenSettings }: { darkMode?: boolean; anchor?: "left" | "right"; onOpenSettings?: () => void } = {}) {
  const router   = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  const [open,        setOpen]        = useState(false);
  const [email,       setEmail]       = useState("");
  const [userId,      setUserId]      = useState("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId,    setActiveId]    = useState("");
  const [myRole,      setMyRole]      = useState("");
  const [switching,   setSwitching]   = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const isPlanner = pathname === "/" || pathname === "/planner" || Boolean(pathname?.startsWith("/planner/"));
  // The Planner's own dark-mode toggle only lightens its hamburger icon when
  // the header is actually in light mode -- every other page (Profile/Admin/
  // etc.) already has a dark background regardless of this setting, so they
  // keep the light hamburger they've always had.
  const isPlannerLight = isPlanner && !darkMode;
  const isAdmin_  = pathname === "/admin";
  const isSuperAdmin_ = pathname === "/superadmin";
  const isReports_ = pathname === "/planner/reports";
  const isAdmin   = myRole === "admin" || myRole === "lead" || myRole === "dispatch";

  // Destination links (Planner/Dispatch/Cards/Vault), now that the visible
  // tab bar is gone and every page lives in this menu instead -- see
  // lib/ui/driver/navDestinations.ts for the role rules. `role` narrows the
  // raw fetched string (which could be anything, since `role` has no DB
  // CHECK constraint -- see role.ts's own comment) to the app-level Role
  // union, falling back to null for anything unrecognized, same graceful
  // fallback every other role-check in this codebase already uses.
  //
  // isPlannerPage is deliberately narrower than the existing isPlanner flag
  // above -- isPlanner means "anywhere inside the Planner section at all"
  // (drives the hamburger icon's own styling/anchor default) and would
  // incorrectly hide the new Planner link while on, say, /planner/vault.
  const role: Role | null = isRole(myRole) ? myRole : null;
  // A solo company's member is role 'admin' but navigates like a driver
  // (Planner/Cards/Vault, never the fleet Dispatch page) -- see
  // navDestinations.ts. Derived from the active company's own is_solo flag.
  const isSolo = Boolean(memberships.find(m => m.company_id === activeId)?.company?.is_solo);
  const isPlannerPage = pathname === "/planner";
  const isDispatchPage = Boolean(pathname?.startsWith("/planner/dispatch"));
  const isCardsPage = Boolean(pathname?.startsWith("/planner/cards"));
  const isVaultPage = Boolean(pathname?.startsWith("/planner/vault"));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setEmail(user.email ?? "");
      setUserId(user.id);
      const [{ data: mRows }, { data: sRow }, { data: superAdminData }] = await Promise.all([
        supabase
          .from("user_companies")
          .select("company_id, role, company:companies(company_id, company_name, is_solo)")
          .eq("user_id", user.id),
        supabase
          .from("user_settings")
          .select("active_company_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.rpc("is_super_admin"),
      ]);
      if (cancelled) return;
      const ms = (mRows ?? []) as unknown as Membership[];
      const current = (sRow?.active_company_id as string | null) ?? ms[0]?.company_id ?? "";
      setMemberships(ms);
      setActiveId(current);
      setMyRole(ms.find(m => m.company_id === current)?.role ?? "");
      setIsSuperAdmin(Boolean(superAdminData));
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function switchCompany(id: string) {
    if (id === activeId || switching) return;
    setSwitching(true);
    setActiveId(id);
    setMyRole(memberships.find(m => m.company_id === id)?.role ?? "");
    await supabase.rpc("set_active_company", { p_company_id: id });
    window.location.reload();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!userId) return null;

  const activeName = memberships.find(m => m.company_id === activeId)?.company?.company_name ?? "";

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Open navigation menu"
        style={{
          display: "flex", flexDirection: "column", justifyContent: "center",
          alignItems: "center", gap: 5, width: 36, height: 36, borderRadius: 6,
          border: isPlanner ? "none" : open ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.08)",
          background: isPlanner ? "none" : open ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          cursor: "pointer", padding: 0, transition: "background 150ms, border 150ms", flexShrink: 0,
        }}
      >
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            display: "block", width: isPlanner ? 18 : 16, height: isPlanner ? 2 : 1.5, borderRadius: 2,
            background: isPlannerLight ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.7)",
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

      {open && (
        <div ref={panelRef} style={{
          position: "absolute", top: "calc(100% + 8px)",
          // The button sits at the left edge of the header on the Planner
          // and Admin (button-on-left contexts) but at the right edge
          // everywhere else (Profile, Super Admin, etc.) -- anchoring the
          // panel to the SAME side the button is on (left:0 opens
          // rightward, right:0 opens leftward) keeps it on-screen in both
          // contexts instead of hanging off the edge of the viewport.
          // Explicit `anchor` prop wins when a caller knows its own layout
          // (Admin's header moved the button to the left 2026-08-17,
          // independent of the Planner-only `isPlanner` route check this
          // used to rely on); falls back to the route guess otherwise.
          ...((anchor ?? (isPlanner ? "left" : "right")) === "left" ? { left: 0 } : { right: 0 }),
          width: 240, background: "#111",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
          boxShadow: "0 16px 48px rgba(0,0,0,0.7)", overflow: "hidden", zIndex: 500,
        }}>
          {/* User */}
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>
              Signed in as
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {email || "—"}
            </div>
          </div>

          {/* Company switcher -- hidden for super admins, who pick/switch
              companies from the ProTankr Dash dropdown instead of cluttering
              this menu with every company they can reach. */}
          {memberships.length > 0 && !isSuperAdmin && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
                Company
              </div>
              {memberships.length === 1 ? (
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.55)", flexShrink: 0 }} />
                  {activeName}
                  {myRole !== "driver" && myRole !== "" && <AdminBadge role={myRole} />}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {memberships.map(m => {
                    const active = m.company_id === activeId;
                    return (
                      <button key={m.company_id} type="button"
                        onClick={() => switchCompany(m.company_id)}
                        disabled={switching}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                          borderRadius: 6,
                          border: active ? "1px solid rgba(255,255,255,0.20)" : "1px solid transparent",
                          background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                          cursor: switching ? "wait" : "pointer", textAlign: "left" as const,
                          transition: "background 120ms", width: "100%",
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)" }} />
                        <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {m.company?.company_name ?? "Company"}
                        </span>
                        {m.role !== "driver" && <AdminBadge role={m.role} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Nav links */}
          <div style={{ padding: "8px 6px" }}>
            {/* Destination links -- the primary nav now that the tab bar is
                gone. "Back to Planner" right below stays as-is (its own
                purpose, the only way back into the Planner section from
                Admin/Super Admin/Learn) even though it now overlaps with
                the Planner link here while already inside that section --
                harmless, same destination either way. */}
            {canReachDestination("planner", role, isSuperAdmin, isSolo) && !isPlannerPage && (
              <NavLink href="/planner" icon="▤" label="Planner" onClick={() => setOpen(false)} />
            )}
            {canReachDestination("dispatch", role, isSuperAdmin, isSolo) && !isDispatchPage && (
              <NavLink href="/planner/dispatch" icon="◫" label="Dispatch" onClick={() => setOpen(false)} />
            )}
            {canReachDestination("cards", role, isSuperAdmin, isSolo) && !isCardsPage && (
              <NavLink href="/planner/cards" icon="▥" label="Cards" onClick={() => setOpen(false)} />
            )}
            {canReachDestination("vault", role, isSuperAdmin, isSolo) && !isVaultPage && (
              <NavLink href="/planner/vault" icon="🔒" label="Vault" onClick={() => setOpen(false)} />
            )}
            {!isPlanner && (
              <NavLink href="/planner" icon="⟵" label="Back to Planner" onClick={() => setOpen(false)} />
            )}
            {!isReports_ && (
              <NavLink href="/planner/reports" icon="▤" label="Reports" onClick={() => setOpen(false)} />
            )}
            {isAdmin && !isAdmin_ && (
              <NavLink href="/admin" icon="⚙" label="Company Admin" onClick={() => setOpen(false)} />
            )}
            {isSuperAdmin && !isSuperAdmin_ && (
              <NavLink href="/superadmin" icon="◈" label="ProTankr Dash" onClick={() => setOpen(false)} />
            )}
            <NavLink href="/learn" icon="?" label="Learn" onClick={() => setOpen(false)} />
            {/* Settings used to be its own gear icon in the Planner header's
                icon strip -- moved here per explicit direction to reduce
                that strip's icon count. Only rendered when a caller actually
                wires up onOpenSettings (today: CalculatorLayoutClient, the
                only place with a SettingsModal instance mounted) -- every
                other NavMenu consumer (Admin, Super Admin, Profile) simply
                omits the prop and gets no Settings row, same as they had no
                gear icon near their own header before this change either. */}
            {onOpenSettings && (
              <NavLink href="#" icon="⚙" label="Settings"
                onClick={e => { e.preventDefault(); setOpen(false); onOpenSettings(); }} />
            )}
            <NavLink href="#" icon="↩" label="Sign Out"
              onClick={e => { e.preventDefault(); signOut(); }} danger />
          </div>
        </div>
      )}
    </div>
  );
}

function AdminBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role as Role] ?? role.toUpperCase();
  return (
    <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.70)", border: "1px solid rgba(255,255,255,0.20)", flexShrink: 0 }}>
      {label.toUpperCase()}
    </span>
  );
}

function NavLink({ href, icon, label, onClick, danger }: {
  href: string; icon: string; label: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  danger?: boolean;
}) {
  // A plain <a href> here forces a full page reload on every nav-menu tap
  // (Reports, Company Admin, Back to Planner, etc.) -- unlike the tab bar,
  // which already navigates client-side via router.push. A full reload
  // re-renders on the server first, which has no access to localStorage
  // (where dark mode/accent color live), so the shared header briefly (or
  // persistently, depending on hydration timing) paints its light default
  // before client JS corrects it -- exactly the "reverts to light mode but
  // Settings still says it's on" report. next/link fixes this the same way
  // the tab bar already avoids it -- real client-side transition, no
  // remount of CalculatorShellProvider for routes sharing its layout.
  return (
    <Link href={href} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, color: danger ? "#e05555" : "rgba(255,255,255,0.75)", textDecoration: "none", cursor: "pointer", transition: "background 100ms" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 14, opacity: 0.7, width: 18, textAlign: "center" as const }}>{icon}</span>
      {label}
    </Link>
  );
}
