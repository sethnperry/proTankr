// lib/notify/templates.ts
//
// What a scheduled message says. A template is a small pure function from the schedule's payload to a subject and
// a plain-text body, looked up by template_key. A form that needs a reminder or a recap adds its template here;
// nothing sends its own email.

export type Rendered = { subject: string; text: string; /** The short line for a push. */ push: string };
export type Template = (payload: Record<string, unknown>) => Rendered;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const lines = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

export const TEMPLATES: Record<string, Template> = {
  // A plain reminder: subject and body come from the schedule itself.
  reminder: (p) => ({ subject: str(p.subject, "Reminder"), text: str(p.body, ""), push: str(p.subject, "Reminder") }),
  // A recap: a title and a list of lines.
  recap: (p) => {
    const title = str(p.title, "Recap");
    const rows = lines(p.lines);
    return { subject: title, text: [title, "", ...rows.map((l) => `- ${l}`)].join("\n"), push: rows.length ? `${title}: ${rows[0]}${rows.length > 1 ? ` (+${rows.length - 1})` : ""}` : title };
  },
};

export function render(key: string, payload: Record<string, unknown>): Rendered | null {
  const t = TEMPLATES[key];
  return t ? t(payload) : null;
}
