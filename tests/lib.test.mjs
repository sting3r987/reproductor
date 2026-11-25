// Pruebas de las funciones puras (lib.js). Correr: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../lib.js";

test("parseId reconoce enlaces de YouTube", () => {
  assert.equal(L.parseId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "dQw4w9WgXcQ");
  assert.equal(L.parseId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(L.parseId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(L.parseId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(L.parseId("hola mundo"), null);
});

test("scParse acepta canciones y rechaza listas", () => {
  assert.equal(L.scParse("https://soundcloud.com/Artista/Cancion?si=1"), "https://soundcloud.com/artista/cancion");
  assert.equal(L.scParse("soundcloud.com/a/b/s-XyZ"), "https://soundcloud.com/a/b/s-XyZ");
  assert.equal(L.scParse("https://soundcloud.com/a/sets/lista"), null);
  assert.equal(L.scParse("https://on.soundcloud.com/abc123"), "https://on.soundcloud.com/abc123");
  assert.equal(L.scKey("https://soundcloud.com/a/b"), "sc:soundcloud.com/a/b");
});

test("norm, clean y claves de título y artista", () => {
  assert.equal(L.norm("Canción ÁÉ"), "cancion ae");
  assert.equal(L.clean("Marc Anthony - Vivir Mi Vida (Official Video).mp3"), "marc anthony vivir mi vida");
  assert.equal(L.titleKey({t: "Vivir Mi Vida (Remix)"}), "vivir mi vida");
  assert.equal(L.artistKey({a: "Daddy Yankee, Don Omar"}), "daddy yankee");
  assert.equal(L.esc('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
});

test("guess y fmt", () => {
  assert.deepEqual(L.guess("Marc Anthony - Vivir mi vida.mp3"), {a: "Marc Anthony", t: "Vivir mi vida"});
  assert.equal(L.guess("cancion_suelta.mp3").a, "Archivo de audio");
  assert.equal(L.fmt(125.9), "2:05");
  assert.equal(L.fmt(-3), "0:00");
});

test("ytKind y musicRank", () => {
  assert.equal(L.ytKind({t: "Tema (Video Oficial)", a: "Artista"}), "video");
  assert.equal(L.ytKind({t: "Tema", a: "Artista - Topic"}), "audio");
  assert.equal(L.musicRank({t: "Entrevista con el artista", a: "Canal"}), -1);
  assert.ok(L.musicRank({t: "Artista - Tema (Official Audio)", a: "ArtistaVEVO"}) >= 3);
  assert.deepEqual(L.onlyMusic([{t: "reaccion a tema", a: "x"}, {t: "A - B", a: "y"}]).map(x => x.t), ["A - B"]);
});

test("searchVariants y autoQueries", () => {
  assert.deepEqual(L.searchVariants("el cantante de la noche"), ["el cantante de la noche", "cantante noche"]);
  assert.equal(L.searchVariants("q", {t: "La Noche", a: "Joe Arroyo, Otro"})[1], "Joe Arroyo Noche");
  assert.deepEqual(L.autoQueries({t: "Ángel", a: "Elefante"}), ["Elefante Ángel", "Elefante Ángel audio", "Elefante Ángel letra"]);
});

test("isoSecs y autoMatch", () => {
  assert.equal(L.isoSecs("PT1H2M3S"), 3723);
  assert.equal(L.isoSecs("PT4M"), 240);
  const x = {t: "Ángel", a: "Elefante"};
  assert.equal(L.autoMatch(x, {t: "Elefante - Ángel (Letra)", a: "7clouds"}, 290, 280), true);
  assert.equal(L.autoMatch(x, {t: "Elefante - Ángel (Cover)", a: "x"}, 290, 280), false, "cover que la canción no es");
  assert.equal(L.autoMatch(x, {t: "Elefante - Ángel", a: "x"}, 600, 280), false, "dura mucho más");
  assert.equal(L.autoMatch(x, {t: "Otra canción", a: "x"}, 280, 280), false, "otro título");
});

test("setWhere pone y quita campos por clave", () => {
  const l = [{k: "a", y: "1", e: "dudoso"}, {k: "b"}];
  assert.equal(L.setWhere(l, "a", {y: "2", e: null}), true);
  assert.deepEqual(l[0], {k: "a", y: "2"});
  assert.equal(L.setWhere(l, "zz", {y: "3"}), false);
});

test("plToggle no duplica ni falla si ya no está", () => {
  const s = [{k: "a"}];
  assert.equal(L.plToggle(s, {k: "b"}, true), true);
  assert.equal(L.plToggle(s, {k: "b"}, true), false, "ya estaba");
  assert.equal(L.plToggle(s, {k: "a"}, false), true);
  assert.equal(L.plToggle(s, {k: "a"}, false), false, "ya la quitó el otro");
  assert.deepEqual(s.map(x => x.k), ["b"]);
});

test("plAdd y plRemove", () => {
  const s = [{k: "a"}, {k: "b"}];
  assert.equal(L.plAdd(s, [{k: "b"}, {k: "c"}, {k: "c"}]), 1);
  assert.equal(L.plRemove(s, ["a", "zz"]), 1);
  assert.deepEqual(s.map(x => x.k), ["b", "c"]);
});

test("plMove mueve por clave aunque la lista haya cambiado", () => {
  const s = [{k: "a"}, {k: "b"}, {k: "c"}];
  assert.equal(L.plMove(s, "c", 0), true);
  assert.deepEqual(s.map(x => x.k), ["c", "a", "b"]);
  assert.equal(L.plMove(s, "zz", 0), false);
  L.plMove(s, "c", 99);
  assert.deepEqual(s.map(x => x.k), ["a", "b", "c"]);
});

test("cambios de los dos a la vez no se pisan", () => {
  // Servidor con la playlist [a]. A agrega b y B agrega c, cada uno desde su copia: la transacción vuelve a aplicar
  // cada cambio sobre lo último del servidor, así que quedan las dos.
  const server = [{k: "a"}];
  L.plToggle(server, {k: "b"}, true); // cambio de A
  L.plToggle(server, {k: "c"}, true); // cambio de B, sobre lo que ya guardó A
  assert.deepEqual(server.map(x => x.k), ["a", "b", "c"]);
});

test("addIfMissing", () => {
  const l = [{k: "a"}];
  assert.equal(L.addIfMissing(l, {k: "a"}), false);
  assert.equal(L.addIfMissing(l, {k: "b"}), true);
});

test("copias: dayId y oldCopies", () => {
  assert.equal(L.dayId(new Date(2026, 0, 5)), "2026-01-05");
  const ids = ["2026-01-01", "2026-01-03", "_indice", "2026-01-02", "antes-de-restaurar"];
  assert.deepEqual(L.oldCopies(ids, 2), ["2026-01-01"]);
  assert.deepEqual(L.oldCopies(ids, 14), []);
});

test("autoLoad/autoDump recuerdan 7 días y luego olvidan", () => {
  const now = 1e12;
  const m = new Map([["k1", {ids: ["x"], q: 3, tries: 3, used: ["x"], ref: 200, t: now}]]);
  const raw = L.autoDump(m, now);
  assert.equal(L.autoLoad(raw, now + 86400e3).get("k1").tries, 3);
  assert.equal(L.autoLoad(raw, now + 8 * 86400e3).has("k1"), false);
  assert.equal(L.autoLoad("no es json", now).size, 0);
});

test("Sin reproducir: agregar sin duplicados y quitar", () => {
  const l = [];
  assert.equal(L.blkAdd(l, {k: "a", t: "Uno", a: "X", f: "2026-11-20", c: 150}), true);
  assert.equal(L.blkAdd(l, {k: "a", t: "Uno", a: "X", f: "2026-11-21", c: 150}), false, "la misma canción no se repite");
  assert.equal(L.blkAdd(l, {k: "a", t: "Uno", a: "X", f: "2026-11-21", c: 100}), true, "cambia el motivo");
  assert.deepEqual(l, [{k: "a", t: "Uno", a: "X", f: "2026-11-20", c: 100}], "se queda la primera fecha");
  L.blkAdd(l, {k: "b", t: "Dos", a: "Y", f: "2026-11-20", c: 101});
  assert.equal(L.blkDrop(l, "a"), true); assert.equal(L.blkDrop(l, "a"), false);
  assert.deepEqual(l.map(s => s.k), ["b"]);
});

test("Sin reproducir: motivo, búsqueda web y archivos de audio", () => {
  assert.match(L.blkWhy(150), /fuera de su sitio/); assert.match(L.blkWhy(100), /no está disponible/); assert.match(L.blkWhy(5), /error 5/);
  assert.equal(L.blkSearch({t: "Vivir mi vida", a: "Marc Anthony, Otro"}), "https://www.google.com/search?q=Vivir%20mi%20vida%20Marc%20Anthony");
  for (const n of ["a.mp3", "a.M4A", "a.aac", "a.ogg", "a.wav", "a.opus", "a.webm"]) assert.equal(L.isAudioFile({name: n, type: ""}), true, n);
  assert.equal(L.isAudioFile({name: "x", type: "audio/mpeg"}), true);
  assert.equal(L.isAudioFile({name: "foto.jpg", type: "image/jpeg"}), false);
  assert.equal(L.isAudioFile({name: "clip.mp4", type: "video/mp4"}), false);
});

test("plRestore devuelve las quitadas a su puesto, sin repetir", () => {
  const mk = k => ({k, t: k, a: "x"});
  const l = [mk("a"), mk("b"), mk("c"), mk("d"), mk("e")];
  const quitadas = [{it: l[1], i: 1}, {it: l[3], i: 3}];
  L.plRemove(l, ["b", "d"]);
  assert.deepEqual(l.map(s => s.k), ["a", "c", "e"]);
  assert.equal(L.plRestore(l, quitadas), 2);
  assert.deepEqual(l.map(s => s.k), ["a", "b", "c", "d", "e"]);
  assert.equal(L.plRestore(l, quitadas), 0, "ya están: no se repiten");
  const m = [mk("a")]; // la lista cambió: queda lo más cerca posible
  assert.equal(L.plRestore(m, [{it: mk("z"), i: 9}, {it: mk("y"), i: -2}]), 2);
  assert.deepEqual(m.map(s => s.k), ["y", "a", "z"]);
});

test("failDecision: sigue hasta 5 fallos seguidos o el tamaño de la cola; sin conexión para", () => {
  const d = o => L.failDecision({fails: 1, size: 20, online: true, nextLocal: false, ...o});
  assert.equal(d({}).stop, false);
  assert.equal(d({fails: 4}).stop, false);
  assert.deepEqual(d({fails: 5}), {stop: true, why: "fails"});
  assert.equal(d({fails: 3, size: 3}).stop, true, "cola de 3: para a los 3");
  assert.equal(d({fails: 1, size: 1}).stop, true);
  assert.deepEqual(d({online: false}), {stop: true, why: "offline"});
  assert.equal(d({online: false, nextLocal: true}).stop, false, "sin señal pero la siguiente tiene archivo");
});
