// lib/content/walkthroughDecks.ts
// PDF walkthrough decks shown on the public /about/videos ("Walkthroughs")
// page. One flat, ordered list -- add a deck by dropping its PDF in
// public/walkthroughs/ and adding an entry here. Recorded clips still live
// in lib/content/tutorialVideos.ts and render below the decks.

export type WalkthroughDeck = {
  id: string;
  title: string;
  description: string;
  href: string; // public/walkthroughs/*.pdf
  pages: number;
};

export const WALKTHROUGH_DECKS: WalkthroughDeck[] = [
  {
    id: "overview",
    title: "ProTankr Overview",
    description:
      "A smarter way to roll: the issues ProTankr addresses and how, in a short deck for managers.",
    href: "/walkthroughs/ProTankr_Overview.pdf",
    pages: 15,
  },
  {
    id: "driver",
    title: "Driver Walkthrough",
    description:
      "A day in the cab: one load from start of shift to the drop, plus the tool grid, fuel flow and IFTA reporting.",
    href: "/walkthroughs/ProTankr_Driver_Walkthrough.pdf",
    pages: 19,
  },
  {
    id: "splash",
    title: "Splash Blending SOP",
    description:
      "Load E0, top it off with ethanol and deliver E10: setup, both loads, the drop and the PTD, step by step.",
    href: "/walkthroughs/ProTankr_Splash_Blending_SOP.pdf",
    pages: 13,
  },
];
