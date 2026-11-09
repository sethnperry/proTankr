// app/api/demo/start/route.ts
//
// The shareable "demo login" link. Mints a fresh Supabase magic-link for one
// of a small fixed set of demo accounts -- selected only by the ?persona=
// query param matching a known key ("alpha" | "beta"), which maps to a
// server-side-only email env var. The email itself is never accepted as a
// request parameter, so this can only ever log someone into one of the
// designated demo accounts. Redirects straight through the generated link,
// skipping the email step entirely -- reuses the exact same generateLink ->
// action_link -> /auth/confirm flow already proven by
// app/api/admin/invite/route.ts; app/auth/confirm/page.tsx needs zero
// changes to handle this.
//
// Two independent personas exist so two different people can each have
// their own live demo session without kicking each other's (demo_sessions/
// demo_commandeer tracks activity per-user, not as a single global lock).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// F-B (audit pass 1): this endpoint mints a real login for a demo account
// with no authentication of the caller. Originally blocked outright in
// production for exactly that reason -- anyone on the internet could log
// in as the demo company admin.
//
// Deliberately reopened for ONE persona (2026-09): the marketing site's
// /for-drivers page embeds a live iframe of the real Planner, logged into
// the "ProTankr Trucking" solo demo account, so visitors interact with the
// actual app (real compartment bars/cap handles, real terminal picker,
// real product picker, real Save Plan) instead of a hand-built
// recreation -- see that page's own DemoPlannerFrame.tsx for why. This is
// an accepted, explicit product decision, not an oversight: that persona
// is a disposable, synthetic demo account built for exactly this. The
// OTHER persona stays fully blocked in production -- it's the private,
// internal-QA account, and letting it stay reachable here would put real
// in-progress QA state at risk of a public visitor's changes.
//
// No equipment-switching / real-load-submission restrictions exist yet on
// this path -- that's a deliberate, separately-scoped follow-up (keyed to
// the persona itself, not to how someone reached it, so it can't be
// bypassed by skipping this route). Until then, anything a visitor does
// via the iframe is a real, visible change to that one demo account.
// Confirmed live 2026-09: "beta" (demo-beta@protankr.io) is the solo
// account, renamed "ProTankr Trucking"; "alpha" (demo@protankr.io) is the
// fleet account, renamed "ProTankr Transport" -- stays blocked in prod.
//
// Real fallout, found live 2026-09: this login is a genuine Supabase auth
// session on whatever domain serves it -- cookies are shared by every
// tab/window/installed-PWA instance in the same browser, so a visitor
// (including the operator's own installed app) starting the demo from
// /for-drivers on protankr.com got signed OUT of their real account there.
// Fixed by adding demo.protankr.com as a second domain on this same
// Vercel project -- app/for-drivers/DemoPlannerFrame.tsx's iframe now
// points there instead of a same-origin relative path, so the login (and
// its cookies) land on that isolated host and never touch protankr.com's
// own session at all. This route's own `origin` below deliberately uses
// the REQUEST's actual host for this reason -- see that comment.
const PUBLIC_DEMO_PERSONAS = new Set(["beta"]);

function demoStartBlockedInProd(persona: string): boolean {
  if (PUBLIC_DEMO_PERSONAS.has(persona)) return false;
  return process.env.VERCEL_ENV === "production" && process.env.DEMO_START_ALLOW_PROD !== "true";
}

const PERSONA_EMAIL_ENV: Record<string, string | undefined> = {
  alpha: process.env.DEMO_ACCOUNT_EMAIL_ALPHA,
  beta: process.env.DEMO_ACCOUNT_EMAIL_BETA,
};

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  // Deliberately the REQUEST's own origin, not NEXT_PUBLIC_APP_URL (which
  // every other route using this same pattern -- invite, vault-reset --
  // correctly forces to the canonical domain, since those build links for
  // EMAIL delivery with no browser context of their own). This route is
  // different: it's hit directly by a live iframe/browser already sitting
  // on some real domain, and the whole point of the isolated
  // demo.protankr.com host (added 2026-09, see this file's own comment
  // below on why) is for the login + its cookies to land on THAT SAME
  // domain, not bounce back to the main site. Forcing NEXT_PUBLIC_APP_URL
  // here would silently defeat that isolation on every request.
  const origin = new URL(req.url).origin;
  const persona = (new URL(req.url).searchParams.get("persona") ?? "alpha").toLowerCase();

  if (demoStartBlockedInProd(persona)) {
    return NextResponse.json({ error: "Demo login is disabled in production." }, { status: 403 });
  }

  try {
    const email = PERSONA_EMAIL_ENV[persona];
    if (!email) throw new Error(`Unknown or unconfigured demo persona: ${persona}`);

    const admin = getAdmin();
    const redirectTo = `${origin}/auth/confirm`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    // Build confirmUrl from token_hash pointing at our own /auth/confirm
    // route -- NOT Supabase's raw action_link (<project>.supabase.co/auth/
    // v1/verify), which is a GET that consumes the one-time token on the
    // very first hit. Any prefetch/link-scanner/preflight that requests
    // that URL before the "real" navigation completes silently burns it --
    // the exact class of bug already found and fixed for the invite email
    // (see app/api/admin/invite/route.ts, and CLAUDE.md's "magic link /
    // login reliability" history) but never ported to this route.
    // /auth/confirm/page.tsx already expects `?token_hash=...&type=...`
    // and only consumes it via an explicit client-side verifyOtp() call,
    // so this is a drop-in fix, not a new mechanism.
    if (error || !data?.properties?.hashed_token) {
      throw new Error(error?.message ?? "Failed to generate demo login link.");
    }
    const confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink`;

    return NextResponse.redirect(confirmUrl);
  } catch (e: any) {
    console.error("demo/start failed:", e?.message ?? e);
    return NextResponse.redirect(`${origin}/demo/ended?reason=error`);
  }
}
