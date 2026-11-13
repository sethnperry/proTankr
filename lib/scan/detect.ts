// lib/scan/detect.ts
//
// Finds the page in a photo: the big bright shape on a darker surface. Works on a shrunken copy, so it is quick
// enough to run on the live camera picture. When the page and the table are the same colour it finds nothing and
// the person drags the corners instead; a wrong guess is worse than no guess, so it says how sure it is.

import { isConvex, orderCorners, quadArea, type Pt, type Quad } from "./geometry.ts";
import { lum, shrink, type Img } from "./image.ts";

const WORK = 320;

function otsu(g: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of g) hist[v]++;
  const total = g.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sumB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

function hullOf(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
}

/** Ramer-Douglas-Peucker on a closed ring, so a hull of hundreds of points becomes a few corners. */
function simplifyRing(ring: Pt[], eps: number): Pt[] {
  if (ring.length <= 4) return ring;
  const seg = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    let idx = -1, maxD = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((b.x - a.x) * (a.y - pts[i].y) - (a.x - pts[i].x) * (b.y - a.y)) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
      if (d > maxD) { maxD = d; idx = i; }
    }
    return maxD > eps ? [...seg(pts.slice(0, idx + 1)).slice(0, -1), ...seg(pts.slice(idx))] : [a, b];
  };
  // Split the ring at its two farthest points so neither half wraps.
  let i0 = 0, j0 = 0, far = -1;
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) { const d = Math.hypot(ring[i].x - ring[j].x, ring[i].y - ring[j].y); if (d > far) { far = d; i0 = i; j0 = j; } }
  const rot = [...ring.slice(i0), ...ring.slice(0, i0)];
  const k = (j0 - i0 + ring.length) % ring.length;
  return [...seg(rot.slice(0, k + 1)).slice(0, -1), ...seg([...rot.slice(k), rot[0]]).slice(0, -1)];
}

/** The four hull corners enclosing the most area (the page, for a hull that is nearly a quadrilateral). */
function bestQuad(ring: Pt[]): Quad | null {
  const n = ring.length;
  if (n < 4) return null;
  let best = 0, q: Quad | null = null;
  for (let a = 0; a < n - 3; a++) for (let b = a + 1; b < n - 2; b++) for (let c = b + 1; c < n - 1; c++) for (let d = c + 1; d < n; d++) {
    const cand: Quad = [ring[a], ring[b], ring[c], ring[d]];
    const area = quadArea(cand);
    if (area > best) { best = area; q = cand; }
  }
  return q;
}

export type Detection = { quad: Quad; confidence: number };

/** The page's corners in the coordinates of `src`, or null when nothing page-shaped stands out. */
export function detectPage(src: Img): Detection | null {
  const img = shrink(src, WORK);
  const w = img.width, h = img.height, scale = src.width / w;
  // 3x3 smoothed grayscale.
  const raw = new Float32Array(w * h);
  for (let i = 0; i < raw.length; i++) raw[i] = lum(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += raw[yy * w + xx]; n++; } }
    g[y * w + x] = s / n;
  }
  const t = otsu(g);
  const mask = new Uint8Array(w * h);
  let fg = 0;
  for (let i = 0; i < mask.length; i++) if (g[i] > t) { mask[i] = 1; fg++; }
  if (fg < w * h * 0.1 || fg > w * h * 0.97) return null;

  // Biggest connected bright shape.
  const label = new Int32Array(w * h);
  let bestId = 0, bestSize = 0, id = 0;
  const stack: number[] = [];
  for (let s0 = 0; s0 < mask.length; s0++) {
    if (!mask[s0] || label[s0]) continue;
    id++; let size = 0; stack.push(s0); label[s0] = id;
    while (stack.length) {
      const c = stack.pop()!; size++;
      const x = c % w, y = (c - x) / w;
      if (x > 0 && mask[c - 1] && !label[c - 1]) { label[c - 1] = id; stack.push(c - 1); }
      if (x < w - 1 && mask[c + 1] && !label[c + 1]) { label[c + 1] = id; stack.push(c + 1); }
      if (y > 0 && mask[c - w] && !label[c - w]) { label[c - w] = id; stack.push(c - w); }
      if (y < h - 1 && mask[c + w] && !label[c + w]) { label[c + w] = id; stack.push(c + w); }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
  }
  if (bestSize < w * h * 0.1) return null;

  // Outline: the left and right edge of the shape on every row (text holes inside don't matter to a hull).
  const pts: Pt[] = [];
  let spanArea = 0; // the shape with its text holes filled
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (label[y * w + x] === bestId) { if (l < 0) l = x; r = x; }
    if (l >= 0) { pts.push({ x: l, y }, { x: r, y }); spanArea += r - l + 1; }
  }
  const hull = hullOf(pts);
  let ring = hull;
  for (let eps = 1.5; ring.length > 28 && eps < 40; eps *= 1.4) ring = simplifyRing(hull, eps);
  const q0 = bestQuad(ring);
  if (!q0) return null;
  const ordered = orderCorners(q0);
  if (!isConvex(ordered)) return null;
  const area = quadArea(ordered);
  const fill = spanArea / area; // 1 = the shape fills its quadrilateral (ink holes don't count against it)
  if (area < w * h * 0.12 || fill < 0.7) return null;
  const quad = ordered.map((p) => ({ x: (p.x + 0.5) * scale, y: (p.y + 0.5) * scale })) as Quad;
  return { quad, confidence: Math.min(1, fill) };
}
