"use client";
// app/planner/components/scan/DocumentScanner.tsx
//
// A document scanner for the camera in the browser. For the best result in poor light:
//   * the phone's own light (torch) one tap away, offered automatically when the picture is dark;
//   * a short burst of frames, keeping the sharpest (a dim scene means long exposures and a shaky hand);
//   * the camera's full-size still when the browser can give one, not the video frame;
//   * the page found by itself and flattened from its real corners, with the true page shape worked out from the
//     perspective (see lib/scan/geometry.ts) so nothing is stretched or skewed;
//   * the light and shadows evened out (lib/scan/image.ts) so one side of the page isn't darker than the other.
// The person can always drag the four corners, and choose Document (black on white), Color or Original.
// If the camera can't be opened it falls back to picking a photo, which goes through the same corner step.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { detectPage } from "@/lib/scan/detect";
import { pageAspect, snapAspect, type Pt, type Quad } from "@/lib/scan/geometry";
import { enhance, makeImg, meanBrightness, sharpness, shrink, warpPage, type Img, type ScanMode } from "@/lib/scan/image";

const MAX_STILL = 4096; // long side of the photo we work from; more than this only costs time
const BURST = 4;

type Stage = "camera" | "adjust" | "result";

const toImg = (src: CanvasImageSource, w: number, h: number, maxLong = MAX_STILL): Img => {
  const s = Math.min(1, maxLong / Math.max(w, h));
  const cw = Math.round(w * s), ch = Math.round(h * s);
  const c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, cw, ch);
  const d = ctx.getImageData(0, 0, cw, ch);
  return { data: d.data, width: cw, height: ch };
};
const toCanvas = (img: Img): HTMLCanvasElement => {
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
};
const rotate90 = (img: Img): Img => {
  const out = makeImg(img.height, img.width);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const s = (y * img.width + x) * 4, d = (x * out.width + (img.height - 1 - y)) * 4;
    out.data[d] = img.data[s]; out.data[d + 1] = img.data[s + 1]; out.data[d + 2] = img.data[s + 2]; out.data[d + 3] = 255;
  }
  return out;
};
const insetQuad = (w: number, h: number): Quad => [{ x: w * 0.08, y: h * 0.08 }, { x: w * 0.92, y: h * 0.08 }, { x: w * 0.92, y: h * 0.92 }, { x: w * 0.08, y: h * 0.92 }];
const later = () => new Promise<void>((r) => setTimeout(r, 30));

export function DocumentScanner({ open, title = "Scan document", onClose, onDone }: { open: boolean; title?: string; onClose: () => void; onDone: (file: File) => void }) {
  const [stage, setStage] = useState<Stage>("camera");
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [torchOk, setTorchOk] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [dark, setDark] = useState(false);
  const [live, setLive] = useState<{ quad: Quad; ok: boolean; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [still, setStill] = useState<Img | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [mode, setMode] = useState<ScanMode>("document");
  const [flat, setFlat] = useState<Img | null>(null);
  const [turns, setTurns] = useState(0);
  const [paper, setPaper] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const capture = useRef<{ takePhoto?: () => Promise<Blob> } | null>(null);
  const stable = useRef<{ since: number; q: Quad | null }>({ since: 0, q: null });
  const shooting = useRef(false);

  const stopCamera = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; capture.current = null; }, []);

  const startCamera = useCallback(async () => {
    setCameraErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 2160 } } });
      stream.current = s;
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
      setTorchOk(!!caps.torch);
      // Keep focus and exposure working while the phone moves over the page.
      const adv: Record<string, unknown>[] = [];
      if (Array.isArray(caps.focusMode) && (caps.focusMode as string[]).includes("continuous")) adv.push({ focusMode: "continuous" });
      if (Array.isArray(caps.exposureMode) && (caps.exposureMode as string[]).includes("continuous")) adv.push({ exposureMode: "continuous" });
      if (adv.length) await track.applyConstraints({ advanced: adv as MediaTrackConstraintSet[] }).catch(() => {});
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: (o?: unknown) => Promise<Blob> } }).ImageCapture;
      capture.current = IC ? new IC(track) : null;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
    } catch (e) {
      setCameraErr((e as Error)?.name === "NotAllowedError" ? "Camera permission is off. Allow it in the browser settings, or pick a photo instead." : "Couldn't open the camera. You can pick a photo instead.");
    }
  }, []);

  useEffect(() => {
    if (!open) { stopCamera(); return; }
    setStage("camera"); setStill(null); setQuad(null); setFlat(null); setTurns(0); setBusy(null); setTorchOn(false); setLive(null);
    void startCamera();
    return stopCamera;
  }, [open, startCamera, stopCamera]);

  const setTorch = async (on: boolean) => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }); setTorchOn(on); } catch { /* the light isn't available */ }
  };

  // The frame on screen as an image.
  const frame = useCallback((): Img | null => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    return toImg(v, v.videoWidth, v.videoHeight);
  }, []);

  // Live: find the page and the light level a few times a second.
  useEffect(() => {
    if (!open || stage !== "camera" || cameraErr) return;
    const t = window.setInterval(() => {
      if (shooting.current) return;
      const v = video.current;
      if (!v || !v.videoWidth) return;
      // Drawn straight down to 320px: a 4K frame every quarter second would choke a phone.
      const k = 320 / Math.max(v.videoWidth, v.videoHeight);
      const sm = toImg(v, Math.round(v.videoWidth * k), Math.round(v.videoHeight * k), 320);
      const bright = meanBrightness(sm);
      setDark(bright < 70);
      const det = detectPage(sm); // corners in the 320px frame's own coordinates
      if (det && det.confidence >= 0.8) {
        setLive({ quad: det.quad, ok: true, w: sm.width, h: sm.height });
        const prev = stable.current;
        const moved = prev.q ? Math.max(...det.quad.map((p, i) => Math.hypot(p.x - prev.q![i].x, p.y - prev.q![i].y))) / Math.hypot(sm.width, sm.height) : 1;
        if (moved < 0.012) { if (!prev.since) prev.since = Date.now(); } else { prev.since = 0; }
        prev.q = det.quad;
        if (prev.since && Date.now() - prev.since > 1100 && !shooting.current) { prev.since = 0; void shoot(); }
      } else { setLive((l) => (l ? { ...l, ok: false } : null)); stable.current = { since: 0, q: null }; }
    }, 260);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage, cameraErr]);

  // Light came on by itself the first time it was dark.
  const autoLit = useRef(false);
  useEffect(() => { if (dark && torchOk && !torchOn && !autoLit.current) { autoLit.current = true; void setTorch(true); } }, [dark, torchOk, torchOn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) autoLit.current = false; }, [open]);

  const goAdjust = async (img: Img) => {
    setBusy("Finding the page…"); await later();
    const det = detectPage(img);
    setStill(img);
    setQuad(det && det.confidence >= 0.75 ? det.quad : insetQuad(img.width, img.height));
    setStage("adjust"); setBusy(null);
    stopCamera();
  };

  // The shutter: a burst of frames, the sharpest kept.
  const shoot = useCallback(async () => {
    if (shooting.current) return;
    shooting.current = true;
    setBusy("Hold still…");
    try {
      const frames: Img[] = [];
      const tp = capture.current?.takePhoto;
      for (let i = 0; i < BURST; i++) {
        let img: Img | null = null;
        if (tp && i < 2) {
          try { const blob = await tp.call(capture.current); const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions); img = toImg(bmp, bmp.width, bmp.height); bmp.close?.(); } catch { img = null; }
        }
        if (!img) img = frame();
        if (img) frames.push(img);
        await new Promise((r) => setTimeout(r, 90));
      }
      if (!frames.length) { setBusy(null); return; }
      let best = frames[0], bs = -1;
      for (const f of frames) { const s = sharpness(f); if (s > bs) { bs = s; best = f; } }
      await goAdjust(best);
    } finally { shooting.current = false; setBusy(null); }
  }, [frame]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy("Opening the photo…"); await later();
    try { const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions); const img = toImg(bmp, bmp.width, bmp.height); bmp.close?.(); await goAdjust(img); }
    catch { setCameraErr("That photo couldn't be opened."); setBusy(null); }
  };

  const flatten = async (m: ScanMode, q: Quad | null = quad, st: Img | null = still) => {
    if (!q || !st) return;
    setBusy("Flattening the page…"); await later();
    const a = pageAspect(q, st.width / 2, st.height / 2);
    const snapped = snapAspect(a);
    setPaper(snapped.paper);
    const w = warpPage(st, q, snapped.ratio);
    await later();
    setFlat(enhance(w, m)); setMode(m); setTurns(0); setStage("result"); setBusy(null);
  };

  const shown = useMemo(() => { if (!flat) return null; let img = flat; for (let i = 0; i < turns % 4; i++) img = rotate90(img); return img; }, [flat, turns]);
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = previewRef.current;
    if (stage !== "result" || !c || !shown) return;
    const s = Math.min(1, 1000 / Math.max(shown.width, shown.height));
    c.width = Math.round(shown.width * s); c.height = Math.round(shown.height * s);
    c.getContext("2d")!.drawImage(toCanvas(shown), 0, 0, c.width, c.height);
  }, [stage, shown]);

  const finish = async () => {
    if (!shown) return;
    setBusy("Saving…"); await later();
    const blob: Blob | null = await new Promise((r) => toCanvas(shown).toBlob(r, "image/jpeg", 0.9));
    setBusy(null);
    if (!blob) return;
    onDone(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
  };

  if (!open || typeof document === "undefined") return null;
  const bar: React.CSSProperties = { position: "absolute", left: 0, right: 0, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", zIndex: 2 };
  const btn = (primary = false): React.CSSProperties => ({ padding: "13px 18px", fontSize: 14, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", border: primary ? "none" : "1px solid rgba(255,255,255,0.35)", background: primary ? "#fff" : "rgba(0,0,0,0.55)", color: primary ? "#000" : "#fff" });

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "#000", color: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={{ ...bar, top: 0, paddingTop: "calc(env(safe-area-inset-top,0px) + 12px)", background: "linear-gradient(#000,rgba(0,0,0,0))" }}>
        <button type="button" style={btn()} onClick={onClose}>Close</button>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        <div style={{ width: 80, textAlign: "right" }}>
          {stage === "camera" && torchOk && <button type="button" style={{ ...btn(torchOn), padding: "13px 12px" }} onClick={() => void setTorch(!torchOn)}>Light {torchOn ? "on" : "off"}</button>}
        </div>
      </div>

      {stage === "camera" && (
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraErr ? "none" : "block" }} />
          {live && !cameraErr && <LiveOutline quad={live.quad} w={live.w} h={live.h} ok={live.ok} video={video.current} />}
          {cameraErr && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center", gap: 16 }}>
              <div style={{ fontSize: 15 }}>{cameraErr}</div>
              <label style={{ ...btn(true), display: "inline-block" }}>Pick a photo<input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => void pickFile(e.target.files?.[0])} /></label>
            </div>
          )}
          {!cameraErr && (
            <div style={{ position: "absolute", left: 0, right: 0, top: "calc(env(safe-area-inset-top,0px) + 70px)", textAlign: "center", fontSize: 13, fontWeight: 700 }}>
              {dark && !torchOn ? (torchOk ? "Low light. Turn the light on." : "Low light. Find more light, or tilt the page toward a lamp.") : live?.ok ? "Hold steady. It captures by itself." : "Put the whole page in view on a darker surface."}
            </div>
          )}
          {!cameraErr && (
            <div style={{ ...bar, bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 18px)", justifyContent: "center", background: "linear-gradient(rgba(0,0,0,0),#000)" }}>
              <label style={{ ...btn(), position: "absolute", left: 16 }}>Photo<input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => void pickFile(e.target.files?.[0])} /></label>
              <button type="button" aria-label="Take the picture" onClick={() => void shoot()} disabled={!!busy}
                style={{ width: 74, height: 74, borderRadius: "50%", border: "4px solid #fff", background: busy ? "#555" : "rgba(255,255,255,0.9)", cursor: "pointer" }} />
            </div>
          )}
        </div>
      )}

      {stage === "adjust" && still && quad && (
        <AdjustCorners img={still} quad={quad} onChange={setQuad}
          onRetake={() => { setStage("camera"); setStill(null); void startCamera(); }}
          onNext={() => void flatten(mode)} />
      )}

      {stage === "result" && shown && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: "calc(env(safe-area-inset-top,0px) + 62px)", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
            <canvas ref={previewRef} style={{ maxWidth: "100%", maxHeight: "100%", background: "#fff" }} />
          </div>
          <div style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{paper ? `${paper} page` : "Page shape measured"}  ·  {shown.width} x {shown.height}</div>
          <div style={{ display: "flex", gap: 8, padding: "0 16px" }}>
            {(["document", "color", "original"] as ScanMode[]).map((m) => (
              <button key={m} type="button" onClick={() => void flatten(m)} style={{ ...btn(mode === m), flex: 1, padding: "10px 0", fontSize: 12 }}>{m === "document" ? "Document" : m === "color" ? "Color" : "Original"}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "10px 16px calc(env(safe-area-inset-bottom,0px) + 16px)" }}>
            <button type="button" style={{ ...btn(), flex: 1 }} onClick={() => setStage("adjust")}>Corners</button>
            <button type="button" style={{ ...btn(), flex: 1 }} onClick={() => setTurns((t) => t + 1)}>Rotate</button>
            <button type="button" style={{ ...btn(true), flex: 2 }} onClick={() => void finish()}>Use scan</button>
          </div>
        </div>
      )}

      {busy && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5, fontSize: 16, fontWeight: 800 }}>{busy}</div>}
    </div>,
    document.body,
  );
}

/** The page outline drawn over the live picture (the video is cropped to fill, so map through its crop). */
function LiveOutline({ quad, w, h, ok, video }: { quad: Quad; w: number; h: number; ok: boolean; video: HTMLVideoElement | null }) {
  if (!video || !video.videoWidth) return null;
  const cw = video.clientWidth, ch = video.clientHeight;
  const s = Math.max(cw / w, ch / h), ox = (w * s - cw) / 2, oy = (h * s - ch) / 2;
  const pts = quad.map((p) => `${p.x * s - ox},${p.y * s - oy}`).join(" ");
  return <svg width={cw} height={ch} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}><polygon points={pts} fill={ok ? "rgba(74,222,128,0.14)" : "none"} stroke={ok ? "#4ade80" : "rgba(255,255,255,0.4)"} strokeWidth={3} /></svg>;
}

/** The photo with four corners to drag onto the page. */
function AdjustCorners({ img, quad, onChange, onRetake, onNext }: { img: Img; quad: Quad; onChange: (q: Quad) => void; onRetake: () => void; onNext: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 300, h: 400 });
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    const b = box.current; if (!b) return;
    const fit = () => { const s = Math.min(b.clientWidth / img.width, b.clientHeight / img.height); setSize({ w: Math.floor(img.width * s), h: Math.floor(img.height * s) }); };
    fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, [img]);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    c.width = size.w; c.height = size.h;
    c.getContext("2d")!.drawImage(toCanvas(shrink(img, Math.max(size.w, size.h) * 2)), 0, 0, size.w, size.h);
  }, [img, size]);
  const k = size.w / img.width;
  const move = (e: React.PointerEvent) => {
    if (drag == null) return;
    const r = cv.current!.getBoundingClientRect();
    const x = Math.min(img.width, Math.max(0, (e.clientX - r.left) / k)), y = Math.min(img.height, Math.max(0, (e.clientY - r.top) / k));
    const next = quad.map((p, i) => (i === drag ? { x, y } : p)) as Quad;
    onChange(next);
  };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: "calc(env(safe-area-inset-top,0px) + 62px)", minHeight: 0 }}>
      <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.7)", padding: "0 16px 8px" }}>Drag the corners onto the corners of the page.</div>
      <div ref={box} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
        <div style={{ position: "relative", width: size.w, height: size.h }} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
          <canvas ref={cv} style={{ width: size.w, height: size.h, display: "block" }} />
          <svg width={size.w} height={size.h} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
            <polygon points={quad.map((p) => `${p.x * k},${p.y * k}`).join(" ")} fill="rgba(74,222,128,0.12)" stroke="#4ade80" strokeWidth={2} />
          </svg>
          {quad.map((p: Pt, i) => (
            <div key={i} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag(i); }}
              style={{ position: "absolute", left: p.x * k - 22, top: p.y * k - 22, width: 44, height: 44, borderRadius: "50%", border: "3px solid #4ade80", background: "rgba(0,0,0,0.25)", touchAction: "none" }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "12px 16px calc(env(safe-area-inset-bottom,0px) + 16px)" }}>
        <button type="button" onClick={onRetake} style={{ flex: 1, padding: "14px 0", fontSize: 14, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", border: "1px solid rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer" }}>Retake</button>
        <button type="button" onClick={onNext} style={{ flex: 2, padding: "14px 0", fontSize: 14, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>Flatten page</button>
      </div>
    </div>
  );
}
