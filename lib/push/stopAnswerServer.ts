// lib/push/stopAnswerServer.ts
//
// What happens when a button is tapped on a stop notification. "No" to "Did you load here?" sends
// a second notification asking why; the reason posts the terminal report right away (so other
// trucks headed there hear at once) and is kept on the answer for the app to finish the rack hop.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendPush, type StoredSub } from "@/lib/push/send";
import { pushTerminalReports } from "@/lib/push/terminalReportPush";

export const ANSWERS = ["arrived", "delay", "yes", "no"] as const;
export const REASONS = ["long_line", "out_of_product", "out_of_allocation", "terminal_issue", "other"] as const;
const PRODUCT_SCOPED = new Set(["out_of_product", "out_of_allocation"]);
// Most useful first: a phone that shows fewer buttons keeps the first ones. The rest are in the app.
export const REASON_ACTIONS = [
  { action: "reason:long_line", title: "Long line" },
  { action: "reason:out_of_product", title: "Out of product" },
  { action: "reason:out_of_allocation", title: "No allocation" },
];

type Row = { id: string; company_id: string; user_id: string; trip_id: string | null; kind: string; place_name: string | null; answer: string | null; reason: string | null };

export async function handleStopAnswer(id: string, answer: string): Promise<{ recorded: boolean }> {
  const admin = getServiceSupabase();
  if (answer.startsWith("reason:")) return handleReason(id, answer.slice(7));
  if (!(ANSWERS as readonly string[]).includes(answer)) return { recorded: false };
  const { data, error } = await admin.from("stop_answers")
    .update({ answer, answered_at: new Date().toISOString() })
    .eq("id", id).is("answer", null).select("id, company_id, user_id, kind, place_name").maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as Pick<Row, "id" | "company_id" | "user_id" | "kind" | "place_name"> | null;
  if (row && answer === "no" && row.kind === "hop") {
    const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", row.user_id);
    await sendPush((subs ?? []) as StoredSub[], {
      title: `Why couldn't you load at ${row.place_name ?? "the rack"}?`, body: "", url: "/planner/home",
      tag: `stop-why-${row.id}`, answerId: row.id, actions: REASON_ACTIONS,
    });
  }
  return { recorded: !!row };
}

async function handleReason(id: string, reason: string): Promise<{ recorded: boolean }> {
  if (!(REASONS as readonly string[]).includes(reason)) return { recorded: false };
  const admin = getServiceSupabase();
  const { data: rowData } = await admin.from("stop_answers").select("id, company_id, user_id, trip_id, kind, place_name, answer, reason").eq("id", id).maybeSingle();
  const row = rowData as Row | null;
  if (!row || row.kind !== "hop" || row.answer !== "no" || row.reason) return { recorded: false };
  const { error } = await admin.from("stop_answers").update({ reason }).eq("id", id).is("reason", null);
  if (error) throw new Error(error.message);
  if (reason !== "other" && row.trip_id) await postReport(row, reason);
  return { recorded: true };
}

async function postReport(row: Row, reason: string) {
  const admin = getServiceSupabase();
  const { data: trip } = await admin.from("trips")
    .select("truck_id, trip_pickups(seq, terminal_id, rack_id, arrived_at, left_at, outcome, planned_comps, load_id)").eq("trip_id", row.trip_id!).maybeSingle();
  const pickups = ((trip as any)?.trip_pickups ?? []) as any[];
  const pk = pickups.filter((k) => k.arrived_at && !k.left_at && k.outcome !== "no_load" && k.terminal_id).sort((a, b) => a.seq - b.seq)[0];
  if (!pk) return;
  let products: string[] = [];
  if (PRODUCT_SCOPED.has(reason)) {
    products = ((pk.planned_comps ?? []) as { product_id?: string }[]).map((c) => c.product_id).filter((x): x is string => !!x);
    if (!products.length && pk.load_id) {
      const { data: ll } = await admin.from("load_lines").select("product_id").eq("load_id", pk.load_id);
      products = ((ll ?? []) as { product_id: string | null }[]).map((l) => l.product_id).filter((x): x is string => !!x);
    }
    products = [...new Set(products)];
    if (!products.length) return; // plan unknown: the app asks which product
  }
  const { data: tr } = (trip as any)?.truck_id ? await admin.from("trucks").select("truck_name").eq("truck_id", (trip as any).truck_id).maybeSingle() : { data: null };
  const rows = (PRODUCT_SCOPED.has(reason) ? products : [null]).map((productId) => ({
    terminal_id: pk.terminal_id, rack_id: reason === "out_of_product" ? pk.rack_id ?? null : null, product_id: productId, report_type: reason,
    company_id: row.company_id, reporter_user_id: row.user_id, truck_label: (tr as any)?.truck_name ?? null,
  }));
  if (reason === "out_of_product" && pk.rack_id) {
    for (const productId of products) {
      await admin.from("rack_product_status").upsert({ rack_id: pk.rack_id, product_id: productId, is_out: true, updated_at: new Date().toISOString(), updated_by: row.user_id, active: true }, { onConflict: "rack_id,product_id" });
    }
  }
  const { error } = await admin.from("terminal_outage_reports").insert(rows);
  if (error) { console.warn("[stop-answer] report failed:", error.message); return; }
  await admin.from("stop_answers").update({ report_posted_at: new Date().toISOString() }).eq("id", row.id);
  await pushTerminalReports().catch((e) => console.warn("[stop-answer] push failed:", (e as Error).message));
}
