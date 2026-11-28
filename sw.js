/* Modo sin conexión: guarda la app (esta página, sus archivos, Firebase y las fuentes) para que abra sin señal.
   Los datos (playlists, catálogo) los guarda Firestore en su propia caché; los archivos de audio están en IndexedDB.
   - Archivos de la app: primero la red (así siempre llega la versión nueva) y, si no hay señal, lo guardado.
   - Firebase y fuentes (direcciones con versión, no cambian): primero lo guardado.
   - Todo lo demás (YouTube, SoundCloud, búsquedas) pasa directo, sin guardar. */
const CACHE = "np-v5";
const FB = "https://www.gstatic.com/firebasejs/12.19.0/";
const APP = ["./", "index.html", "config.js?v=2", "lib.js?v=9", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];
const LIBS = [FB + "firebase-app.js", FB + "firebase-auth.js", FB + "firebase-firestore.js"];

// Los archivos de la app son imprescindibles: si uno falla, no se instala esta versión (queda la anterior) en vez de dejar la caché incompleta.
// Firebase es «mejor esfuerzo»: si no baja ahora, cacheFirst lo guarda la primera vez que la página lo pide.
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(APP.map(u => new Request(u, {cache: "reload"})));
    await Promise.all(LIBS.map(u => c.add(u).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    // Firebase de versiones que la app ya no usa (la dirección lleva la versión)
    const c = await caches.open(CACHE);
    for (const r of await c.keys()) if (r.url.startsWith("https://www.gstatic.com/firebasejs/") && !r.url.startsWith(FB)) await c.delete(r);
    await self.clients.claim();
  })());
});
const same = u => u.origin === location.origin;
const pinned = u => u.href.startsWith("https://www.gstatic.com/firebasejs/") || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
// Página de la app (con o sin ?juntos=…, ?debug…): se guarda una sola vez, como index.html
const appPage = (req, u) => req.mode === "navigate" && (u.pathname.endsWith("/") || u.pathname.endsWith("/index.html"));
async function networkFirst(req, u){
  const c = await caches.open(CACHE), key = appPage(req, u) ? "index.html" : req;
  const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()); return r; });
  const fallback = () => c.match(key, {ignoreSearch: key === "index.html"});
  // Señal muy lenta: a los 3 s se abre lo guardado (la versión nueva queda guardada para la próxima)
  const slow = new Promise(ok => setTimeout(ok, 3000)).then(async () => (await fallback()) || net);
  try { return await Promise.race([net, slow]); }
  catch (err) { const hit = await fallback(); if (hit) return hit; throw err; }
}
async function cacheFirst(req){
  const c = await caches.open(CACHE), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === "opaque") c.put(req, r.clone());
  return r;
}
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (same(u) && !u.pathname.endsWith("/sw.js")) e.respondWith(networkFirst(req, u));
  else if (pinned(u)) e.respondWith(cacheFirst(req));
});
