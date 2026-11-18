// Revisión rápida sin instalar nada: sintaxis de los scripts de index.html, sw.js y lib.js, y que todo lo que index.html
// importa de lib.js exista. Correr: npm run check
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lib from "../lib.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "np-check-"));
let fails = 0;
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
scripts.forEach(([, attrs, code], i) => {
  const f = join(dir, `script${i}.${/type="module"/.test(attrs) ? "mjs" : "cjs"}`);
  writeFileSync(f, code);
  try { execFileSync(process.execPath, ["--check", f], {stdio: "pipe"}); console.log("ok  script " + i); }
  catch (e) { fails++; console.error("MAL script " + i + "\n" + e.stderr); }
});
for (const f of ["sw.js", "lib.js"]){
  try { execFileSync(process.execPath, ["--check", new URL("../" + f, import.meta.url).pathname], {stdio: "pipe"}); console.log("ok  " + f); }
  catch (e) { fails++; console.error("MAL " + f + "\n" + e.stderr); }
}
const imp = /import\s*\{([^}]*)\}\s*from\s*"\.\/lib\.js[^"]*"/.exec(html);
if (!imp){ fails++; console.error("MAL: index.html no importa lib.js"); }
else for (const n of imp[1].split(",").map(s => s.trim()).filter(Boolean)) if (!(n in lib)){ fails++; console.error("MAL: lib.js no exporta " + n); }
// Las versiones que guarda sw.js deben ser las que pide la página (si no, sin conexión no abre)
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
for (const m of html.matchAll(/(?:src|from)\s*=?\s*"(\.\/)?((?:lib|config)\.js\?v=\d+)"/g)) if (!sw.includes('"' + m[2] + '"')){ fails++; console.error("MAL: sw.js no guarda " + m[2]); }
const fbv = /firebasejs\/([\d.]+)\//.exec(html)?.[1];
if (!sw.includes("firebasejs/" + fbv + "/")){ fails++; console.error("MAL: sw.js no guarda Firebase " + fbv); }
if (fails){ console.error(fails + " problema(s)"); process.exit(1); }
console.log("todo bien");
