/* sw.js — cevrimdisi calisma: uygulama dosyalari onbellekten gelir, arka planda yenilenir. */
const ONBELLEK = "kelime-karti-v2.2.0";
const DOSYALAR = ["./", "index.html", "app.js", "parse.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== ONBELLEK).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  const yazi = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !yazi) return;
  // once onbellek, arka planda ag (stale-while-revalidate); ag yoksa onbellekteki kalir
  e.respondWith(caches.open(ONBELLEK).then(async (c) => {
    const eski = await c.match(r, { ignoreSearch: true });
    const ag = fetch(r).then((y) => { if (y && (y.ok || y.type === "opaque")) c.put(r, y.clone()); return y; }).catch(() => eski);
    return eski || ag;
  }));
});
