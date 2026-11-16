"use client";
// lib/squawk/useSquawk.ts
//
// Squawk data: the driver's own region and local area, a channel's messages, sending, the unread counts behind the
// dashboard alert, and the realtime subscription that updates them. No polling: new messages arrive over one
// realtime subscription (the server decides what each driver may receive), and unread is read when the app opens.

import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { MAX_ATTACHMENTS, type Attachment, type SquawkType } from "./squawk";

export type SquawkMessage = {
  id: string; channel_type: SquawkType; channel_key: string; sender_id: string; sender_label: string;
  body: string; attachments: Attachment[]; created_at: string;
};

/** The driver's own region and local area (from the profile), which decide the region and local area channels. */
export function useMyArea(userId: string | null) {
  const q = useQuery({
    queryKey: ["squawkArea", userId], enabled: !!userId, staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("region, local_area").eq("user_id", userId!).maybeSingle();
      const r = data as { region: string | null; local_area: string | null } | null;
      return { region: r?.region ?? null, localArea: r?.local_area ?? null };
    },
  });
  return q.data ?? { region: null, localArea: null };
}

export function useSquawkFeed(type: SquawkType | null, key: string | null, open: boolean, userId: string | null) {
  const qc = useQueryClient();
  const seen = useRef<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["squawk", "feed", type, key], enabled: open && !!type && !!key, staleTime: 15_000,
    queryFn: async (): Promise<SquawkMessage[]> => {
      const { data } = await supabase.from("squawk_messages").select("id, channel_type, channel_key, sender_id, sender_label, body, attachments, created_at")
        .eq("channel_type", type!).eq("channel_key", key!).order("created_at", { ascending: true }).limit(200);
      return ((data ?? []) as SquawkMessage[]).map((m) => ({ ...m, attachments: Array.isArray(m.attachments) ? m.attachments : [] }));
    },
  });
  // What is on screen has been read: that starts the expiry clock.
  useEffect(() => {
    if (!open || !userId || !q.data) return;
    const fresh = q.data.filter((m) => !seen.current.has(m.id)).map((m) => m.id);
    if (!fresh.length) return;
    fresh.forEach((id) => seen.current.add(id));
    void supabase.rpc("squawk_mark_viewed", { p_ids: fresh }).then(() => qc.invalidateQueries({ queryKey: ["squawk", "unread"] }));
  }, [open, userId, q.data, qc]);
  const send = useCallback(async (body: string, files: File[]): Promise<string | null> => {
    if (!type || !key || !userId) return "Pick a channel first.";
    if (files.length > MAX_ATTACHMENTS) return `${MAX_ATTACHMENTS} attachments at most.`;
    const attachments: Attachment[] = [];
    for (const f of files) {
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
      const path = `${userId}/${crypto.randomUUID()}/${safe}`;
      const up = await supabase.storage.from("squawk").upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (up.error) return `Couldn't upload ${f.name}: ${up.error.message}`;
      attachments.push({ path, name: f.name, type: f.type, size: f.size });
    }
    const { error } = await supabase.rpc("squawk_send", { p_type: type, p_key: key, p_body: body, p_attachments: attachments });
    if (error) return error.message;
    void qc.invalidateQueries({ queryKey: ["squawk", "feed", type, key] });
    return null;
  }, [type, key, userId, qc]);
  /** The sender takes a message back; it is gone for everyone at once. */
  const retract = useCallback(async (id: string) => {
    await supabase.rpc("squawk_retract", { p_id: id });
    void qc.invalidateQueries({ queryKey: ["squawk"] });
  }, [qc]);
  return { messages: q.data ?? [], loading: q.isLoading, send, retract };
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("squawk").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Unread counts by channel, and the realtime subscription that keeps them (and any open feed) current. */
export function useSquawkAlerts(userId: string | null, onNew?: () => void) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["squawk", "unread", userId], enabled: !!userId, staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("squawk_unread");
      return ((data ?? []) as { channel_type: string; channel_key: string; n: number }[]);
    },
  });
  const cb = useRef(onNew);
  cb.current = onNew;
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`squawk:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "squawk_messages" }, (payload) => {
        void qc.invalidateQueries({ queryKey: ["squawk"] });
        if ((payload.new as { sender_id?: string } | null)?.sender_id !== userId) cb.current?.();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, qc]);
  return q.data ?? [];
}

/** The chirp: only while the app is open and showing. Seth adds public/sounds/triple_tick_then_squelch_tail.wav. */
export function playChirp() {
  try {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    const a = new Audio("/sounds/triple_tick_then_squelch_tail.wav");
    a.volume = 0.8;
    void a.play().catch(() => { /* no file yet, or the browser wants a tap first */ });
  } catch { /* no audio */ }
}
