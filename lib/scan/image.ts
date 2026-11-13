// lib/scan/image.ts
//
// The pixel work, on plain RGBA buffers (the same layout as the browser's ImageData) so it runs in a test:
// shrinking, perspective warp with smooth sampling, and flattening uneven light and shadows.

import { applyH, outputSize, unitSquareToQuad, type Quad } from "./geometry.ts";

export type Img = { data: Uint8ClampedArray; width: number; height: number };

export const makeImg = (width: number, height: number): Img => ({ data: new Uint8ClampedArray(width * height * 4), width, height });
export const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Box-average shrink so the long side is at most `maxLong`. */
export function shrink(src: Img, maxLong: number): Img {
  const s = Math.max(src.width, src.height) / maxLong;
  if (s <= 1) return src;
  const w = Math.max(1, Math.round(src.width / s)), h = Math.max(1, Math.round(src.height / s));
  const out = makeImg(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * src.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * src.width) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / w));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * src.width + xx) * 4; r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++; }
      const o = (y * w + x) * 4; out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Flattens the page photographed inside `quad` (in `src` pixels) into an upright rectangle of the given shape,
 * sampling each output pixel from the right place in the photo (bilinear, so lines stay clean).
 */
export function warpPage(src: Img, quad: Quad, ratio: number, maxLong = 2400): Img {
  const { w, h } = outputSize(quad, ratio, maxLong);
  const H = unitSquareToQuad(quad);
  const out = makeImg(w, h);
  const sw = src.width, sh = src.height, d = src.data;
  for (let j = 0; j < h; j++) {
    const v = h > 1 ? j / (h - 1) : 0;
    for (let i = 0; i < w; i++) {
      const p = applyH(H, w > 1 ? i / (w - 1) : 0, v);
      const o = (j * w + i) * 4;
      if (p.x < 0 || p.y < 0 || p.x > sw - 1 || p.y > sh - 1) { out.data[o] = out.data[o + 1] = out.data[o + 2] = 255; out.data[o + 3] = 255; continue; }
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = p.x - x0, fy = p.y - y0;
      const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, e = (y1 * sw + x1) * 4;
      for (let k = 0; k < 3; k++) {
        out.data[o + k] = d[a + k] * (1 - fx) * (1 - fy) + d[b + k] * fx * (1 - fy) + d[c + k] * (1 - fx) * fy + d[e + k] * fx * fy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/**
 * The light across the page, estimated as its local "white": the brightest part of each small block (paper, not
 * ink), smoothed. Text can't pull it down the way an average would, and a shadow or a lamp gradient shows up as
 * a smooth change that gets divided out.
 */
export function estimateLight(img: Img, block = 16): { w: number; h: number; v: Float32Array } {
  const gw = Math.max(2, Math.ceil(img.width / block)), gh = Math.max(2, Math.ceil(img.height / block));
  const g = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    const vals: number[] = [];
    for (let y = by * block; y < Math.min(img.height, (by + 1) * block); y += 2) for (let x = bx * block; x < Math.min(img.width, (bx + 1) * block); x += 2) {
      const i = (y * img.width + x) * 4; vals.push(lum(img.data[i], img.data[i + 1], img.data[i + 2]));
    }
    vals.sort((a, b) => a - b);
    g[by * gw + bx] = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))] : 255;
  }
  // Smooth: a wide blur twice, so a dark stamp the size of a block doesn't leave a hole.
  const blur = (src: Float32Array) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) { s += src[yy * gw + xx]; n++; } }
      out[y * gw + x] = s / n;
    }
    return out;
  };
  return { w: gw, h: gh, v: blur(blur(g)) };
}

const sampleLight = (L: { w: number; h: number; v: Float32Array }, x: number, y: number, block: number) => {
  const gx = Math.min(L.w - 1, Math.max(0, x / block - 0.5)), gy = Math.min(L.h - 1, Math.max(0, y / block - 0.5));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(L.w - 1, x0 + 1), y1 = Math.min(L.h - 1, y0 + 1), fx = gx - x0, fy = gy - y0;
  return L.v[y0 * L.w + x0] * (1 - fx) * (1 - fy) + L.v[y0 * L.w + x1] * fx * (1 - fy) + L.v[y1 * L.w + x0] * (1 - fx) * fy + L.v[y1 * L.w + x1] * fx * fy;
};

export type ScanMode = "document" | "color" | "original";

/**
 * Evens out the light and, in "document" mode, makes the page black ink on white. "color" keeps the colours
 * (stamps, highlighters). "original" returns the flattened page untouched.
 */
export function enhance(img: Img, mode: ScanMode): Img {
  if (mode === "original") return img;
  const block = 16;
  const L = estimateLight(img, block);
  const out = makeImg(img.width, img.height);
  const lo: number[] = new Array(256).fill(0);
  const tmp = new Uint8ClampedArray(img.width * img.height * 3);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4, t = (y * img.width + x) * 3;
    const scale = 255 / Math.max(40, sampleLight(L, x, y, block));
    tmp[t] = img.data[i] * scale; tmp[t + 1] = img.data[i + 1] * scale; tmp[t + 2] = img.data[i + 2] * scale;
    lo[Math.min(255, Math.round(lum(tmp[t], tmp[t + 1], tmp[t + 2])))]++;
  }
  // Black point: the 1st percentile of the evened-out page, so faint ink gets full contrast without crushing it.
  let acc = 0, black = 0; const total = img.width * img.height;
  for (let v = 0; v < 256; v++) { acc += lo[v]; if (acc >= total * 0.01) { black = v; break; } }
  const span = Math.max(60, 245 - black);
  const curve = (v: number) => { const n = Math.min(1, Math.max(0, (v - black) / span)); return 255 * Math.pow(n, mode === "document" ? 1.35 : 1.1); };
  for (let p = 0, t = 0, o = 0; p < img.width * img.height; p++, t += 3, o += 4) {
    if (mode === "document") { const g = curve(lum(tmp[t], tmp[t + 1], tmp[t + 2])); out.data[o] = out.data[o + 1] = out.data[o + 2] = g; }
    else { out.data[o] = curve(tmp[t]); out.data[o + 1] = curve(tmp[t + 1]); out.data[o + 2] = curve(tmp[t + 2]); }
    out.data[o + 3] = 255;
  }
  return out;
}

/** How sharp a frame is: variance of a Laplacian on a shrunken grayscale copy. Bigger is sharper. */
export function sharpness(img: Img): number {
  const s = shrink(img, 480);
  const g = new Float32Array(s.width * s.height);
  for (let i = 0; i < g.length; i++) g[i] = lum(s.data[i * 4], s.data[i * 4 + 1], s.data[i * 4 + 2]);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < s.height - 1; y++) for (let x = 1; x < s.width - 1; x++) {
    const c = y * s.width + x;
    const l = g[c - 1] + g[c + 1] + g[c - s.width] + g[c + s.width] - 4 * g[c];
    sum += l; sum2 += l * l; n++;
  }
  const mean = sum / Math.max(1, n);
  return sum2 / Math.max(1, n) - mean * mean;
}

/** Average brightness 0..255 (for "too dark, use the light"). */
export function meanBrightness(img: Img): number {
  const s = shrink(img, 96);
  let t = 0;
  for (let i = 0; i < s.width * s.height; i++) t += lum(s.data[i * 4], s.data[i * 4 + 1], s.data[i * 4 + 2]);
  return t / (s.width * s.height);
}
