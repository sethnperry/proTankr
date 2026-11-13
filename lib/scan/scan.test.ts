import test from "node:test";
import assert from "node:assert/strict";
import { applyH, orderCorners, pageAspect, snapAspect, unitSquareToQuad, type H, type Pt, type Quad } from "./geometry.ts";
import { detectPage } from "./detect.ts";
import { enhance, makeImg, meanBrightness, sharpness, shrink, warpPage, type Img } from "./image.ts";

const invert = (m: H): H => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g), G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C;
  return [A / det, D / det, G / det, B / det, E / det, Hh / det, C / det, F / det, I / det];
};

/** A flat letter page: white, a border, dark text-like bars and a column of fine lines. */
function flatPage(): Img {
  const W = 850, Hh = 1100, img = makeImg(W, Hh);
  img.data.fill(245);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  const set = (x: number, y: number, v: number) => { const o = (y * W + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; };
  for (let x = 0; x < W; x++) for (let t = 0; t < 6; t++) { set(x, t, 20); set(x, Hh - 1 - t, 20); }
  for (let y = 0; y < Hh; y++) for (let t = 0; t < 6; t++) { set(t, y, 20); set(W - 1 - t, y, 20); }
  for (let row = 0; row < 24; row++) for (let y = 80 + row * 38; y < 100 + row * 38; y++) for (let x = 60; x < 60 + 300 + ((row * 97) % 380); x++) set(x, y, 30);
  return img;
}

/** Photographs `page` with a pinhole camera: page tilted, off to a side, with a shadow gradient across it and a darker table. */
function photograph(page: Img, o: { pitch: number; yaw: number; shadow: number }) {
  const W = 1280, Hh = 960, f = 1100, cx = W / 2, cy = Hh / 2;
  const pw = 8.5, ph = 11;
  const pts3 = [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]].map(([x, y]) => {
    // rotate about x (pitch) then y (yaw), then push away from the camera
    let X = x, Y = y, Z = 0;
    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    [Y, Z] = [Y * cp - Z * sp, Y * sp + Z * cp];
    const cyw = Math.cos(o.yaw), syw = Math.sin(o.yaw);
    [X, Z] = [X * cyw + Z * syw, -X * syw + Z * cyw];
    return { X: X + 0.8, Y: Y - 0.3, Z: Z + 15.5 };
  });
  const quad = pts3.map((p) => ({ x: (f * p.X) / p.Z + cx, y: (f * p.Y) / p.Z + cy })) as Quad;
  const Hq = unitSquareToQuad(quad), Hi = invert(Hq);
  const photo = makeImg(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const w = Hi[6] * x + Hi[7] * y + Hi[8];
    const u = (Hi[0] * x + Hi[1] * y + Hi[2]) / w, v = (Hi[3] * x + Hi[4] * y + Hi[5]) / w;
    const o4 = (y * W + x) * 4;
    let r: number;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      const px = Math.min(page.width - 1, Math.round(u * (page.width - 1))), py = Math.min(page.height - 1, Math.round(v * (page.height - 1)));
      r = page.data[(py * page.width + px) * 4] * (1 - o.shadow * (x / W)); // shadow grows to the right
    } else r = 55 + 10 * Math.sin(x / 40); // table
    photo.data[o4] = photo.data[o4 + 1] = photo.data[o4 + 2] = r; photo.data[o4 + 3] = 255;
  }
  return { photo, quad, W, Hh };
}

test("corners come back in reading order whatever order they arrive", () => {
  const q = orderCorners([{ x: 90, y: 80 }, { x: 10, y: 12 }, { x: 95, y: 10 }, { x: 8, y: 85 }]);
  assert.deepEqual(q.map((p) => [p.x, p.y]), [[10, 12], [95, 10], [90, 80], [8, 85]]);
});

test("a page photographed at an angle gets its true shape back, not the photo's", () => {
  const { photo, quad, W, Hh } = photograph(flatPage(), { pitch: 0.55, yaw: 0.35, shadow: 0 });
  const plain = (Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) + Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y)) / 2 /
    ((Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y) + Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) / 2);
  const r = pageAspect(quad, W / 2, Hh / 2);
  const truth = 8.5 / 11;
  assert.ok(Math.abs(r - truth) / truth < 0.02, `aspect ${r} vs ${truth} (side lengths alone say ${plain})`);
  assert.ok(Math.abs(plain - truth) / truth > 0.05, "the test photo really is skewed");
  assert.equal(snapAspect(r).paper, "Letter");
});

test("detection finds the page in a dim, unevenly lit photo, and the flattened page matches the original", () => {
  const { photo, quad } = photograph(flatPage(), { pitch: 0.4, yaw: -0.25, shadow: 0.55 });
  const det = detectPage(photo);
  assert.ok(det, "found a page");
  const diag = Math.hypot(photo.width, photo.height);
  det!.quad.forEach((p: Pt, i: number) => assert.ok(Math.hypot(p.x - quad[i].x, p.y - quad[i].y) < 0.02 * diag, `corner ${i} off by ${Math.hypot(p.x - quad[i].x, p.y - quad[i].y).toFixed(1)}px`));
  const ratio = snapAspect(pageAspect(det!.quad, photo.width / 2, photo.height / 2)).ratio;
  const flat = warpPage(photo, det!.quad, ratio, 1100);
  assert.ok(Math.abs(flat.width / flat.height - 8.5 / 11) < 0.02, `output ${flat.width}x${flat.height}`);
});

test("flattening removes the shadow: the page ends up evenly white", () => {
  const { photo, quad } = photograph(flatPage(), { pitch: 0.2, yaw: 0.1, shadow: 0.6 });
  const flat = warpPage(photo, quad, 8.5 / 11, 1000);
  const side = (img: Img, x0: number, x1: number) => { let s = 0, n = 0; for (let y = 40; y < img.height - 40; y += 7) for (let x = x0; x < x1; x += 7) { const v = img.data[(y * img.width + x) * 4]; if (v > 140) { s += v; n++; } } return s / n; };
  const before = [side(flat, 20, 120), side(flat, flat.width - 120, flat.width - 20)];
  assert.ok(before[0] - before[1] > 40, "a real shadow across the page");
  const doc = enhance(flat, "document");
  const after = [side(doc, 20, 120), side(doc, doc.width - 120, doc.width - 20)];
  assert.ok(Math.abs(after[0] - after[1]) < 12, `left ${after[0].toFixed(0)} right ${after[1].toFixed(0)}`);
  assert.ok(after[0] > 225, "paper reads as white");
});

test("sharper frames score higher and dim frames read as dim", () => {
  const sharp = flatPage();
  const soft = makeImg(sharp.width, sharp.height);
  // 9x9 box blur by shrinking and re-expanding
  const small = shrink(sharp, 120);
  for (let y = 0; y < soft.height; y++) for (let x = 0; x < soft.width; x++) { const o = (y * soft.width + x) * 4, s = (Math.floor((y * small.height) / soft.height) * small.width + Math.floor((x * small.width) / soft.width)) * 4; soft.data[o] = soft.data[o + 1] = soft.data[o + 2] = small.data[s]; soft.data[o + 3] = 255; }
  assert.ok(sharpness(sharp) > sharpness(soft) * 2);
  const dark = makeImg(100, 100); dark.data.fill(30);
  assert.ok(meanBrightness(dark) < 40);
});

test("applyH round-trips the corners", () => {
  const q: Quad = [{ x: 10, y: 20 }, { x: 300, y: 40 }, { x: 320, y: 400 }, { x: 5, y: 380 }];
  const H = unitSquareToQuad(q);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => { const p = applyH(H, u, v); assert.ok(Math.hypot(p.x - q[i].x, p.y - q[i].y) < 1e-6); });
});
