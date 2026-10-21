// lib/telematics/linkMe.ts
//
// Fire-and-forget: ask the server to link the signed-in member to their Geotab driver.
// Never throws; a company without telematics just answers { linked: false }.

import { supabase } from "@/lib/supabase/client";

export async function linkMeToTelematics(companyId: string, userId?: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token || !companyId) return;
    await fetch("/api/telematics/link-me", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, userId }),
    });
  } catch { /* hours of service links later */ }
}
