// lib/scan/geometry.ts
//
// The geometry of a page photographed at an angle: ordering the four corners, the homography that maps the flat page
// onto the photo, and the page's true width-to-height ratio. The ratio is worked out from the perspective itself
// (the sides of a rectangle seen at an angle are orthogonal in 3D, which fixes the camera's focal length and with
// it the page's shape), so the flattened page is neither stretched nor squashed. Pure math: no canvas, no browser.

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // top-left, top-right, bottom-right, bottom-left

/** Corners in reading order: TL, TR, BR, BL, whatever order they came in. */
export function orderCorners(pts: Pt[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const byAngle = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)); // clockwise from the left, y down
  // Start at the corner nearest the top-left of the frame so the page is upright.
  let start = 0, best = Infinity;
  byAngle.forEach((p, i) => { const d = p.x + p.y; if (d < best) { best = d; start = i; } });
  return [0, 1, 2, 3].map((k) => byAngle[(start + k) % 4]) as Quad;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.x * n.y - n.x * p.y; }
  return Math.abs(a) / 2;
}

export function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

export type H = [number, number, number, number, number, number, number, number, number];

/** Homography taking the unit square (0,0)-(1,1) onto the quad (TL, TR, BR, BL). Closed form (Heckbert). */
export function unitSquareToQuad(q: Quad): H {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-12 || Math.abs(sy) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
  }
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

export const applyH = (m: H, u: number, v: number): Pt => {
  const w = m[6] * u + m[7] * v + 1;
  return { x: (m[0] * u + m[1] * v + m[2]) / w, y: (m[3] * u + m[4] * v + m[5]) / w };
};

/**
 * Width / height of the real page, from its photographed corners. The principal point is the middle of the
 * image (`cx`,`cy`). With the page at an angle the focal length follows from the two page axes being at right
 * angles; a page photographed square-on has no perspective to read, so the side lengths are used instead.
 */
export function pageAspect(q: Quad, cx: number, cy: number): number {
  const sideW = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, sideH = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const plain = sideH > 0 ? sideW / sideH : 1;
  const H = unitSquareToQuad(q);
  const a = [H[0], H[3], H[6]], b = [H[1], H[4], H[7]]; // images of the page's width and height axes
  const den = a[2] * b[2];
  const f2 = -((a[0] - cx * a[2]) * (b[0] - cx * b[2]) + (a[1] - cy * a[2]) * (b[1] - cy * b[2])) / den;
  if (!(f2 > 0) || !Number.isFinite(f2)) return plain;
  const f = Math.sqrt(f2);
  // Real focal lengths for phone cameras sit around 0.6 to 2.5 times the long side; anything else is noise.
  const longSide = Math.max(cx, cy) * 2;
  if (f < 0.3 * longSide || f > 5 * longSide) return plain;
  const g1 = [(a[0] - cx * a[2]) / f, (a[1] - cy * a[2]) / f, a[2]];
  const g2 = [(b[0] - cx * b[2]) / f, (b[1] - cy * b[2]) / f, b[2]];
  const n1 = Math.hypot(g1[0], g1[1], g1[2]), n2 = Math.hypot(g2[0], g2[1], g2[2]);
  const r = n1 / n2; // the unit square is scaled by the page width along `a` and its height along `b`
  return Number.isFinite(r) && r > 0.15 && r < 6 ? r : plain;
}

export const PAPERS: { name: string; ratio: number }[] = [
  { name: "Letter", ratio: 8.5 / 11 }, { name: "Legal", ratio: 8.5 / 14 }, { name: "A4", ratio: 210 / 297 },
];

/** Snaps to a standard paper size only when the measurement is already within `tol` of it (portrait or landscape). */
export function snapAspect(r: number, tol = 0.03): { ratio: number; paper: string | null } {
  for (const p of PAPERS) {
    for (const cand of [p.ratio, 1 / p.ratio]) if (Math.abs(r - cand) / cand <= tol) return { ratio: cand, paper: p.name };
  }
  return { ratio: r, paper: null };
}

/** Output pixel size for the flattened page: the right shape, as sharp as the photo allows, never upscaled much. */
export function outputSize(q: Quad, ratio: number, maxLong = 2400): { w: number; h: number } {
  const sideW = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, sideH = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  // The photo's own resolution along the page: the longer measured side, at most 15% more.
  const nativeLong = Math.max(sideW, sideH) * 1.15;
  const long = Math.min(maxLong, Math.max(600, nativeLong));
  return ratio >= 1 ? { w: Math.round(long), h: Math.round(long / ratio) } : { w: Math.round(long * ratio), h: Math.round(long) };
}
