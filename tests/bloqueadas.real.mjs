// Prueba REAL de «Bloqueadas» (no corre con npm test ni npm run e2e): la app completa en localhost con los emuladores de
// Firebase, pero con YouTube de verdad. Comprueba que una canción que YouTube bloquea aquí termina sonando con otra copia.
// Gasta cuota de la YouTube Data API (hasta ~400 unidades). Correr:
//   npx firebase emulators:exec --only firestore,auth --project demo-np "node tests/bloqueadas.real.mjs"
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url)), PORT = 5174, P = "demo-np";
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const ADMIN = {Authorization: "Bearer owner", "Content-Type": "application/json"};
const enc = v => v === null || v === undefined ? {nullValue: null} : Array.isArray(v) ? {arrayValue: {values: v.map(enc)}}
  : typeof v === "object" ? {mapValue: {fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))}}
  : typeof v === "number" ? (Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v}) : typeof v === "boolean" ? {booleanValue: v} : {stringValue: String(v)};
const put = (path, data) => fetch(`${FS}/${path}`, {method: "PATCH", headers: ADMIN, body: JSON.stringify({fields: enc(data).mapValue.fields})}).then(r => { if (!r.ok) throw new Error("put " + path + " " + r.status); });
const setRules = text => fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}:securityRules`, {method: "PUT", headers: ADMIN, body: JSON.stringify({rules: {files: [{content: text}]}})}).then(r => { if (!r.ok) throw new Error("reglas " + r.status); });
const wipe = () => fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/(default)/documents`, {method: "DELETE"});

const TYPES = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"};
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)){ res.writeHead(403).end(); return; }
  try { res.writeHead(200, {"Content-Type": TYPES[extname(f)] || "application/octet-stream", "Cache-Control": "no-store"}).end(await readFile(f)); }
  catch { res.writeHead(404).end(); }
}).listen(PORT);
const URL0 = `http://localhost:${PORT}/`;

// La canción de la captura: YouTube bloquea este video (y casi todas sus copias) fuera de su sitio
const BLOQ = {t: "El Conejito (feat. Jhoan & Oneil)", a: "Perreke, Jhoan, O'neil", k: "Perreke, Jhoan, O'neil - El Conejito (feat. Jhoan & Oneil)", y: "vPXwtklyO2w", pl: ["Rodar"]};
const RULES = readFileSync(join(ROOT, "firestore.rules"), "utf8").replace(/&& request\.auth\.token\.email\.lower\(\) in get\([^;]*;/, "&& request.auth.token.email in ['a@test.com', 'b@test.com'];");
const seed = async () => {
  await wipe(); await setRules(RULES);
  await put("catalog/main", {all: [BLOQ], pls: ["Rodar"], rep: [], sinrep: [{k: BLOQ.k, t: BLOQ.t, a: BLOQ.a, y: BLOQ.y, f: "2026-11-20", c: 150}]});
  await put("playlists/p1", {name: "Rodar", orden: 1, oculta: false, songs: [BLOQ]});
};
const LOCAL = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).flatMap(d => [join(d, "Google", "Chrome", "Application", "chrome.exe"), join(d, "Microsoft", "Edge", "Application", "msedge.exe")]);
const exe = process.env.CHROMIUM || LOCAL.find(f => existsSync(f));
const browser = await chromium.launch({executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required"]});
const OUT = process.env.SHOTS || join(ROOT, "test-results"); mkdirSync(OUT, {recursive: true});
let quota = 0;
async function open(){
  const ctx = await browser.newContext({viewport: {width: 1100, height: 900}});
  // La clave de YouTube solo acepta peticiones de la app publicada: se piden desde aquí con su dirección
  await ctx.route(/googleapis\.com\/youtube\//, async r => {
    quota += /\/search\?/.test(r.request().url()) ? 100 : 1;
    const res = await fetch(r.request().url(), {headers: {Referer: "https://sting3r987.github.io/reproductor/"}});
    await r.fulfill({status: res.status, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"}, body: await res.text()});
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.error("  error de página:", e.message));
  await page.goto(URL0 + "?emu&debug&as=a@test.com");
  await page.waitForFunction(() => window.__npt?.loaded && window.__npt.mis.length > 0 && window.__npt.CAT.all.length > 0, null, {timeout: 30000});
  return {ctx, page};
}
const state = page => page.evaluate(() => ({y: window.__npt.CAT.all[0].y, bl: window.__npt.CAT.all[0].bl || 0, sinrep: (window.__npt.CAT.sinrep || []).length, playing: document.body.classList.contains("playing"), mode: window.__npt.mode, cnt: document.querySelector("#cbl").textContent}));
const tail = async page => (await page.evaluate(() => document.querySelector("#dbg")?.textContent || "")).split("\n").slice(0, 40).reverse().join("\n   ");
let fails = 0;
async function step(name, fn){ try { await fn(); console.log("ok   " + name); } catch (e) { fails++; console.error("MAL  " + name + ": " + e.message); } }

try {
  await step("1) Poner la canción bloqueada: la app busca otra copia y SUENA", async () => {
    await seed(); const {ctx, page} = await open();
    await page.evaluate(() => { const n = window.__npt; n.playFrom(0, [n.mis[0].songs[0]], "Rodar", null, true); });
    try { await page.waitForFunction(() => document.body.classList.contains("playing") && window.__npt.CAT.all[0].y !== "vPXwtklyO2w", null, {timeout: 60000}); }
    finally { console.log("   " + await tail(page)); }
    await page.waitForTimeout(4000); // unos segundos de música
    const s = await state(page), pos = await page.evaluate(() => document.querySelector("#seekrow")?.textContent.trim().replace(/\s+/g, " "));
    console.log("   estado:", JSON.stringify(s), "| barra:", pos);
    assert.equal(s.playing, true); assert.notEqual(s.y, "vPXwtklyO2w"); assert.equal(s.sinrep, 0, "debe salir de Bloqueadas");
    await page.screenshot({path: join(OUT, "bloqueada-1-suena.png")});
    await ctx.close();
  });
  await step("2) Botón «Buscar copias que sí suenen (todas)» en Bloqueadas, y luego suena", async () => {
    await seed(); const {ctx, page} = await open();
    await page.click("#tab-bl"); await page.waitForSelector("#blretry");
    await page.screenshot({path: join(OUT, "bloqueada-2-antes.png")});
    await page.click("#blretry");
    try { await page.waitForFunction(() => (window.__npt.CAT.sinrep || []).length === 0 && window.__npt.CAT.all[0].y !== "vPXwtklyO2w", null, {timeout: 60000}); }
    finally { console.log("   " + await tail(page)); }
    const s = await state(page); console.log("   tras el botón:", JSON.stringify(s));
    await page.screenshot({path: join(OUT, "bloqueada-2-despues.png")});
    await page.evaluate(() => { const n = window.__npt; n.playFrom(0, [n.CAT.all[0]], "Todas", null, true); });
    await page.waitForFunction(() => document.body.classList.contains("playing"), null, {timeout: 40000});
    await page.waitForTimeout(3000);
    assert.equal((await state(page)).playing, true);
    await page.screenshot({path: join(OUT, "bloqueada-2-suena.png")});
    await ctx.close();
  });
} finally { await browser.close(); server.close(); }
console.log("cuota gastada: ~" + quota + " unidades");
if (fails){ console.error(fails + " fallo(s)"); process.exit(1); }
console.log("todo bien");
