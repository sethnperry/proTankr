"use client";
// app/planner/hooks/useLeaveTo.ts
//
// Leaving the Planner for another screen. A plain cover (spinner + text) goes up
// in the same render the modal closes, so the Planner never flashes before the
// next screen opens. Called from a window opened over another screen, there's
// nothing to cover: it just navigates (or, if already there, does nothing).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useLeaveTo(pathname: string) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => {
    if (pathname !== "/planner") setLeaving(null);
  }, [pathname]);

  const leaveTo = useCallback(
    (href: string, label: string) => {
      if (typeof window !== "undefined" && window.location.pathname !== "/planner") {
        const path = href.split("?")[0];
        if (path === window.location.pathname) {
          if (href.includes("arrive=1")) window.dispatchEvent(new Event("protankr:arrive"));
        } else {
          router.push(href);
        }
        return;
      }
      setLeaving(label);
      router.push(href);
    },
    [router],
  );

  return { leaving, leaveTo };
}
