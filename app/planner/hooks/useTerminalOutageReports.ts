"use client";
// app/planner/hooks/useTerminalOutageReports.ts
//
// Owns: posting Out of Product / Out of Allocation reports
// (submitOutageReport, called from page.tsx's onSubmitOutageReport, which
// CancelLoadSheet.tsx's new "Report Terminal Issue" flow calls into), and
// reading back the currently-active ones as two separate per-type message
// lists (useActiveOutageBanner, used by the shared TerminalOutageBanner.tsx
// -- one MessageTicker.tsx row for Out of Product, another for Out of
// Allocation).
//
// 2026-08-28: per explicit follow-up, the banner's own ticker text was
// trimmed down to just "Out of {product}" / "OOA {product}" -- no
// company/truck/timestamp in the scrolling text itself (that detail moved
// into the detail modal's cards). ComposedOutageReport now carries the
// structured fields (productName, personLabel, truckLabel, createdAtMs)
// TerminalOutageDetailModal.tsx needs to render its own 3-row cards,
// instead of one pre-formatted `text` string.
//
// 2026-08-31: two more follow-ups. (1) Out of Product and Out of
// Allocation are now merged into ONE continuous ticker line
// ("Out of Premium 93   ---   OOA Regular 87") instead of two
// side-by-side halves each with their own chevron -- per explicit
// direction ("make this read like one continuous line. Only one arrow").
// (2) The banner is filtered to `plannedProductIds` (the driver's own
// live plan, threaded from CalculatorShellContext -- see that file and
// page.tsx's own sync effect) -- a report for a product the driver isn't
// currently planning to load at all is dropped before it's ever composed,
// per explicit direction ("only want to show people it is out of product
// or out of allocation if they are trying to load that specific
// product"). No plan yet (empty/unset `plannedProductIds`) means nothing
// shows -- there's nothing to compare relevance against.
//
// Out of Product also reuses the Terminal tab's existing
// rack_product_status.is_out flag (see RackProductStatusModal.tsx) so the
// Terminal tab's own product list never disagrees with this banner -- see
// CLAUDE.md "Terminal outage banners" for the full design.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { resolveEffectiveRackId } from "../utils/rack";
import { MANUAL_REPORT_CAP_MS, outageAge, outageExpiresAtMs, outageIsActive } from "../utils/dates";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";

export type OutageReportType = "out_of_product" | "out_of_allocation" | "long_line" | "terminal_issue";

// Long Line and Terminal Issue are about the whole terminal, not a product
// (product_id is null), and show to every driver headed there.
export function isTerminalWide(t: OutageReportType): boolean {
  return t === "long_line" || t === "terminal_issue";
}

const OUTAGE_POLL_MS = 90_000;

// ─── Submit ─────────────────────────────────────────────────────────────────

type SubmitArgs = {
  terminalId: string;
  selectedRackId: string | null;
  productIds: string[];
  reportType: OutageReportType;
  companyId: string;
  userId: string;
  truckLabel: string;
  // Out of Allocation on a named supplier ("No Allocation - Atlas - MO").
  supplier?: { supplier_id: string | null; name: string } | null;
};

/**
 * Posts one report row per selected product. For "out_of_product", also
 * upserts rack_product_status.is_out = true for each (same shape
 * RackProductStatusModal.tsx already writes) -- resolved via the same
 * fallback-to-single-rack logic useLoadWorkflow.ts's own rack_product_status
 * write already uses (see resolveEffectiveRackId). If no rack can be
 * resolved (a multi-rack terminal with no explicit selection), the report
 * still posts -- the banner still works, it just can't also flip the
 * Terminal tab's own per-rack flag.
 */
export async function submitOutageReport({
  terminalId, selectedRackId, productIds, reportType, companyId, userId, truckLabel, supplier,
}: SubmitArgs): Promise<{ error: string | null }> {
  const wide = isTerminalWide(reportType);
  if (!terminalId || !companyId || !userId || (!wide && productIds.length === 0)) {
    return { error: "Missing required info to submit this report." };
  }

  let rackId: string | null = null;
  if (reportType === "out_of_product") {
    rackId = await resolveEffectiveRackId(selectedRackId, terminalId);
    if (rackId) {
      const nowIso = new Date().toISOString();
      for (const productId of productIds) {
        const { error } = await supabase.from("rack_product_status").upsert(
          { rack_id: rackId, product_id: productId, is_out: true, updated_at: nowIso, updated_by: userId, active: true },
          { onConflict: "rack_id,product_id" }
        );
        if (error) return { error: error.message };
      }
    }
  }

  const rows = (wide ? [null] : productIds).map((productId) => ({
    terminal_id: terminalId,
    rack_id: rackId,
    product_id: productId,
    report_type: reportType,
    company_id: companyId,
    reporter_user_id: userId,
    truck_label: truckLabel || null,
    ...(supplier && reportType === "out_of_allocation"
      ? { supplier_id: supplier.supplier_id, supplier_name: supplier.name }
      : {}),
  }));

  const { error } = await supabase.from("terminal_outage_reports").insert(rows);
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Read (banner) ──────────────────────────────────────────────────────────

type OutageRow = {
  report_id: string;
  product_id: string | null;
  report_type: OutageReportType;
  company_id: string;
  reporter_user_id: string;
  truck_label: string | null;
  created_at: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  last_activity_at?: string | null;
};

export type ComposedOutageReport = {
  reportId: string;
  reportType: OutageReportType;
  productId: string | null;
  /** Full product name, e.g. "Premium Unleaded E10 93" -- the detail
   * card's product line, colored per productColorFor(). */
  productName: string;
  /** Short banner text, e.g. "Out of Premium 93" / "OOA Premium 93". */
  tickerText: string;
  /** Full company name (out_of_product) or full driver name
   * (out_of_allocation) -- the detail card's top row. */
  personLabel: string;
  truckLabel: string;
  createdAtMs: number;
  expiresAtMs: number;
  canClear: boolean;
  /** The supplier an allocation report names, if any. */
  supplierName: string | null;
  /** Long line only: average wait (minutes) drivers logged through the delay button. */
  avgWaitMin?: number | null;
};

/** Deletes one report early, instead of waiting for its natural checkpoint
 * expiry -- only succeeds for the reporter's own report (RLS-enforced, see
 * the 20260829000000 migration); a stray call for someone else's report
 * simply deletes 0 rows. */
export async function clearOutageReport(reportId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("terminal_outage_reports").delete().eq("report_id", reportId);
  return { error: error ? error.message : null };
}

/**
 * Clears every active out_of_product report for this terminal+product,
 * regardless of who filed it -- used by RackProductStatusModal.tsx's own
 * "Mark Available" (STUD represents the terminal's own current physical
 * status, not any one driver's personal claim, so it should be able to
 * clear a peer's report too). Relies on the broader
 * terminal_outage_reports_delete_product_any RLS policy (see the
 * 20260906000000 migration) -- clearOutageReport's own reporter-only
 * policy alone wouldn't reach a report someone else filed. Deliberately
 * restricted to "out_of_product" only, even though the parameter exists
 * for clarity -- out_of_allocation is company-specific, not something
 * STUD (a physical-terminal-status tool) has any business clearing; no
 * caller should ever pass anything else.
 */
export async function clearOutageReportsForProduct(
  terminalId: string,
  productId: string,
  reportType: OutageReportType = "out_of_product"
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("terminal_outage_reports")
    .delete()
    .eq("terminal_id", terminalId)
    .eq("product_id", productId)
    .eq("report_type", reportType);
  return { error: error ? error.message : null };
}

/**
 * Polls (every OUTAGE_POLL_MS) for currently-active outage reports at
 * `terminalId` and composes them into a single joined ticker string
 * (`tickerMessage`, one continuous line for TerminalOutageBanner.tsx --
 * see that file's own header comment for why it's one line, not two)
 * plus a structured per-report list (`reports`, for the detail view's
 * expiry/Clear-Issue UI). RLS on terminal_outage_reports already narrows
 * "out_of_allocation" rows to the caller's own active company -- no
 * client-side company filtering needed here on top of that.
 *
 * Deduped to the most recent report per (report_type, product_id) --
 * per explicit follow-up ("multiple entries should resolve to the most
 * recent... same for allocation"): if several drivers (or one driver
 * twice) report the same product out at the same terminal, only the
 * latest one shows. Older superseded reports are left in the table
 * untouched (still real history, just not displayed) -- this is a
 * display-layer collapse, not a write-time dedup.
 *
 * Resolves the terminal's own timezone internally (rather than depending on
 * whichever tab's own useTerminals() instance happens to be mounted) since
 * this banner renders in the shared header across every tab, not just the
 * Planner. `effectiveUserId` drives `canClear` per report -- compared
 * against the SAME identity submitOutageReport wrote as reporter_user_id
 * (page.tsx's effectiveUserId, not the real signed-in admin during
 * impersonation), so "can I clear this" stays consistent with "did I post
 * this."
 */
export function useActiveOutageBanner(
  terminalId: string | null,
  effectiveUserId: string | null,
  // "all" skips the product filter (the Driver Dashboard before a plan exists).
  plannedProductIds: Set<string> | "all" | null | undefined
): {
  tickerMessage: string | null;
  reports: ComposedOutageReport[];
  timeZone: string;
  refresh: () => void;
} {
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [tickerMessage, setTickerMessage] = useState<string | null>(null);
  const [reports, setReports] = useState<ComposedOutageReport[]>([]);

  // Sourced from the shared cached catalog (lib/queries/useProductsCatalog.ts)
  // instead of this hook's own supabase.from("products") lookup on every
  // fetch -- this matters more here than anywhere else in the app: this
  // poll runs every 90s, for every user, on every tab, for the whole time
  // the Planner layout is mounted (see the poll comment below). After the
  // catalog's first fetch, subsequent ticks read straight from cache
  // (10 min staleTime) instead of hitting products on every single tick.
  const { data: productsCatalog = [] } = useProductsCatalog();
  const productFullById = useMemo(
    () => new Map(productsCatalog.map((p) => [p.product_id, p.product_name ?? p.display_name ?? "product"])),
    [productsCatalog]
  );
  const productShortById = useMemo(
    () => new Map(productsCatalog.map((p) => [p.product_id, p.display_name ?? p.product_name ?? "product"])),
    [productsCatalog]
  );

  useEffect(() => {
    if (!terminalId) { setTimeZone(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("terminals").select("timezone").eq("terminal_id", terminalId).maybeSingle();
      if (!cancelled) setTimeZone((data as any)?.timezone ?? null);
    })();
    return () => { cancelled = true; };
  }, [terminalId]);

  const fetchAndCompose = useCallback(async () => {
    if (!terminalId) { setTickerMessage(null); setReports([]); return; }
    // Product reports only matter for products the driver plans to load; a
    // terminal-wide report (Long Line, Terminal Issue) matters to anyone
    // headed there, plan or no plan.
    const allProducts = plannedProductIds === "all";
    const planned = plannedProductIds instanceof Set ? plannedProductIds : new Set<string>();
    const tz = timeZone || "America/New_York";
    const nowMs = Date.now();
    const cutoffMs = nowMs - MANUAL_REPORT_CAP_MS;

    const { data, error } = await supabase
      .from("terminal_outage_reports")
      .select("report_id, product_id, report_type, company_id, reporter_user_id, truck_label, created_at, supplier_id, supplier_name, last_activity_at")
      .eq("terminal_id", terminalId)
      .gte("created_at", new Date(cutoffMs).toISOString())
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) { setTickerMessage(null); setReports([]); return; }

    // Rows already come back newest-first -- keeping only the first row
    // seen per (report_type, product_id) is exactly "resolve to the most
    // recent." Only a product the driver's current plan actually calls
    // for is relevant here at all -- filtered before dedup, not after.
    const seen = new Set<string>();
    const rows: OutageRow[] = [];
    for (const r of data as OutageRow[]) {
      if (!outageIsActive(r.report_type, new Date(r.created_at).getTime(), nowMs, tz, r.last_activity_at ? new Date(r.last_activity_at).getTime() : null)) continue;
      if (!allProducts && !isTerminalWide(r.report_type) && !(r.product_id && planned.has(r.product_id))) continue;
      const key = `${r.report_type}:${r.product_id ?? ""}:${r.supplier_id ?? r.supplier_name ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
    }
    // Reports older than the last time this driver left the terminal are old news to them.
    let shown = rows;
    if (effectiveUserId) {
      const { data: left } = await supabase.from("trip_pickups")
        .select("left_at, trips!inner(driver_id)")
        .eq("terminal_id", terminalId).eq("trips.driver_id", effectiveUserId)
        .not("left_at", "is", null).order("left_at", { ascending: false }).limit(1);
      const leftMs = left?.[0]?.left_at ? new Date(left[0].left_at as string).getTime() : 0;
      if (leftMs) shown = rows.filter((r) => new Date(r.created_at).getTime() > leftMs);
    }
    rows.length = 0; rows.push(...shown);
    if (rows.length === 0) { setTickerMessage(null); setReports([]); return; }

    // Long line: the average wait drivers logged through the delay button, when there is one.
    let waitMin: number | null = null;
    if (rows.some((r) => r.report_type === "long_line")) {
      const { data: w } = await supabase.rpc("long_line_wait", { p_terminal_id: terminalId });
      const row = Array.isArray(w) ? w[0] : w;
      if (row && Number(row.samples) > 0 && row.avg_min != null) waitMin = Math.round(Number(row.avg_min));
    }

    const companyIds = Array.from(new Set(rows.filter((r) => r.report_type !== "out_of_allocation").map((r) => r.company_id)));
    const reporterIds = Array.from(new Set(rows.filter((r) => r.report_type === "out_of_allocation").map((r) => r.reporter_user_id)));

    const [companiesRes, namesRes]: any[] = await Promise.all([
      companyIds.length ? supabase.from("companies").select("company_id, company_name").in("company_id", companyIds) : Promise.resolve({ data: [] }),
      reporterIds.length ? supabase.rpc("get_display_names_full", { p_user_ids: reporterIds }) : Promise.resolve({ data: [] }),
    ]);

    // productFullById/productShortById come from the shared cached catalog
    // hook above (full name for the detail card's product line; short name,
    // falling back to full, for the ticker) -- no longer fetched here.
    const companyNameById = new Map<string, string>((companiesRes.data ?? []).map((c: any) => [c.company_id, c.company_name ?? ""]));
    const displayNameByUserId = new Map<string, string>((namesRes.data ?? []).map((n: any) => [n.user_id, n.display_name ?? ""]));

    const composed: ComposedOutageReport[] = rows.map((r) => {
      const wide = isTerminalWide(r.report_type);
      const productName = wide
        ? (r.report_type === "long_line" ? "Long Line" : "Terminal Issue")
        : (productFullById.get(r.product_id ?? "") ?? "product");
      const shortName = wide ? productName : (productShortById.get(r.product_id ?? "") ?? productName);
      const createdAtMs = new Date(r.created_at).getTime();
      const truck = r.truck_label || "?";
      const isProduct = r.report_type === "out_of_product";
      const supplierName = r.report_type === "out_of_allocation" ? (r.supplier_name ?? null) : null;
      // The flag's age sits in ⟦ ⟧ so the ticker can draw it white against the red text.
      const age = `⟦${outageAge(createdAtMs, nowMs)}⟧`;
      const tickerText = wide ? `${shortName}${r.report_type === "long_line" && waitMin != null ? ` · avg wait ${waitMin}m` : ""} · reported ${age} ago`
        : isProduct ? `Out of ${shortName} ${age}`
        : supplierName ? `No Allocation - ${supplierName} (${shortName}) ${age}`
        : `OOA ${shortName} ${age}`;
      const personLabel = r.report_type !== "out_of_allocation"
        ? (companyNameById.get(r.company_id) || "Company")
        : (displayNameByUserId.get(r.reporter_user_id) || "Driver");
      return {
        reportId: r.report_id,
        productId: r.product_id,
        reportType: r.report_type,
        productName,
        tickerText,
        personLabel,
        truckLabel: truck,
        createdAtMs,
        expiresAtMs: outageExpiresAtMs(r.report_type, createdAtMs, tz, r.last_activity_at ? new Date(r.last_activity_at).getTime() : null),
        avgWaitMin: r.report_type === "long_line" ? waitMin : null,
        canClear: !!effectiveUserId && (r.reporter_user_id === effectiveUserId || r.report_type !== "out_of_allocation"),
        supplierName,
      };
    });

    setReports(composed);

    // One continuous line -- per explicit follow-up ("make this read like
    // one continuous line. Only one arrow") -- Out of Product entries
    // joined by " - ", Out of Allocation entries joined by " - ", the two
    // groups (when both present) joined by a wider "   ---   " separator.
    const terminalPart = composed.filter((c) => isTerminalWide(c.reportType)).map((c) => c.tickerText).join(" - ");
    const productPart = composed.filter((c) => c.reportType === "out_of_product").map((c) => c.tickerText).join(" - ");
    const allocationPart = composed.filter((c) => c.reportType === "out_of_allocation").map((c) => c.tickerText).join(" - ");
    setTickerMessage([terminalPart, productPart, allocationPart].filter(Boolean).join("   ---   ") || null);
  }, [terminalId, timeZone, effectiveUserId, plannedProductIds, productFullById, productShortById]);

  useEffect(() => {
    fetchAndCompose();
    // 90s, not 30s -- this poll runs for every user, on every tab, for the
    // whole time the Planner layout is mounted (it lives in the shared
    // Header). Outage reports aren't urgent-to-the-second (the clearing
    // schedule itself is only checkpointed every 6 hours), so a slower
    // poll cuts this query's aggregate volume by two-thirds with no real
    // loss of freshness -- part of the 2026-08-31 performance pass (see
    // CLAUDE.md).
    const id = setInterval(fetchAndCompose, OUTAGE_POLL_MS);
    return () => clearInterval(id);
  }, [fetchAndCompose]);

  return { tickerMessage, reports, timeZone: timeZone || "America/New_York", refresh: fetchAndCompose };
}

// A loading delay picked from the shared terminal-issue list also warns other
// drivers. Best effort; products only matter for the product-scoped issues.
export async function reportDelayIssue(args: {
  delayChoice: string | null;
  terminalId: string | null;
  rackId: string | null;
  productIds: string[];
  companyId: string;
  userId: string;
  truckLabel: string;
}): Promise<void> {
  const choice = args.delayChoice ?? "";
  if (!choice.startsWith("issue:") || !args.terminalId) return;
  const code = choice.slice("issue:".length) as OutageReportType;
  if (!["out_of_product", "out_of_allocation", "long_line", "terminal_issue"].includes(code)) return;
  const { error } = await submitOutageReport({
    terminalId: args.terminalId, selectedRackId: args.rackId, productIds: [...new Set(args.productIds)],
    reportType: code, companyId: args.companyId, userId: args.userId, truckLabel: args.truckLabel,
  });
  if (error) console.warn("[trips] delay issue report failed (non-fatal):", error);
}
