/* Funciones puras del reproductor (sin pantalla ni Firebase): las usa index.html y las prueban los tests (npm test). */

export const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);

export function ytKind(x){
  const t = norm(x.t), c = norm(x.a);
  if (/\b(video oficial|official video|official music video|videoclip|video clip|clip oficial|official hd video)\b/.test(t) || /vevo/.test(c)) return "video";
  if (/ - topic$/.test(c) || /\b(audio|lyrics?|letras?|visualizer)\b/.test(t)) return "audio";
  return null;
}

export const clean = s => norm(String(s || "")).replace(/\.[a-z0-9]{2,4}$/, "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
  .replace(/\b(official|oficial|video|videoclip|audio|lyrics?|letra|hd|hq|remaster(ed)?|ft|feat)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

export function guess(name){ // "Artista - Título.mp3"
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " "), parts = base.split(/\s+[-–—]\s+/);
  return parts.length > 1 ? {a: parts[0].trim(), t: parts.slice(1).join(" - ").trim()} : {a: "Archivo de audio", t: base.trim()};
}

export function scParse(t){
  t = String(t || "").trim();
  const sh = t.match(/^https?:\/\/on\.soundcloud\.com\/[\w-]+/i); if (sh) return sh[0]; // enlace corto de la app: lo resuelve el oEmbed
  const m = t.match(/^(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/([\w-]+)\/([\w-]+)(?:\/(s-[\w-]+))?/i);
  if (!m || /^(sets|likes|tracks|albums|reposts|popular-tracks|followers|following|discover|search|you|stream)$/i.test(m[2])) return null;
  return "https://soundcloud.com/" + m[1].toLowerCase() + "/" + m[2].toLowerCase() + (m[3] ? "/" + m[3] : "");
}
export const scKey = u => "sc:" + u.replace(/^https?:\/\/(www\.)?/, "");

export const artistKey = x => clean(String(x.a || "").split(",")[0]);
export const titleKey = x => clean(x.t).replace(/\b(remix|version|edit|mix|en vivo|live|acustic[oa]|acoustic|unplugged|extended|radio|club|instrumental|karaoke|cover|slowed|sped up)\b/g, " ").replace(/\s+/g, " ").trim();

export const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

export function parseId(s){
  s = s.trim();
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : (/^[\w-]{11}$/.test(s) ? s : null);
}

export function searchVariants(q, x){
  const out = [q], STOP = /^(el|la|los|las|un|una|de|del|en|y|a|the|of|and|feat|ft)$/i;
  if (x){ const a = x.a.split(",")[0].trim(), tw = x.t.split(/\s+/).filter(w => w && !STOP.test(w)); out.push(a + " " + tw.join(" "), a + " " + tw.slice(0, 1).join(" "), a); }
  else { const w = q.split(/\s+/).filter(Boolean), sig = w.filter(t => !STOP.test(t) && t.length > 2); out.push(sig.join(" ")); for (let n = sig.length - 1; n >= 2; n--) out.push(sig.slice(0, n).join(" ")); }
  return [...new Set(out.map(s => s.trim()).filter(Boolean))].slice(0, 4);
}

export const NOT_SONG = /\b(entrevist\w*|interview|habla|hablan|hablando|opina[rs]?|revela|confiesa|responde|explica|cuenta sobre|reacci\w*|react\w*|podcast|noticia|tutorial|how to|como (tocar|cantar|hacer)|trailer|capitulo|episodio|vlog|q ?& ?a|detras de|behind the|documental|biograf\w*|top ?\d|ranking|shorts?|tiktok|polemica|escandalo|chisme|curiosidades|analisis|review|resena|clase|leccion|karaoke|speaking|funny|mejores momentos|compilation|recopilacion|mix \d|\d+ (canciones|exitos|horas))\b/;
export function musicRank(x){
  const t = norm(x.t), c = norm(x.a);
  if (NOT_SONG.test(t.replace(/#/g, " "))) return -1;
  let s = 0;
  if (/- topic$|vevo|official|oficial|records|music/.test(c)) s += 2;
  if (/\b(official|oficial|audio|lyric|letra|videoclip|remix|ft|feat|live|en vivo|acustic|acoustic|cover|version)\b|video oficial|official video/.test(t)) s += 1;
  if (/ - /.test(x.t)) s += 1;
  return s;
}
export const onlyMusic = list => list.map((x, i) => [musicRank(x), i, x]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, , x]) => x);

export const AUTO_SKIP = /\b(cover|karaoke|en vivo|live|remix|instrumental|8d|slowed|sped up|reverb|nightcore|tutorial|reaccion|reaction|mashup|medley|bass boosted)\b/;
export function autoQueries(x){
  const a1 = x.a.split(",")[0].trim(), base = norm(x.t).includes(norm(a1)) ? x.t : a1 + " " + x.t;
  return [base, base + " audio", base + " letra"];
}
export const isoSecs = v => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(v || "") || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };
// ¿El resultado `c` es la misma canción que `x`? Título que contenga el de la canción, sin versiones raras (cover, en vivo…)
// que la canción no tenga, y duración parecida a la del video bloqueado (si se conoce; un videoclip suele durar algo más)
export function autoMatch(x, c, secs, ref){
  const want = titleKey(x), ct = clean(c.t) + " " + clean(c.a), own = clean(x.t);
  if (want.length >= 2 && !(" " + ct + " ").includes(" " + want + " ")) return false;
  const skip = AUTO_SKIP.exec(norm(c.t)); if (skip && !own.includes(skip[1])) return false;
  if (musicRank(c) < 0) return false;
  if (secs && (secs < 60 || secs > 720)) return false;
  if (secs && ref) return secs >= ref - Math.max(45, ref * 0.25) && secs <= ref + Math.max(30, ref * 0.15);
  return true;
}
/* ---------- Cambios en listas guardadas (catálogo y playlists) ----------
   Se aplican dos veces: aquí, al momento, y otra vez en una transacción sobre lo último que hay en el servidor.
   Por eso trabajan por clave de canción (k) y no por posición, y devuelven false si no hay nada que cambiar
   (así no se escribe en vano ni se pisa lo que guardó la otra persona). */

// Pone (valor) o quita (null) campos en las canciones con clave k
export function setWhere(list, k, fields){
  let n = 0;
  for (const it of list) if (it.k === k){
    n++;
    for (const [f, v] of Object.entries(fields)){ if (v === null || v === undefined) delete it[f]; else it[f] = v; }
  }
  return n > 0;
}
// Agrega (add) o quita la canción `it` de la playlist
export function plToggle(songs, it, add){
  const i = songs.findIndex(s => s.k === it.k);
  if (add){ if (i >= 0) return false; songs.push({...it}); return true; }
  if (i < 0) return false;
  songs.splice(i, 1); return true;
}
// Agrega las canciones que falten; devuelve cuántas entraron (0 = nada que guardar)
export function plAdd(songs, items){
  const have = new Set(songs.map(s => s.k)); let n = 0;
  for (const it of items) if (!have.has(it.k)){ have.add(it.k); songs.push({...it}); n++; }
  return n;
}
// Quita las canciones cuyas claves estén en `keys`; devuelve cuántas salieron
export function plRemove(songs, keys){
  const out = keys instanceof Set ? keys : new Set(keys); let n = 0;
  for (let i = songs.length - 1; i >= 0; i--) if (out.has(songs[i].k)){ songs.splice(i, 1); n++; }
  return n;
}
// Mueve la canción con clave k al puesto `to` (si alguien cambió la lista entre medias, queda lo más cerca posible)
export function plMove(songs, k, to){
  const i = songs.findIndex(s => s.k === k); if (i < 0) return false;
  const [s] = songs.splice(i, 1);
  const j = Math.max(0, Math.min(songs.length, to));
  songs.splice(j, 0, s);
  return i !== j;
}
// Agrega la canción si su clave no está en la lista
export function addIfMissing(list, it){
  if (list.some(s => s.k === it.k)) return false;
  list.push({...it}); return true;
}

/* ---------- Copias de seguridad ---------- */
// Fecha local AAAA-MM-DD (id de la copia del día)
export const dayId = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
// De una lista de ids AAAA-MM-DD, cuáles sobran si se guardan solo las `keep` más recientes
export function oldCopies(ids, keep){
  return ids.filter(id => /^\d{4}-\d{2}-\d{2}$/.test(id)).sort().reverse().slice(keep);
}

/* ---------- Búsqueda automática de copias (cuota de YouTube) ---------- */
// Lo guardado por canción (búsquedas hechas, copias probadas) vale 7 días: después se puede volver a buscar
export const AUTO_TTL = 7 * 86400e3;
export function autoLoad(raw, now = Date.now()){
  const m = new Map();
  let d = {}; try { d = JSON.parse(raw || "{}") || {}; } catch {}
  for (const [k, a] of Object.entries(d)) if (a && now - (a.t || 0) < AUTO_TTL) m.set(k, {ids: a.ids || [], q: a.q || 0, tries: a.tries || 0, used: a.used || [], ref: a.ref ?? null, t: a.t});
  return m;
}
export function autoDump(map, now = Date.now()){
  const o = {};
  for (const [k, a] of map) if (now - (a.t || now) < AUTO_TTL) o[k] = {ids: a.ids.slice(0, 30), q: a.q, tries: a.tries, used: a.used.slice(-10), ref: a.ref, t: a.t || now};
  return JSON.stringify(o);
}

/* ---------- Sin reproducir: YouTube no la deja poner aquí y no hubo otra copia que sirviera ---------- */
// Agrega la canción a la lista (sin duplicados, por clave). Si ya estaba, solo cambia el motivo; la fecha es la primera vez.
export function blkAdd(list, it){
  const i = list.findIndex(s => s.k === it.k);
  if (i < 0){ list.push({...it}); return true; }
  if (list[i].c === it.c) return false;
  list[i] = {...list[i], c: it.c}; return true;
}
// Saca la canción de la lista (ya tiene archivo, enlace o video que funciona)
export function blkDrop(list, k){
  const i = list.findIndex(s => s.k === k); if (i < 0) return false;
  list.splice(i, 1); return true;
}
// Motivo en palabras según el código de error de YouTube
export const blkWhy = c => c === 100 ? "YouTube dice que no está disponible" : c === 101 || c === 150 ? "YouTube no deja ponerla fuera de su sitio" : c ? "YouTube no la pudo poner (error " + c + ")" : "YouTube no la pudo poner";
// Búsqueda web de la canción (título y primer artista), para abrir en otra pestaña
export function blkSearch(it){
  const a = String(it.a || "").split(",")[0].trim();
  return "https://www.google.com/search?q=" + encodeURIComponent((it.t + (a ? " " + a : "")).trim());
}
// ¿Es un archivo de audio que se puede poner a una canción? (por tipo o por extensión)
export const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
export const isAudioFile = f => !!f && (String(f.type || "").startsWith("audio/") || (f.type === "video/webm" && /\.webm$/i.test(f.name || "")) || AUDIO_EXT.test(f.name || ""));

/* ---------- Deshacer al quitar de una playlist ---------- */
// Vuelve a poner canciones quitadas: items = [{it, i}] (la canción y el puesto que tenía). Las que ya estén (por clave) no se repiten.
// Va de menor a mayor puesto, así cada una queda donde estaba; si la lista cambió, queda lo más cerca posible. Devuelve cuántas volvieron.
export function plRestore(songs, items){
  let n = 0;
  for (const {it, i} of [...items].sort((a, b) => a.i - b.i)){
    if (songs.some(s => s.k === it.k)) continue;
    songs.splice(Math.max(0, Math.min(songs.length, i)), 0, {...it}); n++;
  }
  return n;
}

/* ---------- Tope de saltos seguidos por error ---------- */
export const MAX_FALLOS = 5;
// Tras un fallo (`fails` ya cuenta este): ¿seguir con la siguiente o parar? nextLocal: la siguiente suena desde un archivo del aparato.
export function failDecision({fails, size, online, nextLocal}){
  if (!online && !nextLocal) return {stop: true, why: "offline"};
  if (fails >= Math.min(MAX_FALLOS, Math.max(1, size))) return {stop: true, why: "fails"};
  return {stop: false, why: null};
}

/* ---------- Buscar dentro de una playlist ---------- */
// Canciones cuyo título o artista contienen q (q ya sin mayúsculas ni tildes, como lo da norm()); sin q devuelve todas
export function plFilter(songs, q){
  return q ? songs.filter(x => norm(x.t + " " + x.a).includes(q)) : songs;
}

/* ---------- Reproducir después ---------- */
// Cola = `order` (índices de canciones) y `at` (posición de la que suena). Deja `idx` justo después de la actual:
// si ya estaba en la cola la mueve (ajustando `at` si salía de antes), si no la inserta. Devuelve {order, at, moved}; no cambia lo que recibe.
export function queueNext(order, at, idx){
  const o = order.slice(); let a = at;
  const p = o.indexOf(idx);
  if (p === a) return {order: o, at: a, moved: false}; // es la que suena
  if (p === a + 1) return {order: o, at: a, moved: false}; // ya es la siguiente
  if (p >= 0){ o.splice(p, 1); if (p < a) a--; }
  o.splice(a + 1, 0, idx);
  return {order: o, at: a, moved: true};
}

/* ---------- Dormir (temporizador) ---------- */
// Estado: null (apagado), {until: ms} (a una hora) o {song: true} (al terminar la canción que suena)
export function sleepSet(kind, now){
  if (kind === "song") return {song: true};
  const m = +kind; return m > 0 ? {until: now + m * 60000} : null; // "off" u otra cosa: apagado
}
// ¿Ya venció? Por hora, o porque terminó una canción cuando se pidió «al terminar esta canción»
export function sleepDue(s, now, songEnded = false){
  if (!s) return false;
  if (s.until != null && now >= s.until) return true;
  return !!(s.song && songEnded);
}
// Minutos que faltan, redondeados hacia arriba (0 si no hay hora)
export const sleepLeft = (s, now) => s && s.until != null ? Math.max(0, Math.ceil((s.until - now) / 60000)) : 0;
