// lib/stripe/serverClient.ts
// Server-side only. Never import this from client components.
//
// Built LAZILY, on first call, never at module scope -- same reasoning as
// lib/supabase/serviceClient.ts: `next build` imports every route module
// while collecting page data, so a module-scope read of STRIPE_SECRET_KEY
// would make the whole build depend on a runtime secret being present in
// the build environment. A missing key should surface as a 500 on the one
// route that needs it, not a failed deploy of the entire app -- exactly
// the class of bug that broke the 2026-09-06 production deploy for the
// Supabase service client.

import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  cached = new Stripe(secretKey);
  return cached;
}
