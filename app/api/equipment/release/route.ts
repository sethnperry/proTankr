// app/api/equipment/release/route.ts
//
// End of shift lets go of the equipment: the claim is released and the driver's held units cleared, and the pairing
// stays coupled, free for whoever takes it next. Parking, a status window or a parked-preloaded trailer must never
// be the only thing that does this. Uses the same server function the automatic shift end uses. The caller must
// actually hold the unit (a claimed combo or their own held units), so nobody can release someone else's truck.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase env vars.");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: u } = await admin.auth.getUser(token);
    const userId = u?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { truckId?: string | null; trailerId?: string | null };
    const truckId = body.truckId || null, trailerId = body.trailerId || null;
    if (!truckId && !trailerId) return NextResponse.json({ ok: true });

    // The caller must hold what they release.
    const [us, held] = await Promise.all([
      admin.from("user_settings").select("current_truck_id,current_trailer_id").eq("user_id", userId).maybeSingle(),
      admin.from("equipment_combos").select("truck_id,trailer_id").eq("claimed_by", userId).eq("active", true),
    ]);
    const mine = us.data as { current_truck_id?: string | null; current_trailer_id?: string | null } | null;
    const combos = (held.data ?? []) as { truck_id: string; trailer_id: string }[];
    const holdsTruck = !truckId || mine?.current_truck_id === truckId || combos.some((c) => c.truck_id === truckId);
    const holdsTrailer = !trailerId || mine?.current_trailer_id === trailerId || combos.some((c) => c.trailer_id === trailerId);
    if (!holdsTruck || !holdsTrailer) return NextResponse.json({ ok: true, skipped: "not held" });

    const { error } = await admin.rpc("auto_park_equipment", {
      p_user_id: userId, p_truck_id: truckId, p_trailer_id: trailerId, p_lat: null, p_lon: null, p_label: null, p_place_id: null, p_set_status: false, p_notes: null,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Failed." }, { status: 500 });
  }
}
