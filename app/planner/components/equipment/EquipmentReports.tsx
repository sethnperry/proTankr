"use client";
// app/planner/components/equipment/EquipmentReports.tsx
//
// Inspect and Truck down for a screen that isn't the Driver Dashboard (the Company Dashboard's Equipment tool).
// Same sheets and same offline-store writes as the Driver Dashboard, without its shift/delay bookkeeping: they
// register themselves with the Equipment modal, which shows the two buttons only while someone has.

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useTripStore } from "@/lib/trips/useTripStore";
import { createRepairWorkOrder } from "@/lib/repairs/repairRequest";
import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";
import { createInspection } from "@/lib/maintenance/inspection";
import { RepairSheet, type RepairUnit } from "../repair/RepairSheet";
import { InspectionSheet, type InspectUnit } from "../maintenance/InspectionSheet";
import { useOpenCampaigns } from "../../hooks/useOpenCampaigns";
import { setEquipmentTools } from "@/lib/ui/equipmentTools";

export function EquipmentReports({ userId, companyId, units }: { userId: string | null; companyId: string | null; units: RepairUnit[] }) {
  const { store, syncNow } = useTripStore(userId);
  const [repairOpen, setRepairOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [unitRegions, setUnitRegions] = useState<Record<string, string | null>>({});
  const openCampaigns = useOpenCampaigns(companyId, inspectOpen, unitRegions);

  useEffect(() => { if (userId) void retryRepairs(userId); }, [userId]);
  useEffect(() => {
    setEquipmentTools({ onInspect: () => setInspectOpen(true), onTruckDown: () => setRepairOpen(true) });
    return () => setEquipmentTools(null);
  }, []);
  // A campaign's region is matched against the reporter's own region.
  useEffect(() => {
    if (!inspectOpen || !userId) return;
    void (async () => {
      const { data: prof } = await supabase.from("profiles").select("region").eq("user_id", userId).maybeSingle();
      const region = ((prof as any)?.region as string | null) ?? null;
      setUnitRegions(Object.fromEntries(units.map((u) => [u.id, region])));
    })();
  }, [inspectOpen, userId, units]);

  const send = useCallback(async (unit: RepairUnit, input: { category: any; note: string }): Promise<string> => {
    if (!store || !userId || !companyId) throw new Error("Not signed in.");
    const { data: prof } = await supabase.from("profiles").select("display_name, region").eq("user_id", userId).maybeSingle();
    const wo = createRepairWorkOrder(store, { companyId, reportedBy: userId, kind: unit.kind, unitId: unit.id, unitName: unit.name, driverName: String((prof as any)?.display_name ?? ""), region: ((prof as any)?.region as string | null) ?? null, category: input.category, note: input.note, captureId: null });
    rememberRepair(userId, wo.work_order_id);
    await syncNow();
    const r = await sendRepair(userId, wo.work_order_id);
    const unitText = `${unit.kind === "truck" ? "Truck" : "Trailer"} ${unit.name}`;
    if (r === "sent") return `${unitText} is now Deadline and the repair request was emailed for approval.`;
    if (r === "waiting") return `Saved. ${unitText} will go to Deadline and the email will send when you have signal.`;
    return `${unitText} is Deadline. No approver email is set for your company, so this is waiting in the work order list.`;
  }, [store, userId, companyId, syncNow]);

  const submit = useCallback(async (o: { unit: InspectUnit; ratings: any; campaignId: string | null; notes: string; captureId: string | null }): Promise<string> => {
    if (!store || !userId || !companyId) throw new Error("Not signed in.");
    const { data: prof } = await supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const { inspection, workOrder } = createInspection(store, { companyId, driverId: userId, driverName: String((prof as any)?.display_name ?? ""), kind: o.unit.kind, unitId: o.unit.id, unitName: o.unit.name, ratings: o.ratings, campaignId: o.campaignId, notes: o.notes, captureId: o.captureId });
    void syncNow();
    const what = `${o.unit.kind === "truck" ? "Truck" : "Trailer"} ${o.unit.name}`;
    return inspection.overall === "good" ? `${what} is good. The inspection is saved.`
      : workOrder ? `Saved. ${what} has an item that needs replacing soon, so a work order was planned for it.` : `Saved. ${what} has items to watch.`;
  }, [store, userId, companyId, syncNow]);

  return (
    <>
      <InspectionSheet open={inspectOpen} onClose={() => setInspectOpen(false)} units={units} campaignsFor={openCampaigns.campaignsFor} companyId={companyId} userId={userId} onSubmit={submit} />
      <RepairSheet open={repairOpen} onClose={() => setRepairOpen(false)} units={units} onSend={send} />
    </>
  );
}
