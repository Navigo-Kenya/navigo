// scripts/icon-gallery.ts
//
// Renders every Navigo icon into one HTML page for design review:
//   - UI icons (components/icons/glyphs.ts): outline + filled, light + dark
//   - stop-type, POI-category and report badges (the PNGs the map uses)
// Usage: node scripts/icon-gallery.ts <out.html>     (Node 23.6+ runs TS)
import fs from "node:fs";
import path from "node:path";
import { GLYPHS, type Glyph } from "../components/icons/glyphs.ts";

const out = process.argv[2] ?? "icon-gallery.html";
const root = path.resolve(import.meta.dirname, "..");
const STROKE = 1.9;

function svg(g: Glyph, color: string, outline: boolean, size = 28): string {
  const solid = !outline && g.filled === "solid";
  // One stroke attribute per element: in HTML a repeated attribute keeps the FIRST value.
  const caps = `stroke-linecap="round" stroke-linejoin="round"`;
  const st = (strokeColor = color, w = STROKE) => `stroke="${strokeColor}" stroke-width="${w}" ${caps}`;
  const parts = g.parts
    .map((p) => {
      const w = p.w ?? STROKE;
      if (p.k === "line") return `<path d="${p.d}" fill="none" ${st(color, w)} stroke-opacity="${p.o ?? 1}"/>`;
      if (p.k === "solid") return `<path d="${p.d}" fill="${color}"/>`;
      if (p.k === "knock")
        return `<path d="${p.d}" fill="none" ${st(solid ? "#FFFFFF" : color, w)}/>`;
      if (solid) return `<path d="${p.d}" fill="${color}" ${st()}/>`;
      return `<path d="${p.d}" fill="${outline ? "none" : color}" fill-opacity="${outline ? 0 : 0.18}" ${st()}/>`;
    })
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${parts}</svg>`;
}

const SECTIONS: [string, string[]][] = [
  ["Navigation & controls", ["close", "close-circle", "chevron-back", "chevron-forward", "chevron-up", "chevron-down", "arrow-back", "arrow-forward", "arrow-up", "arrow-down", "checkmark", "checkmark-circle", "add", "remove", "search", "options", "refresh", "swap-vertical", "swap-horizontal", "ellipsis-horizontal", "ellipsis-vertical", "list", "open", "copy", "download", "log-out"]],
  ["Actions", ["bookmark", "share", "create", "trash", "star", "star-half", "heart", "camera", "images", "videocam-off", "mic", "megaphone", "call", "mail"]],
  ["Status & info", ["information-circle", "alert-circle", "warning", "lock-closed", "notifications", "settings", "trophy", "sparkles", "shield-checkmark", "happy", "hourglass", "radio-button-on", "radio-button-off", "chatbubbles", "document-text", "folder", "cloud-download", "cloud-offline", "play", "play-skip-back", "square", "globe", "pricetag", "person", "body", "accessibility"]],
  ["Map, places & travel", ["location", "locate", "navigate", "navigate-circle", "map", "compass", "time", "home", "business", "trail-sign", "bus", "train", "walk", "bicycle", "car"]],
];

const drawn = new Set(SECTIONS.flatMap(([, n]) => n));
const missing = Object.keys(GLYPHS).filter((k) => !drawn.has(k));
if (missing.length) SECTIONS.push(["Other", missing]);

function badgeImages(dir: string, prefix: string): string {
  const abs = path.join(root, "assets/images", dir);
  if (!fs.existsSync(abs)) return "";
  return fs
    .readdirSync(abs)
    .filter((f) => f.startsWith(prefix) && f.endsWith("@3x.png"))
    .sort()
    .map((f) => {
      const b64 = fs.readFileSync(path.join(abs, f)).toString("base64");
      const label = f.replace(prefix, "").replace("@3x.png", "");
      return `<figure class="badge"><img src="data:image/png;base64,${b64}" alt="${label}"/><figcaption>${label}</figcaption></figure>`;
    })
    .join("");
}

const cell = (name: string) => {
  const g = GLYPHS[name];
  return `<figure class="cell">
    <div class="pair light"><span>${svg(g, "#111827", true)}</span><span>${svg(g, "#111827", false)}</span></div>
    <div class="pair dark"><span>${svg(g, "#F4F4F5", true)}</span><span>${svg(g, "#FF6F00", false)}</span></div>
    <figcaption>${name}</figcaption></figure>`;
};

const html = `<title>Navigo Icons</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:#F7F7F5;--card:#FFFFFF;--text:#111827;--sub:#6B7280;--line:#E5E7EB;--accent:#FF6F00}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0F0F10;--card:#18181B;--text:#F4F4F5;--sub:#A1A1AA;--line:#27272A;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0F0F10;--card:#18181B;--text:#F4F4F5;--sub:#A1A1AA;--line:#27272A;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding-block:28px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}h1 b{color:var(--accent)}
.lead{color:var(--sub);margin:0 0 24px;max-width:70ch}
h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--sub);margin:32px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px}
.cell{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.pair{display:flex;justify-content:space-around;padding:12px 6px}.pair span{display:flex}
.light{background:#FFFFFF}.dark{background:#18181B}
figcaption{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--sub);padding:7px 10px;border-top:1px solid var(--line);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.legend{display:flex;gap:18px;flex-wrap:wrap;color:var(--sub);font-size:12.5px;margin-bottom:6px}
.badges{display:flex;flex-wrap:wrap;gap:10px}
.badge{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 8px 0;width:104px;text-align:center}
.badge img{width:44px;height:44px;object-fit:contain}.badge figcaption{border:0;padding:4px 0 8px}
</style><main>
<h1>Navigo <b>Icons</b></h1>
<p class="lead">Every icon the app uses. UI icons are drawn on a 24-unit grid with rounded 1.9 strokes, in the same language as the map badges below. Each card shows the <b>outline</b> and <b>filled</b> variants on light (top) and dark (bottom). Filled is duotone (18% tint), or solid for stars, pins, bookmarks and status circles.</p>
<div class="legend"><span>Top row: outline · filled</span><span>Bottom row: outline on dark · filled in brand orange</span><span>${Object.keys(GLYPHS).length} UI icons</span></div>
${SECTIONS.map(([title, names]) => `<h2>${title}</h2><div class="grid">${names.filter((n) => GLYPHS[n]).map(cell).join("")}</div>`).join("")}
<h2>Stop types (map badges)</h2><div class="badges">${badgeImages("stops", "stop-")}</div>
<h2>Places (POI badges)</h2><div class="badges">${badgeImages("pois", "poi-")}</div>
<h2>Community reports</h2><div class="badges">${badgeImages("reports", "")}</div>
</main>`;

fs.writeFileSync(out, html);
console.log(`wrote ${out} (${Object.keys(GLYPHS).length} UI icons)`);
