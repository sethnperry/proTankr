// lib/trips/code39.ts
//
// Code 39 barcode for the PTD (docs/trip-workflow-design.md §13). Our own
// scheme: "PT-" plus the first 8 hex digits of the trip id. Code 39 because it
// needs no check digit, every scanner reads it, and it covers 0-9 A-Z and "-".
//
// Each character is 9 elements (bar, space, bar, ...), 1 = wide. Exactly 3 of
// the 9 are wide. Characters are separated by one narrow space and the whole
// code is wrapped in "*" start/stop characters.

const PATTERNS: Record<string, string> = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001",
  "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000",
  F: "001011000", G: "000001101", H: "100001100", I: "001001100", J: "000011100",
  K: "100000011", L: "001000011", M: "101000010", N: "000010011", O: "100010010",
  P: "001010010", Q: "000000111", R: "100000110", S: "001000110", T: "000010110",
  U: "110000001", V: "011000001", W: "111000000", X: "010010001", Y: "110010000",
  Z: "011010000", "-": "010000101", ".": "110000100", " ": "011000100", "*": "010010100",
  $: "010101000", "/": "010100010", "+": "010001010", "%": "000101010",
};

export const CODE39_CHARS = Object.keys(PATTERNS).filter((c) => c !== "*");

export function ptdCode(tripId: string): string {
  return `PT-${tripId.replace(/[^0-9a-f]/gi, "").slice(0, 8).toUpperCase()}`;
}

// Bar/space widths in module units (narrow = 1, wide = `ratio`), starting
// with a bar. Throws on a character Code 39 can't encode.
export function code39Widths(text: string, ratio = 3): number[] {
  const t = text.toUpperCase();
  const out: number[] = [];
  const chars = ["*", ...t.split(""), "*"];
  chars.forEach((ch, i) => {
    if (ch === "*" && i !== 0 && i !== chars.length - 1) throw new Error("'*' is reserved in Code 39");
    const p = PATTERNS[ch];
    if (!p) throw new Error(`Code 39 can't encode '${ch}'`);
    for (const bit of p) out.push(bit === "1" ? ratio : 1);
    if (i < chars.length - 1) out.push(1); // inter-character gap
  });
  return out;
}

// Rectangles for an SVG: x and width for each bar, in module units.
export function code39Bars(text: string, ratio = 3): { bars: { x: number; w: number }[]; width: number } {
  const widths = code39Widths(text, ratio);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return { bars, width: x };
}

export function code39Pattern(ch: string): string | undefined {
  return PATTERNS[ch];
}
