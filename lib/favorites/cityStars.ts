// lib/favorites/cityStars.ts
//
// City favorites live in localStorage, per driver. They used to be written under an "anon" key until
// sign-in finished and then read back from the real key, so a star tapped early vanished. Rules now:
// never write before the user id is known; when it is known, fold any "anon" leftovers into it.

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const parse = (raw: string | null): string[] => {
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; }
  catch { return []; }
};

/** The driver's stars, with any pre-sign-in "anon" stars merged in (and the anon copy removed). */
export function loadCityStars(store: Store, prefix: string, userId: string): Set<string> {
  const out = new Set(parse(store.getItem(`${prefix}${userId}`)));
  const anonKey = `${prefix}anon`;
  const anon = parse(store.getItem(anonKey));
  if (anon.length) {
    anon.forEach((k) => out.add(k));
    try { store.setItem(`${prefix}${userId}`, JSON.stringify([...out])); store.removeItem(anonKey); } catch { /* storage blocked */ }
  }
  return out;
}

/** Saves the set. Returns false (and writes nothing) while the user id is unknown. */
export function saveCityStars(store: Store, prefix: string, userId: string, stars: Set<string>): boolean {
  if (!userId) return false;
  try { store.setItem(`${prefix}${userId}`, JSON.stringify([...stars])); return true; } catch { return false; }
}

export const cityStarKey = (state: string, city: string) => `${state.trim().toUpperCase()}||${city.trim().toLowerCase()}`;
