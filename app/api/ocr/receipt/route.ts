// app/api/ocr/receipt/route.ts
//
// Reads a fuel receipt photo and returns suggestions (station, diesel gallons, total). The photo stays in its
// private bucket: this route opens it as the signed-in user (so storage rules still decide who may read it),
// sends the bytes to the reader, and returns only the suggested fields. Nothing is saved here.
//
// Needs ANTHROPIC_API_KEY. Without it the route answers { available: false } and the app simply doesn't offer
// "Read it", so a missing key never blocks a driver.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RECEIPT_PROMPT, parseReceiptReply } from "@/lib/capture/ocr";
import { logServerError } from "@/lib/errors/server";

export const runtime = "nodejs";

const BUCKETS = new Set(["fuel-receipts", "form-captures"]);
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const MAX_BYTES = 5 * 1024 * 1024;
const MODEL = "claude-haiku-5-5";

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ available: false });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const supa = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await supa.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { bucket?: string; path?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const { bucket, path } = body;
  if (!bucket || !path || !BUCKETS.has(bucket)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const mime = TYPES[(path.split(".").pop() ?? "").toLowerCase()];
  if (!mime) return NextResponse.json({ available: false }); // HEIC and the like: the reader can't take it

  try {
    const { data: file, error } = await supa.storage.from(bucket).download(path);
    if (error || !file) return NextResponse.json({ error: "Couldn't open the photo." }, { status: 404 });
    if (file.size > MAX_BYTES) return NextResponse.json({ available: false });
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
          { type: "text", text: RECEIPT_PROMPT },
        ] }],
      }),
    });
    if (!res.ok) throw new Error(`Reader answered ${res.status}`);
    const j = await res.json();
    const text = (j?.content ?? []).map((c: any) => c?.text ?? "").join("");
    return NextResponse.json({ available: true, fields: parseReceiptReply(text) });
  } catch (e: any) {
    await logServerError({ companyId: null, kind: "other", message: `Receipt reader failed: ${e?.message ?? e}`, userId: u.user.id }, { dedupeMinutes: 60 });
    return NextResponse.json({ available: true, fields: null });
  }
}
