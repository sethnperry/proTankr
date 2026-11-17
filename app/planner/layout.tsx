// app/planner/layout.tsx
//
// Server component (no "use client") specifically so it can export its own
// `viewport`/`metadata` -- Next's Metadata API requires those to live in a
// server component. Planner/Cards/Vault all share the dynamic gradient
// header (see CalculatorLayoutClient's Header, which can be light/dark-
// graphite/custom-accent depending on the user's theme settings), so this
// layout needs its own overrides instead of inheriting the app-wide dark
// ones from the root layout. Every other (still dark-themed, no colored
// header) screen keeps the root layout's defaults untouched.
//
// - Android's status bar is drawn by the OS and colored via theme-color,
//   which CalculatorLayoutClient's Header keeps in sync with the live
//   theme client-side (see its useEffect) -- no blending with page content,
//   so no extra work needed here beyond the initial value.
// - iOS only honors `apple-mobile-web-app-status-bar-style` for a home-
//   screen install, not theme-color, and that only supports a few fixed
//   keywords (no arbitrary color) -- "black-translucent" is the one that
//   makes the status bar transparent so our own header's current color
//   shows through underneath it, which is what actually eliminates the
//   seam between the status bar and a colored header. That requires
//   `viewport-fit: cover` so the page draws underneath the notch/status
//   bar at all; CalculatorLayoutClient's Header pads itself out with
//   `env(safe-area-inset-top)` so its own icon row still clears it.
//
// All actual interactive shell logic (header, tab bar, modals) lives in
// CalculatorLayoutClient.tsx, a client component this just renders.

import type { Metadata, Viewport } from "next";
import CalculatorLayoutClient from "./CalculatorLayoutClient";
import { getSessionFastOrRedirect } from "@/lib/authz";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  appleWebApp: {
    statusBarStyle: "black-translucent",
  },
};

// Per the website rework spec: /planner redirects unauthenticated visitors
// to /login. This now redirects server-side (no flash of app content before
// client JS runs) -- lib/supabase/client.ts was migrated to @supabase/ssr's
// cookie-syncing createBrowserClient specifically to make this possible;
// see that file's own comment for why the old localStorage-only client
// couldn't support this. CalculatorShellContext.tsx's own client-side
// supabase.auth.getUser() check stays in place too, unchanged -- it still
// does real work (e.g. catching a session that expires mid-visit), this is
// just the first line of defense now.
export default async function CalculatorLayout({ children }: { children: React.ReactNode }) {
  await getSessionFastOrRedirect();
  return <CalculatorLayoutClient>{children}</CalculatorLayoutClient>;
}
