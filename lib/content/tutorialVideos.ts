// lib/content/tutorialVideos.ts
// Shared source for recorded walkthrough clips -- consumed by both
// app/learn/page.tsx (in-app "Guided tours" section) and
// app/about/videos/page.tsx (public marketing page), same reasoning as
// lib/content/learnTopics.tsx: one list, edited once, instead of the two
// pages drifting apart. Expected to grow over time as more clips are
// recorded (see app/studio) -- this is deliberately just a flat, ordered
// array so adding another one is a single new entry, no restructuring.

export type TutorialVideo = {
  id: string;
  title: string;
  description?: string;
  src: string; // public/videos/*
};

// Emptied 2026-09 -- the two "Typical Workflow" clips were pulled pending
// a better add/edit/remove workflow for this list (recording ad hoc into
// a hardcoded array doesn't scale). Both consumers (app/learn's Guided
// tours accordion, app/about/videos) render a "coming soon" empty state
// when this is empty -- see each file's own handling -- so this can stay
// at [] safely until new clips are ready to add back.
export const TUTORIAL_VIDEOS: TutorialVideo[] = [];
