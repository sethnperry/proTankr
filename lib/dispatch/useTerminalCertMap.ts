"use client";
// lib/dispatch/useTerminalCertMap.ts
//
// Trailer certifications required at every terminal the company has set one up
// for (a planned day can touch several). Per terminal: the certificate types it requires
// and every trailer's record. Use certBad() to ask about one trailer.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { certBlocks, trailerCert, type CertRecord, type CertType } from "./certs.ts";

export type TerminalCerts = Map<string, { types: CertType[]; records: CertRecord[] }>;

export function useTerminalCertMap(companyId: string | null): TerminalCerts {
  const [map, setMap] = useState<TerminalCerts>(new Map());
  useEffect(() => {
    if (!companyId) { setMap(new Map()); return; }
    let off = false;
    (async () => {
      const t = await supabase.from("permit_types").select("permit_type_id, name, applies_to, terminal_id")
        .eq("company_id", companyId).not("terminal_id", "is", null).eq("is_active", true);
      const types = ((t.data ?? []) as any[]).filter((x) => x.applies_to !== "truck");
      const out: TerminalCerts = new Map();
      if (types.length) {
        const r = await supabase.from("equipment_permits").select("trailer_id, permit_type_id, expiration_date")
          .in("permit_type_id", types.map((x) => x.permit_type_id)).not("trailer_id", "is", null);
        const records = (r.data ?? []) as CertRecord[];
        for (const tid of new Set(types.map((x) => String(x.terminal_id)))) {
          const mine = types.filter((x) => String(x.terminal_id) === tid).map((x) => ({ permit_type_id: x.permit_type_id, name: x.name })) as CertType[];
          if (mine.length) out.set(tid, { types: mine, records: records.filter((x) => mine.some((m) => m.permit_type_id === x.permit_type_id)) });
        }
      }
      if (!off) setMap(out);
    })();
    return () => { off = true; };
  }, [companyId]);
  return map;
}

export function certBad(map: TerminalCerts, terminalId: string, trailerId: string | null): boolean {
  const e = map.get(terminalId);
  return !!e && !!trailerId && certBlocks(trailerCert(e.types, e.records, trailerId));
}
