// Prueba de punta a punta con los emuladores de Firebase (nunca toca los datos reales).
// Correr: npm run e2e   (levanta los emuladores, sirve la app en localhost y la maneja con Chromium)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url)), PORT = 5173, P = "demo-np";
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const ADMIN = {Authorization: "Bearer owner", "Content-Type": "application/json"};
const today = (d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"))(new Date());

/* ---------- Firestore del emulador por REST (como administrador: sin reglas) ---------- */
const enc = v => v === null || v === undefined ? {nullValue: null} : Array.isArray(v) ? {arrayValue: {values: v.map(enc)}}
  : v instanceof Date ? {timestampValue: v.toISOString()} : typeof v === "object" ? {mapValue: {fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))}}
  : typeof v === "number" ? (Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v}) : typeof v === "boolean" ? {booleanValue: v} : {stringValue: String(v)};
const dec = v => "nullValue" in v ? null : "arrayValue" in v ? (v.arrayValue.values || []).map(dec) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]))
  : "integerValue" in v ? +v.integerValue : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue : "timestampValue" in v ? v.timestampValue : v.stringValue;
const put = (path, data) => fetch(`${FS}/${path}`, {method: "PATCH", headers: ADMIN, body: JSON.stringify({fields: enc(data).mapValue.fields})}).then(r => { if (!r.ok) throw new Error("put " + path + " " + r.status); });
const get = async path => { const r = await fetch(`${FS}/${path}`, {headers: ADMIN}); return r.ok ? dec({mapValue: {fields: (await r.json()).fields || {}}}) : null; };
const list = async path => { const r = await fetch(`${FS}/${path}`, {headers: ADMIN}); return r.ok ? ((await r.json()).documents || []).map(d => d.name.split("/").pop()) : []; };
const setRules = text => fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}:securityRules`, {method: "PUT", headers: ADMIN, body: JSON.stringify({rules: {files: [{content: text}]}})}).then(r => { if (!r.ok) throw new Error("rules " + r.status); });
const wipe = () => fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/(default)/documents`, {method: "DELETE"});
async function until(what, fn, ms = 15000){
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < ms){ try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise(r => setTimeout(r, 250)); }
  throw new Error("no pasó a tiempo: " + what + (last instanceof Error ? " (" + last.message + ")" : ""));
}

/* ---------- Servidor de la app ---------- */
const TYPES = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"};
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)){ res.writeHead(403).end(); return; }
  try { res.writeHead(200, {"Content-Type": TYPES[extname(f)] || "application/octet-stream", "Cache-Control": "no-store"}).end(await readFile(f)); }
  catch { res.writeHead(404).end(); }
}).listen(PORT);
const URL0 = `http://localhost:${PORT}/`;

/* ---------- Datos de prueba ---------- */
const S = n => ({t: "Canción " + n, a: "Artista " + n, k: "Artista " + n + " - Canción " + n, y: "vid0000000" + n, pl: ["Lista"]});
const NEW_RULES = readFileSync(join(ROOT, "firestore.rules"), "utf8");
// Reglas como estaban antes (correos escritos en el archivo), con correos de prueba: para probar el paso de unas a otras
const OLD_RULES = NEW_RULES.replace(/&& request\.auth\.token\.email\.lower\(\) in get\([^;]*;/, "&& request.auth.token.email in ['a@test.com', 'b@test.com'];");
assert.notEqual(OLD_RULES, NEW_RULES, "no se pudo armar las reglas anteriores");

// Chromium de Playwright si está instalado; si no, el Chrome o Edge de la computadora (o CHROMIUM=/ruta), sin descargar nada
const LOCAL = [process.env.CHROMIUM, ...(process.platform === "win32"
  ? [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).flatMap(d => [join(d, "Google", "Chrome", "Application", "chrome.exe"), join(d, "Microsoft", "Edge", "Application", "msedge.exe")])
  : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"])].filter(Boolean);
const bundled = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();
const exe = process.env.CHROMIUM || (bundled ? null : LOCAL.find(f => existsSync(f)));
const browser = await chromium.launch(exe ? {executablePath: exe} : {});
const results = [], pageErrors = [];
async function step(name, fn){
  try { await fn(); results.push("ok   " + name); console.log("ok   " + name); }
  catch (e) { results.push("MAL  " + name + ": " + e.message); console.error("MAL  " + name + "\n", e); }
}
async function openAs(email, extra = "", ctx){
  ctx = ctx || await browser.newContext();
  await ctx.route(/youtube\.com|ytimg\.com|soundcloud\.com/, r => r.abort()); // sin YouTube en las pruebas
  await ctx.route(/googleapis\.com\/youtube\//, r => r.fulfill({contentType: "application/json", body: JSON.stringify({items: []})})); // la búsqueda de copias no encuentra nada (y no gasta cuota)
  const page = await ctx.newPage();
  page.on("pageerror", e => { pageErrors.push(email + ": " + e.message); console.error("  [" + email + "] error de página:", e.message); });
  await page.goto(URL0 + "?emu&as=" + encodeURIComponent(email) + extra);
  return {ctx, page};
}
const ready = page => page.waitForFunction(() => window.__npt?.loaded && window.__npt.mis.length > 0 && window.__npt.CAT.all.length > 0, null, {timeout: 20000});
// WAV de silencio (8 kHz, 8 bits, mono) de `secs` segundos: el archivo de audio de prueba
function wav(secs){
  const n = Math.round(secs * 8000), b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  return b;
}
const settle = page => page.evaluate(() => Promise.all(Object.values(window.__npt.chains)));

try {
  await wipe(); await setRules(OLD_RULES);
  await put("catalog/main", {all: [1, 2, 3, 4, 5].map(S), pls: ["Lista"], rep: []});
  await put("playlists/p1", {name: "Rodar", orden: 1, oculta: false, songs: [S(1)]});

  await step("antes de entrar no se carga YouTube (pesa ~1 MB)", async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage(); const yt = [];
    page.on("request", r => { if (/youtube\.com/.test(r.url())) yt.push(r.url()); });
    await page.goto(URL0); await page.waitForTimeout(2500);
    assert.equal(await page.isVisible("#gate"), true, "debería verse la entrada");
    assert.deepEqual(yt, []);
    const man = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
    assert.equal(man.display, "standalone"); assert.ok(man.icons.some(i => i.sizes === "512x512"));
    await ctx.close();
  });

  const A = await openAs("a@test.com"), B = await openAs("b@test.com");
  await Promise.all([ready(A.page), ready(B.page)]);

  await step("la lista y las playlists se ven", async () => {
    await A.page.waitForSelector("#list .row", {timeout: 10000});
    assert.equal(await A.page.locator("#list .row").count(), 5);
    await A.page.click("#tab-pls");
    await A.page.waitForSelector("#pls .nm");
    assert.match(await A.page.textContent("#pls"), /Rodar/);
    await A.page.click("#tab-all");
  });

  await step("cada cuenta con acceso se anota en config/acceso", async () => {
    await until("las dos anotadas", async () => { const d = await get("config/acceso"); return d && ["a@test.com", "b@test.com"].every(m => d.emails.includes(m)); });
  });

  await step("dos personas agregan canciones a la vez y no se pisan", async () => {
    await Promise.all([
      A.page.evaluate(() => { const n = window.__npt; n.toggleSong(n.mis[0], n.CAT.all[1]); }),
      B.page.evaluate(() => { const n = window.__npt; n.toggleSong(n.mis[0], n.CAT.all[2]); n.addMany(n.mis[0], [n.CAT.all[3]]); }),
    ]);
    await Promise.all([settle(A.page), settle(B.page)]);
    const ks = (await get("playlists/p1")).songs.map(s => s.k).sort();
    assert.deepEqual(ks, [1, 2, 3, 4].map(n => S(n).k).sort());
  });

  await step("cambios del catálogo a la vez tampoco se pisan", async () => {
    await Promise.all([
      A.page.evaluate(() => { const n = window.__npt; n.saveSc(n.CAT.all[3], "https://soundcloud.com/x/y"); }),
      B.page.evaluate(() => { const n = window.__npt; n.renameSong(n.CAT.all[4], "Título nuevo", "Artista 5"); }),
    ]);
    await Promise.all([settle(A.page), settle(B.page)]);
    const all = (await get("catalog/main")).all;
    assert.equal(all[3].sc, "https://soundcloud.com/x/y");
    assert.equal(all[4].t, "Título nuevo");
  });

  await step("mover y quitar dentro de la playlist", async () => {
    await A.page.waitForFunction(() => window.__npt.mis[0].songs.length === 4);
    const srv = (await get("playlists/p1")).songs.map(s => s.k);
    const want = [S(4).k, ...srv.filter(k => k !== S(4).k && k !== S(1).k)]; // S4 primero y sin S1, sobre el orden del servidor
    await A.page.evaluate(([k4, k1]) => { const n = window.__npt, p = n.mis[0]; n.moveSongTo(p, p.songs.findIndex(s => s.k === k4), 0); n.removeMany(p, [p.songs.find(s => s.k === k1)]); }, [S(4).k, S(1).k]);
    await settle(A.page);
    assert.deepEqual((await get("playlists/p1")).songs.map(s => s.k), want);
  });

  await step("Deshacer al quitar: sigue funcionando después de que la nube rearma las playlists", async () => {
    const before = (await get("playlists/p1")).songs.map(s => s.k), k = before[1];
    await A.page.evaluate(k => { const n = window.__npt, p = n.mis[0]; window.__p0 = p; n.removeUndo(p, [p.songs.find(s => s.k === k)]); }, k);
    await settle(A.page);
    await A.page.waitForFunction(() => window.__npt.mis[0] !== window.__p0, null, {timeout: 10000}); // llegó el snapshot: `mis` tiene objetos nuevos
    assert.ok(!(await get("playlists/p1")).songs.some(s => s.k === k), "se quitó en la nube");
    assert.ok(await A.page.evaluate(() => { const r = document.querySelector("#msg").getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }), "el aviso está a la vista");
    await A.page.evaluate(() => [...document.querySelectorAll("#msg button")].find(b => b.textContent === "Deshacer").click());
    await settle(A.page);
    assert.deepEqual((await get("playlists/p1")).songs.map(s => s.k), before, "volvió a su puesto");
  });

  await step("copia automática del día en la nube", async () => {
    const c = await until("copia de hoy", () => get("copias/" + today));
    assert.equal(c.catalog.all.length, 5);
    assert.ok((await get("copias/_indice")).ids.includes(today));
    assert.deepEqual(await list(`copias/${today}/playlists`), ["p1"]);
    await until("historial de las dos cuentas", async () => (await list(`copias/${today}/historial`)).length === 2);
  });

  await step("las copias viejas se borran (quedan 14)", async () => {
    const olds = Array.from({length: 15}, (_, i) => "2020-01-" + String(i + 1).padStart(2, "0"));
    for (const id of olds){ await put("copias/" + id, {catalog: {all: []}}); await put(`copias/${id}/playlists/p1`, {songs: []}); }
    await put("copias/_indice", {ids: [...olds, today]});
    await A.page.evaluate(() => { localStorage.removeItem("np-bk"); Object.keys(localStorage).filter(k => k.startsWith("np-bk")).forEach(k => localStorage.removeItem(k)); return window.__npt.autoBackup(); });
    const ids = await until("índice recortado", async () => { const d = await get("copias/_indice"); return d.ids.length === 14 && d.ids; });
    assert.ok(ids.includes(today)); assert.ok(!ids.includes("2020-01-01") && !ids.includes("2020-01-02"));
    assert.equal(await get("copias/2020-01-01"), null);
    assert.deepEqual(await list("copias/2020-01-01/playlists"), []);
  });

  await step("restaurar una copia (y antes guarda cómo estaba)", async () => {
    const { page } = A;
    await page.goto(URL0 + "?emu&as=a@test.com&restaurar"); await ready(page);
    await put("playlists/p1", {name: "Rodar", orden: 1, oculta: false, songs: [S(5)]}); // algo distinto de la copia
    await page.waitForFunction(k => window.__npt.mis[0].songs.length === 1 && window.__npt.mis[0].songs[0].k === k, S(5).k);
    const want = (await get(`copias/${today}/playlists/p1`)).songs.map(s => s.k), before = [S(5).k];
    assert.notDeepEqual(want, before, "la prueba necesita que la copia sea distinta de lo actual");
    await page.locator(`[data-bk="${today}"]`).click(); await page.locator(`[data-bk="${today}"]`).click();
    await until("playlist como en la copia", async () => JSON.stringify((await get("playlists/p1")).songs.map(s => s.k)) === JSON.stringify(want));
    assert.deepEqual((await get("copias/antes-de-restaurar/playlists/p1")).songs.map(s => s.k), before);
  });

  await step("reglas nuevas: entran las anotadas, otra cuenta no", async () => {
    await setRules(NEW_RULES);
    await A.page.goto(URL0 + "?emu&as=a@test.com"); await ready(A.page);
    const C = await openAs("c@test.com");
    await C.page.waitForSelector("#gate:not([hidden])", {timeout: 15000});
    await until("mensaje de sin acceso", async () => /no tiene acceso/.test(await C.page.textContent("#gate-msg")));
    await C.ctx.close();
    const p = await get("playlists/p1"); assert.ok(p);
  });

  await step("Ver juntos: borra las sesiones vencidas de la cuenta", async () => {
    const uid = await A.page.evaluate(() => window.__npt.uid);
    await put("juntos/viejaA", {host: uid, expira: new Date(Date.now() - 5 * 3600e3), fin: true, cola: []});
    await put("juntos/viejaA/pedidos/x", {email: "z@test.com", estado: "pendiente"});
    await put("juntos/vivaA", {host: uid, expira: new Date(Date.now() + 3600e3), fin: false, cola: []});
    await A.page.evaluate(() => localStorage.removeItem("np-jzclean"));
    await A.page.reload(); await ready(A.page);
    try { await until("sesión vencida borrada", async () => (await get("juntos/viejaA")) === null); }
    catch (e) { console.error((await A.page.evaluate(() => localStorage.getItem("np-log"))).split("\n").slice(-15).join("\n")); throw e; }
    assert.equal(await get("juntos/viejaA/pedidos/x"), null);
    assert.ok(await get("juntos/vivaA"), "la vigente no se toca");
  });

  await step("sin conexión: abre igual y lo cambiado se sube al volver", async () => {
    const ctx = await browser.newContext();
    const { page } = await openAs("a@test.com", "&sw", ctx);
    await ready(page);
    await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready.then(() => true), null, {timeout: 15000});
    await page.reload(); await ready(page); // ya con el service worker al mando
    await until("app guardada", () => page.evaluate(async () => !!(await caches.match("index.html")) && !!(await caches.match("lib.js", {ignoreSearch: true}))));
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    assert.equal(await page.isVisible("#net"), true, "aviso de sin conexión");
    await page.evaluate(() => { const n = window.__npt; n.toggleSong(n.mis[0], n.CAT.all[4]); });
    await page.waitForTimeout(500);
    await page.reload({waitUntil: "domcontentloaded"}); // sin señal: la abre el service worker
    await ready(page);
    assert.ok(await page.evaluate(() => window.__npt.mis[0].songs.some(s => s.k === window.__npt.CAT.all[4].k)), "el cambio sigue aquí tras recargar");
    assert.ok(!(await get("playlists/p1")).songs.some(s => s.k === S(5).k), "todavía no llegó al servidor");
    await ctx.setOffline(false);
    await until("cambio subido al volver la señal", async () => (await get("playlists/p1")).songs.some(s => s.k === S(5).k), 30000);
    await ctx.close();
  });
  /* ---------- Bloqueadas: canciones que no hubo forma de poner, con archivo propio en el aparato ---------- */
  const k2 = S(2).k;
  const sinrep = async () => (await get("catalog/main"))?.sinrep || [];
  const cuantas = page => page.textContent("#cbl").then(t => t.trim());
  await step("Bloqueadas: una canción que YouTube bloquea y sin otra copia queda anotada (una sola vez)", async () => {
    const { page } = A;
    await page.goto(URL0 + "?emu&as=a@test.com"); await ready(page);
    await page.click("#tab-all");
    await page.locator("#list .row", {hasText: "Canción 2"}).locator(".play").click();
    await page.waitForFunction(() => window.__npt.mode === "yt");
    await page.evaluate(() => window.__npt.ytErr(150)); // YouTube: «no se deja insertar» (como en el teléfono)
    const l = await until("anotada en el catálogo", async () => { const l = await sinrep(); return l.length && l; });
    assert.deepEqual(l.map(s => [s.k, s.t, s.a, s.c, s.f]), [[k2, "Canción 2", "Artista 2", 150, today]]);
    assert.match(await page.textContent("#msg"), /Bloqueadas/);
    await page.evaluate(k => { const n = window.__npt; n.noteSinrep(n.CAT.all.find(s => s.k === k), 150); }, k2); // otra vez: no se repite
    await settle(page);
    assert.equal((await sinrep()).length, 1);
  });

  await step("Bloqueadas: se ve en su sección, con contador, Buscar, Poner archivo y Pegar SoundCloud (también en el otro aparato)", async () => {
    const { page } = A;
    await page.click("#tab-bl");
    assert.equal(await cuantas(page), "1");
    const row = page.locator("#blbox .blrow", {hasText: "Canción 2"});
    assert.equal(await row.count(), 1);
    assert.match(await row.textContent(), /no deja ponerla fuera de su sitio/);
    const href = await row.locator("a", {hasText: "Buscar"}).getAttribute("href");
    assert.equal(href, "https://www.google.com/search?q=" + encodeURIComponent("Canción 2 Artista 2"));
    assert.equal(await row.locator("a", {hasText: "Buscar"}).getAttribute("target"), "_blank");
    assert.equal(await row.locator("input[type=file]").count(), 1);
    assert.equal(await row.locator("[data-blsc]").count(), 1);
    assert.match(await page.textContent("#blbox"), /solo en este aparato/);
    await until("la otra cuenta también la ve", async () => (await cuantas(B.page)) === "1");
  });

  await step("Bloqueadas: poner un archivo y la canción suena desde él", async () => {
    const { page } = A;
    await page.locator("#blbox .blrow", {hasText: "Canción 2"}).locator("input[type=file]").setInputFiles({name: "Canción 2.wav", mimeType: "audio/wav", buffer: wav(1)});
    await page.waitForSelector("#blbox .blsub");
    assert.equal(await cuantas(page), "", "con archivo aquí ya no cuenta como pendiente");
    assert.equal((await sinrep()).length, 1, "en la nube sigue: el otro aparato no tiene el archivo");
    assert.equal(await cuantas(B.page), "1");
    await page.click("#tab-all");
    const row = page.locator("#list .row", {hasText: "Canción 2"});
    assert.match(await row.textContent(), /♪ archivo/);
    await page.evaluate(() => { window.__sono = null; window.__npt.au.addEventListener("playing", () => { window.__sono = window.__sono || window.__npt.mode; }); });
    await row.locator(".play").click();
    await page.waitForFunction(() => window.__sono, null, {timeout: 10000});
    assert.equal(await page.evaluate(() => window.__sono), "file");
    assert.match(await page.evaluate(() => window.__npt.au.src), /^blob:/);
    assert.equal(await page.isVisible("#nsrc"), true, "dice «Desde tu archivo»");
  });

  await step("Bloqueadas: quitar el archivo la devuelve a la lista", async () => {
    const { page } = A;
    await page.click("#tab-bl");
    await page.locator("#blbox [data-blunfile]").click();
    await until("vuelve a contar", async () => (await cuantas(page)) === "1");
    assert.equal(await page.evaluate(() => new Promise(ok => { const r = indexedDB.open("np-audio"); r.onsuccess = () => { const q = r.result.transaction("files").objectStore("files").count(); q.onsuccess = () => ok(q.result); }; })), 0, "el aparato ya no guarda el archivo");
  });

  await step("Bloqueadas: ⋯ › Poner archivo en cualquier canción, y quitarlo", async () => {
    const { page } = A;
    await page.click("#tab-all");
    const row = () => page.locator("#list .row", {hasText: "Canción 3"});
    await row().locator("[data-menu]").click();
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click('#list [data-act="file"]')]);
    await fc.setFiles({name: "tres.mp3", mimeType: "audio/mpeg", buffer: wav(1)});
    await until("con archivo", async () => /♪ archivo/.test(await row().textContent()));
    await row().locator("[data-menu]").click();
    await page.click('#list [data-act="unfile"]');
    await until("sin archivo", async () => !/♪ archivo/.test(await row().textContent()));
    await row().locator("[data-menu]").click();
    const [fc2] = await Promise.all([page.waitForEvent("filechooser"), page.click('#list [data-act="file"]')]);
    await fc2.setFiles({name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x")});
    await until("avisa que no es audio", async () => /no es de audio/.test(await page.textContent("#msg")));
  });

  await step("Bloqueadas: con un enlace de SoundCloud sale de la lista (para los dos)", async () => {
    const { page } = A;
    await page.click("#tab-bl");
    await page.locator("#blbox [data-blsc]").click(); // «Pegar SoundCloud» abre el mismo campo de ⋯ › Pegar enlace
    assert.equal(await page.getAttribute("#tab-all", "aria-selected"), "true");
    await page.waitForSelector("#yf2-url", {timeout: 5000});
    assert.match(await page.getAttribute("#yf2-url", "placeholder"), /Canción 2/);
    await page.click('[data-act="altoff"]');
    await until("vuelve a Bloqueadas", async () => (await page.getAttribute("#tab-bl", "aria-selected")) === "true");
    await page.evaluate(k => { const n = window.__npt; n.saveSc(n.CAT.all.find(s => s.k === k), "https://soundcloud.com/artista-2/cancion-2"); }, k2);
    await settle(page);
    await until("fuera de la lista", async () => (await sinrep()).length === 0);
    await until("la otra cuenta ya no la cuenta", async () => (await cuantas(B.page)) === "");
  });

  if (process.env.SHOTS) await step("capturas de Bloqueadas (teléfono y escritorio)", async () => {
    for (const [w, h] of [[390, 844], [1400, 900], [320, 640]]){
      const ctx = await browser.newContext({viewport: {width: w, height: h}, ...(w < 600 ? {isMobile: true, hasTouch: true, deviceScaleFactor: 2} : {})});
      const { page } = await openAs("a@test.com", "", ctx); await ready(page);
      await page.evaluate(() => { const n = window.__npt; n.noteSinrep(n.CAT.all[0], 150); n.noteSinrep(n.CAT.all[2], 101); n.noteSinrep(n.CAT.all[4], 100); });
      await settle(page);
      await page.click("#tab-bl"); await page.waitForTimeout(400);
      await page.screenshot({path: join(process.env.SHOTS, `bloqueadas-${w}.png`), fullPage: true});
      await page.locator("#blbox .blrow").first().locator("input[type=file]").setInputFiles({name: "uno.wav", mimeType: "audio/wav", buffer: wav(20)});
      await page.waitForSelector("#blbox .blsub");
      await page.screenshot({path: join(process.env.SHOTS, `bloqueadas-con-archivo-${w}.png`), fullPage: true});
      await page.locator("#blbox [data-blplay]").first().click();
      await page.waitForFunction(() => window.__npt.mode === "file" && !window.__npt.au.paused, null, {timeout: 10000});
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({path: join(process.env.SHOTS, `sonando-archivo-${w}.png`)});
      await settle(page); await ctx.close();
    }
  });
  await step("sin errores de página en toda la prueba", async () => { assert.deepEqual(pageErrors, []); });
} finally {
  await browser.close(); server.close();
}
const bad = results.filter(r => r.startsWith("MAL"));
console.log("\n" + results.join("\n") + "\n" + (bad.length ? bad.length + " fallaron" : "todas pasaron"));
process.exit(bad.length ? 1 : 0);
