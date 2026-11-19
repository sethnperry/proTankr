// lib/squawk/squawkText.ts
// The text of a Squawk push. Pure.

/** "TT 25184: Wreck on I-4" / "TT 25184 sent a photo". Pure. */
export function squawkPushText(senderLabel: string | null, body: string, attachmentCount: number): string {
  const who = senderLabel?.trim() || "Someone";
  const text = body.trim().replace(/\s+/g, " ");
  const clip = text.length > 140 ? `${text.slice(0, 137)}...` : text;
  if (clip) return `${who}: ${clip}`;
  return attachmentCount > 0 ? `${who} sent ${attachmentCount === 1 ? "a file" : `${attachmentCount} files`}` : who;
}
