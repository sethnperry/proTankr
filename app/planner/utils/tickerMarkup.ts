// app/planner/utils/tickerMarkup.ts
//
// The outage ticker's text carries its own colors: ⟪red⟫  ⟦white⟧  ⟨gray⟩, everything else uses the
// row's base color. One parser so the header ticker and the dashboard row read the same.

export type TickerTone = "base" | "red" | "white" | "gray";
export const TICKER_TONE_COLOR: Record<Exclude<TickerTone, "base">, string> = {
  red: "#ff3b30",
  white: "#ffffff",
  gray: "rgba(255,255,255,0.5)",
};

export function parseTicker(text: string): { text: string; tone: TickerTone }[] {
  const out: { text: string; tone: TickerTone }[] = [];
  for (const part of text.split(/(⟪[^⟫]*⟫|⟦[^⟧]*⟧|⟨[^⟩]*⟩)/)) {
    if (!part) continue;
    const c = part[0];
    if (c === "⟪") out.push({ text: part.slice(1, -1), tone: "red" });
    else if (c === "⟦") out.push({ text: part.slice(1, -1), tone: "white" });
    else if (c === "⟨") out.push({ text: part.slice(1, -1), tone: "gray" });
    else out.push({ text: part, tone: "base" });
  }
  return out;
}
