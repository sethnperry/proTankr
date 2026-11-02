// lib/accounts/server.ts
//
// Sends account-rule emails: for every load completed in the last 3 days, each active rule that matches and is past
// its delay emails its list the load summary (PDF) and any meter ticket photos, once. Server only (service client,
// Resend). The matching and timing rules are in accountRules.ts; account_rule_sends is the record and the guard.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { renderReportPdf } from "@/lib/reports/pdfReport";
import { dueRules, summaryDoc, type Rule, type SummaryIn, type TripNames } from "./accountRules";

type TripRec = { trip_id: string; company_id: string; driver_id: string; truck_id: string | null; trailer_id: string | null; shipper: string | null; customer: string | null; begin_miles: number | null; end_miles: number | null; started_at: string | null; completed_at: string | null };
const MAX_ATTACH_BYTES = 8 * 1024 * 1024;

async function sendWithAttachments(to: string[], subject: string, text: string, attachments: { filename: string; content: string }[]) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const from = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: `ProTankr <${from}>`, to, subject, text, html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111;white-space:pre-wrap">${esc(text)}</p>`, attachments }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export async function runAccountRules(now = Date.now()): Promise<{ checked: number; sent: number; failed: number }> {
  const admin = getServiceSupabase();
  const out = { checked: 0, sent: 0, failed: 0 };
  const { data: rs } = await admin.from("account_rules").select("*").eq("is_active", true);
  const rules = (rs ?? []) as (Rule & { company_id: string })[];
  if (!rules.length) return out;
  const companies = [...new Set(rules.map((r) => r.company_id))];
  const since = new Date(now - 3 * 86400_000).toISOString();
  const { data: ts } = await admin.from("trips").select("trip_id, company_id, driver_id, truck_id, trailer_id, shipper, customer, begin_miles, end_miles, started_at, completed_at").in("company_id", companies).eq("status", "complete").gte("completed_at", since).limit(500);
  const trips = (ts ?? []) as TripRec[];
  if (!trips.length) return out;
  const ids = trips.map((t) => t.trip_id);
  const [{ data: ords }, { data: sent }] = await Promise.all([
    admin.from("trip_orders").select("trip_id, order_number, shipper, customer, is_primary").in("trip_id", ids),
    admin.from("account_rule_sends").select("rule_id, trip_id").in("trip_id", ids),
  ]);
  const ordersOf = new Map<string, { order_number: string | null; shipper: string | null; customer: string | null }[]>();
  for (const o of (ords ?? []) as any[]) ordersOf.set(o.trip_id, [...(ordersOf.get(o.trip_id) ?? []), o]);
  const sentOf = new Map<string, Set<string>>();
  for (const s of (sent ?? []) as { rule_id: string; trip_id: string }[]) sentOf.set(s.trip_id, (sentOf.get(s.trip_id) ?? new Set()).add(s.rule_id));

  for (const t of trips) {
    const os = ordersOf.get(t.trip_id) ?? [];
    const names: TripNames = { shipper: t.shipper, customer: t.customer, orderShippers: os.map((o) => o.shipper), orderCustomers: os.map((o) => o.customer) };
    const due = dueRules(rules.filter((r) => r.company_id === t.company_id), names, t.completed_at, sentOf.get(t.trip_id) ?? new Set(), now);
    out.checked += 1;
    if (!due.length) continue;
    let built: { doc: SummaryIn; photoPaths: string[] } | null = null;
    for (const rule of due) {
      // Claim first: a second run (or a second server) finds the row and skips.
      const claim = await admin.from("account_rule_sends").insert({ rule_id: rule.rule_id, trip_id: t.trip_id, company_id: t.company_id, status: "failed", error: "sending", to_emails: rule.emails });
      if (claim.error) continue;
      try {
        built = built ?? (await build(t, os.map((o) => o.order_number ?? "").filter(Boolean)));
        const attachments: { filename: string; content: string }[] = [];
        const docOut = summaryDoc(built.doc);
        if (rule.documents.includes("ptd")) {
          let logo: Uint8Array | null = null;
          try { const r = await fetch("https://protankr.com/icons/icon-email-black.png"); if (r.ok) logo = new Uint8Array(await r.arrayBuffer()); } catch { /* no logo */ }
          attachments.push({ filename: `${docOut.fileName}.pdf`, content: Buffer.from(await renderReportPdf(docOut, { logo })).toString("base64") });
        }
        if (rule.documents.includes("meter_tickets")) {
          let bytes = 0, n = 0;
          for (const path of built.photoPaths) {
            const { data: blob } = await admin.storage.from("form-captures").download(path);
            if (!blob) continue;
            const buf = Buffer.from(await blob.arrayBuffer());
            if (bytes + buf.length > MAX_ATTACH_BYTES) break;
            bytes += buf.length; n += 1;
            attachments.push({ filename: `meter-ticket-${n}.${(path.split(".").pop() ?? "jpg").toLowerCase()}`, content: buf.toString("base64") });
          }
        }
        const text = `The load for order ${built.doc.orderNumbers.join(", ") || "—"}${built.doc.customer ? ` (${built.doc.customer})` : ""} is complete.\n\n${attachments.length ? "The documents are attached." : "No documents were available to attach."}\n\nSent by ProTankr.`;
        await sendWithAttachments(rule.emails, docOut.subject, text, attachments);
        await admin.from("account_rule_sends").update({ status: "sent", error: null, sent_at: new Date().toISOString() }).eq("rule_id", rule.rule_id).eq("trip_id", t.trip_id);
        out.sent += 1;
      } catch (e) {
        out.failed += 1;
        await admin.from("account_rule_sends").update({ status: "failed", error: (e as Error).message.slice(0, 500) }).eq("rule_id", rule.rule_id).eq("trip_id", t.trip_id);
        await admin.from("app_errors").insert({ company_id: t.company_id, kind: "send_failed", message: `Account rule email failed: ${(e as Error).message}`, payload: { rule_id: rule.rule_id, trip_id: t.trip_id } });
      }
    }
  }
  return out;
}

async function build(t: TripRec, orderNumbers: string[]): Promise<{ doc: SummaryIn; photoPaths: string[] }> {
  const admin = getServiceSupabase();
  const [{ data: picks }, { data: dels }, { data: comps }, { data: drv }, { data: truck }, { data: trailer }] = await Promise.all([
    admin.from("trip_pickups").select("name, arrived_at, left_at, outcome, seq").eq("trip_id", t.trip_id).order("seq"),
    admin.from("trip_deliveries").select("delivery_id, location_id, one_off_name, arrived_at, left_at, status, seq").eq("trip_id", t.trip_id).order("seq"),
    admin.from("trip_compartment_loads").select("comp_number, product_id, bol_number, supplier, gross_gallons, net_gallons, temp_f, api, tank_number").eq("trip_id", t.trip_id).order("comp_number"),
    admin.from("profiles").select("display_name").eq("user_id", t.driver_id).maybeSingle(),
    t.truck_id ? admin.from("trucks").select("truck_name").eq("truck_id", t.truck_id).maybeSingle() : Promise.resolve({ data: null }),
    t.trailer_id ? admin.from("trailers").select("trailer_name").eq("trailer_id", t.trailer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const locIds = [...new Set(((dels ?? []) as any[]).map((d) => d.location_id).filter(Boolean))];
  const prodIds = [...new Set(((comps ?? []) as any[]).map((c) => c.product_id).filter(Boolean))];
  const [{ data: locs }, { data: prods }] = await Promise.all([
    locIds.length ? admin.from("delivery_locations").select("location_id, name").in("location_id", locIds) : Promise.resolve({ data: [] }),
    prodIds.length ? admin.from("products").select("product_id, product_name, display_name").in("product_id", prodIds) : Promise.resolve({ data: [] }),
  ]);
  const ln = new Map(((locs ?? []) as any[]).map((l) => [l.location_id, l.name as string]));
  const pn = new Map(((prods ?? []) as any[]).map((p) => [p.product_id, (p.display_name || p.product_name) as string]));
  const deliveries = ((dels ?? []) as any[]).filter((d) => d.status !== "cancelled");
  const delIds = deliveries.map((d) => d.delivery_id);
  const { data: checks } = delIds.length ? await admin.from("tank_checks").select("photo_paths").in("delivery_id", delIds) : { data: [] };
  return {
    doc: {
      orderNumbers, shipper: t.shipper, customer: t.customer, driver: (drv as any)?.display_name ?? "Driver", truck: (truck as any)?.truck_name ?? null, trailer: (trailer as any)?.trailer_name ?? null,
      startedAt: t.started_at, completedAt: t.completed_at, beginMiles: t.begin_miles, endMiles: t.end_miles,
      pickups: ((picks ?? []) as any[]).map((p) => ({ terminal: p.name ?? "Terminal", arrivedAt: p.arrived_at, leftAt: p.left_at, noLoad: p.outcome === "no_load" })),
      deliveries: deliveries.map((d) => ({ place: (d.location_id && ln.get(d.location_id)) || d.one_off_name || "Delivery", arrivedAt: d.arrived_at, leftAt: d.left_at })),
      loads: ((comps ?? []) as any[]).map((c) => ({ comp: c.comp_number, product: pn.get(c.product_id) ?? "", bol: c.bol_number, supplier: c.supplier, gross: c.gross_gallons, net: c.net_gallons, tempF: c.temp_f, api: c.api, tank: c.tank_number })),
    },
    photoPaths: ((checks ?? []) as { photo_paths: string[] }[]).flatMap((c) => c.photo_paths ?? []),
  };
}
