"use client";
// app/planner/home/DispatchNotices.tsx
//
// Notices from dispatch on the driver's dashboard ("Meet John G at Shell to load").
// Renders nothing when there are none, or before the table exists.
import { useCallback, useEffect, useState } from "react";
import { dismissNotice, fetchOpenNotices, type DriverNotice } from "@/lib/dispatch/driverNotices";
import { useDashLook } from "./dashLook";

export function DispatchNotices({ userId }: { userId: string | null }) {
  const L = useDashLook();
  const [list, setList] = useState<DriverNotice[]>([]);
  const load = useCallback(async () => { if (userId) setList(await fetchOpenNotices(userId)); }, [userId]);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  if (list.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      {list.map((n) => (
        <div key={n.notice_id} style={{ ...L.primary, padding: "10px 12px", marginBottom: 6, borderLeft: "3px solid #fbbf24" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fbbf24" }}>From dispatch</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{n.title}</div>
          {n.body && <div style={{ fontSize: 13, color: L.muted, marginTop: 3, lineHeight: 1.4 }}>{n.body}</div>}
          <button type="button" className="dash-press" onClick={() => { setList((x) => x.filter((y) => y.notice_id !== n.notice_id)); void dismissNotice(n.notice_id); }}
            style={{ ...L.secondary, color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", marginTop: 8 }}>Got it</button>
        </div>
      ))}
    </div>
  );
}
