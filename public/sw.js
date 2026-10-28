// public/sw.js
// Minimal service worker for PWA installability.
// Network-first for navigations (HTML) so every deploy takes effect on the
// next load, cache-first for content-hashed build assets, network-first for
// API/Supabase/auth.

const CACHE_NAME = "protankr-v6"; // bump this to force-invalidate stale caches on the next deploy

const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/badge-96.png",
];

// Install — cache static assets that rarely change
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches (including any stale protankr-v* version)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go network-first for Supabase, API routes, and auth
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigations (full page loads) — network-first so every visit gets the
  // latest deploy's HTML and chunk references. A cache-first HTML shell is
  // what caused old JS to keep being served indefinitely after new deploys;
  // this only falls back to cache when actually offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached ?? new Response("Offline", { status: 503 }))
        )
    );
    return;
  }

  // manifest.json is small, rarely changes, but is exactly the kind of file
  // where "rarely" caused real pain this session -- a stale cache-first copy
  // silently kept an old start_url alive across reinstalls, since nothing
  // about its own URL ever changes to bust a stale cache entry the way a
  // content-hashed build chunk's URL does. Network-first here, same as
  // navigations, so a manifest edit takes effect on the very next load
  // instead of waiting on this whole file's own byte-diff to trigger an SW
  // update.
  if (url.pathname === "/manifest.json") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Content-hashed build assets never change for a given URL, so cache-first
  // is safe and fast.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (event.request.method === "GET" && response.status === 200 && response.type !== "opaque") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (icons, misc images) — cache-first with network fallback.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (event.request.method === "GET" && response.status === 200 && response.type !== "opaque") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});

// ── Notification answers, kept until they reach the server ───────────────────
// A button tapped with no signal is stored in IndexedDB and retried on background sync, when the
// app opens or regains signal (it posts "flush-answers"), and on the next push.
function answersDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("protankr-sw", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("answers", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbOp(mode, fn) {
  const db = await answersDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("answers", mode);
    const out = fn(tx.objectStore("answers"));
    tx.oncomplete = () => resolve(out && out.result);
    tx.onerror = () => reject(tx.error);
  });
}
async function postAnswer(id, answer) {
  const res = await fetch("/api/push/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, answer }) });
  // 4xx means it will never be accepted (bad id): drop it. Only a network error or 5xx is retried.
  return res.ok || (res.status >= 400 && res.status < 500);
}
async function sendAnswer(id, answer) {
  try { if (await postAnswer(id, answer)) return; } catch (e) { /* offline */ }
  try {
    await dbOp("readwrite", (st) => st.put({ id, answer, at: Date.now() }));
    if (self.registration.sync) await self.registration.sync.register("stop-answers");
  } catch (e) { /* storage blocked: the answer is lost */ }
}
async function flushAnswers() {
  let rows = [];
  try { rows = await dbOp("readonly", (st) => st.getAll()); } catch (e) { return; }
  for (const r of rows) {
    if (Date.now() - r.at > 48 * 3600 * 1000) { await dbOp("readwrite", (st) => st.delete(r.id)).catch(() => {}); continue; }
    try { if (await postAnswer(r.id, r.answer)) await dbOp("readwrite", (st) => st.delete(r.id)); } catch (e) { return; }
  }
}
self.addEventListener("sync", (event) => { if (event.tag === "stop-answers") event.waitUntil(flushAnswers()); });
self.addEventListener("message", (event) => { if (event.data === "flush-answers") event.waitUntil(flushAnswers()); });

// Push: show the notification the server sent, and open the app on tap.
self.addEventListener("push", (event) => {
  event.waitUntil(flushAnswers());
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "ProTankr", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(d.title || "ProTankr", {
      body: d.body || "",
      tag: d.tag || "protankr",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      // Buttons on the notification (Arrived / Delay, Yes / No) answer without opening the app.
      actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
      // A question stays on screen until answered, and buzzes so Android shows it as a heads-up
      // banner (buttons visible) instead of a collapsed card.
      requireInteraction: !!d.answerId,
      vibrate: d.answerId ? [200, 100, 200] : undefined,
      renotify: !!d.answerId,
      data: { url: d.url || "/planner/home", answerId: d.answerId || null, title: d.title || "ProTankr", body: d.body || "", tag: d.tag || "protankr", actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [] },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const answerId = event.notification.data && event.notification.data.answerId;
  if (!event.action && answerId) {
    // A tap beside the buttons must not open the app: put the question back.
    const n = event.notification.data;
    event.waitUntil(self.registration.showNotification(n.title, {
      body: n.body, tag: n.tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
      actions: n.actions, requireInteraction: true, data: n,
    }));
    return;
  }
  if (event.action && answerId) {
    // A button: record the answer and stay out of the app. The dashboard applies it later.
    // With no signal the answer is kept and sent when the phone is back online.
    event.waitUntil(sendAnswer(answerId, event.action));
    return;
  }
  const url = (event.notification.data && event.notification.data.url) || "/planner/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
