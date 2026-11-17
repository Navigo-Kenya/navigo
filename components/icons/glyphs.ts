// components/icons/glyphs.ts
//
// Navigo's UI icon set as plain data (no React), so the app (<Icon/>) and the
// design gallery (scripts/icon-gallery.ts) render exactly the same drawings.
//
// 24-unit grid, rounded caps and joins, 1.9 stroke: the same language as the
// map, report and category glyphs in NavigoIcons.tsx.
//
// Each glyph is a list of parts:
//   line   stroke only
//   shape  the main body: stroke only in the "-outline" variant; soft 18%
//          tint (duotone) or solid colour in the filled variant
//   solid  always filled with the icon colour (dots, wheels, play triangles)
//   knock  detail drawn ON a shape: icon colour in the outline variant, white
//          (knocked out) when the shape is solid
// `filled: "solid"` makes the filled variant a solid shape (stars, pins,
// bookmarks, status circles); otherwise it is duotone.

export type GlyphPart = { k: "line" | "shape" | "solid" | "knock"; d: string; w?: number; o?: number };
export type Glyph = { parts: GlyphPart[]; filled?: "duotone" | "solid" };

/** Circle as a path (keeps every part a single path). */
const c = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const L = (d: string, w?: number, o?: number): GlyphPart => ({ k: "line", d, w, o });
const S = (d: string): GlyphPart => ({ k: "shape", d });
const D = (d: string): GlyphPart => ({ k: "solid", d });
const K = (d: string, w?: number): GlyphPart => ({ k: "knock", d, w });

const STAR = "M12 3.6l2.55 5.2 5.7.83-4.13 4.02.98 5.68L12 16.65l-5.1 2.68.98-5.68L3.75 9.63l5.7-.83Z";
const PIN = "M12 21.2s-6.6-6.1-6.6-11.1a6.6 6.6 0 0 1 13.2 0c0 5-6.6 11.1-6.6 11.1Z";
const CLOUD = "M7.4 18.4a4 4 0 0 1-.55-7.96 5.6 5.6 0 0 1 10.8 1.35 3.3 3.3 0 0 1-.45 6.61Z";

export const GLYPHS: Record<string, Glyph> = {
  // ── Navigation & controls ──────────────────────────────────────────────
  close: { parts: [L("M6.6 6.6l10.8 10.8M17.4 6.6 6.6 17.4")] },
  "close-circle": { filled: "solid", parts: [S(c(12, 12, 9)), K("M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6")] },
  "chevron-forward": { parts: [L("M9.6 5.6 16 12l-6.4 6.4")] },
  "chevron-back": { parts: [L("M14.4 5.6 8 12l6.4 6.4")] },
  "chevron-down": { parts: [L("M5.6 9.6 12 16l6.4-6.4")] },
  "chevron-up": { parts: [L("M5.6 14.4 12 8l6.4 6.4")] },
  "arrow-back": { parts: [L("M19 12H5.6M11 6.6 5.6 12l5.4 5.4")] },
  "arrow-forward": { parts: [L("M5 12h13.4M13 6.6l5.4 5.4-5.4 5.4")] },
  "arrow-up": { parts: [L("M12 19V5.6M6.6 11 12 5.6l5.4 5.4")] },
  "arrow-down": { parts: [L("M12 5v13.4M6.6 13 12 18.4l5.4-5.4")] },
  checkmark: { parts: [L("M5 12.6l4.4 4.4L19 7.4")] },
  "checkmark-circle": { filled: "solid", parts: [S(c(12, 12, 9)), K("M8.1 12.3l2.7 2.7 5.1-5.4")] },
  add: { parts: [L("M12 5.2v13.6M5.2 12h13.6")] },
  remove: { parts: [L("M5.2 12h13.6")] },
  search: { parts: [S(c(10.6, 10.6, 6.2)), L("M15.3 15.3 20 20")] },
  "ellipsis-horizontal": { parts: [D(c(5.8, 12, 1.7)), D(c(12, 12, 1.7)), D(c(18.2, 12, 1.7))] },
  "ellipsis-vertical": { parts: [D(c(12, 5.8, 1.7)), D(c(12, 12, 1.7)), D(c(12, 18.2, 1.7))] },
  options: { parts: [L("M4 7h8.6M17.6 7H20M4 17h2.6M11.6 17H20"), S(c(15.1, 7, 2.4)), S(c(9.1, 17, 2.4))] },
  refresh: { parts: [L("M19.4 12a7.4 7.4 0 1 1-2.15-5.22"), L("M19.6 4.4v3.9h-3.9")] },
  "swap-vertical": { parts: [L("M8 19.4V4.6M4.6 8 8 4.6 11.4 8M16 4.6v14.8M12.6 16l3.4 3.4 3.4-3.4")] },
  "swap-horizontal": { parts: [L("M4.6 8h14.8M16 4.6 19.4 8 16 11.4M19.4 16H4.6M8 12.6 4.6 16 8 19.4")] },
  open: { parts: [L("M18.4 13.4V18a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 18V7.2A1.6 1.6 0 0 1 6 5.6h4.6"), L("M14.4 4.4h5.2v5.2M19.6 4.4l-8 8")] },
  copy: { parts: [S("M9.2 8.4h9a1.6 1.6 0 0 1 1.6 1.6v9a1.6 1.6 0 0 1-1.6 1.6h-9A1.6 1.6 0 0 1 7.6 19v-9a1.6 1.6 0 0 1 1.6-1.6Z"), L("M16.4 5.6V5A1.6 1.6 0 0 0 14.8 3.4H5.8A1.6 1.6 0 0 0 4.2 5v9a1.6 1.6 0 0 0 1.6 1.6h.4")] },
  list: { parts: [L("M9.2 6.6h10.6M9.2 12h10.6M9.2 17.4h10.6"), D(c(4.9, 6.6, 1.4)), D(c(4.9, 12, 1.4)), D(c(4.9, 17.4, 1.4))] },
  "log-out": { parts: [L("M13.6 4.4H7A1.6 1.6 0 0 0 5.4 6v12A1.6 1.6 0 0 0 7 19.6h6.6"), L("M10.6 12h9.4M16.6 8.4 20.2 12l-3.6 3.6")] },
  download: { parts: [L("M12 4.4v10.2M7.4 10.6 12 15.2l4.6-4.6M5 19.6h14")] },

  // ── Actions ─────────────────────────────────────────────────────────────
  trash: { parts: [S("M6.4 7.6l.95 11.1a1.8 1.8 0 0 0 1.8 1.6h5.7a1.8 1.8 0 0 0 1.8-1.6l.95-11.1Z"), L("M4.4 7.6h15.2M9.4 7.6V5.4c0-.5.4-.9.9-.9h3.4c.5 0 .9.4.9.9v2.2"), K("M10.3 11.2v5.4M13.7 11.2v5.4")] },
  create: { parts: [S("M15.5 4.7a2 2 0 0 1 2.85 0l.95.95a2 2 0 0 1 0 2.85L9.1 18.7l-4.4.6.6-4.4Z"), K("M13.6 6.6l3.8 3.8")] },
  share: { parts: [L("M8.7 10.8 15.3 7M8.7 13.2l6.6 3.8"), S(c(17.6, 5.8, 2.6)), S(c(6.4, 12, 2.6)), S(c(17.6, 18.2, 2.6))] },
  bookmark: { filled: "solid", parts: [S("M7.2 4.4h9.6a1.2 1.2 0 0 1 1.2 1.2v14.2l-6-3.9-6 3.9V5.6a1.2 1.2 0 0 1 1.2-1.2Z")] },
  star: { filled: "solid", parts: [S(STAR)] },
  "star-half": { parts: [L(STAR), D("M12 3.6 9.45 8.8l-5.7.83 4.13 4.02-.98 5.68L12 16.65Z")] },
  heart: { filled: "solid", parts: [S("M12 19.6s-7.6-4.5-7.6-10a4.3 4.3 0 0 1 7.6-2.8 4.3 4.3 0 0 1 7.6 2.8c0 5.5-7.6 10-7.6 10Z")] },
  camera: { parts: [S("M4 8.6A1.6 1.6 0 0 1 5.6 7h2.3l1.45-2.1h5.3L16.1 7h2.3A1.6 1.6 0 0 1 20 8.6v9a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.6Z"), K(c(12, 12.9, 3.2))] },
  images: { parts: [S("M6 5.4h12A1.6 1.6 0 0 1 19.6 7v10a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 17V7A1.6 1.6 0 0 1 6 5.4Z"), K("M4.6 15.6l4.2-4 3.8 3.5 2.5-2.2 4.3 3.9"), D(c(15.4, 9.2, 1.4))] },
  "videocam-off": { parts: [S("M4 7.6h9.4A1.6 1.6 0 0 1 15 9.2v5.6a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 14.8Z"), L("M15 10.8l5-2.8v8l-5-2.8"), L("M3.4 3.4l17.2 17.2")] },
  mic: { parts: [S("M9.2 6.4a2.8 2.8 0 0 1 5.6 0v5.2a2.8 2.8 0 0 1-5.6 0Z"), L("M6.4 11.6a5.6 5.6 0 0 0 11.2 0M12 17.2v3.2")] },
  megaphone: { parts: [S("M4.4 10v4a1 1 0 0 0 1 1h2.6l8.4 4.6V4.4L8 9H5.4a1 1 0 0 0-1 1Z"), L("M8.4 15.2l1.2 4.4M19.6 9.6v4.8")] },
  call: { parts: [S("M6.8 4h2.6l1.4 3.9-1.9 1.3a10.4 10.4 0 0 0 5.9 5.9l1.3-1.9 3.9 1.4v2.6a1.8 1.8 0 0 1-1.9 1.8C11.1 18.5 5.5 12.9 5 5.9A1.8 1.8 0 0 1 6.8 4Z")] },
  mail: { parts: [S("M5 6h14a1.6 1.6 0 0 1 1.6 1.6v8.8A1.6 1.6 0 0 1 19 18H5a1.6 1.6 0 0 1-1.6-1.6V7.6A1.6 1.6 0 0 1 5 6Z"), K("M4 7.2l8 6 8-6")] },

  // ── Status & info ───────────────────────────────────────────────────────
  "information-circle": { parts: [S(c(12, 12, 9)), K("M12 11v5.4"), D(c(12, 7.9, 1.15))] },
  "alert-circle": { filled: "solid", parts: [S(c(12, 12, 9)), K("M12 7.4v5.4"), K("M12 16.4v.2", 2.4)] },
  warning: { filled: "solid", parts: [S("M10.45 4.7a1.8 1.8 0 0 1 3.1 0l7.05 12.4a1.8 1.8 0 0 1-1.55 2.7H4.95a1.8 1.8 0 0 1-1.55-2.7Z"), K("M12 9.6v4"), K("M12 16.8v.2", 2.4)] },
  "lock-closed": { parts: [S("M6.6 10.6h10.8a1.6 1.6 0 0 1 1.6 1.6v6.2a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 18.4v-6.2a1.6 1.6 0 0 1 1.6-1.6Z"), L("M8.6 10.6V8a3.4 3.4 0 0 1 6.8 0v2.6"), K("M12 14.2v2")] },
  notifications: { parts: [S("M6.4 16.6v-5.4a5.6 5.6 0 0 1 11.2 0v5.4l1.6 1.6H4.8Z"), L("M10 20.4a2.2 2.2 0 0 0 4 0")] },
  settings: { parts: [S("M12 3.4l7.45 4.3v8.6L12 20.6l-7.45-4.3V7.7Z"), K(c(12, 12, 2.9))] },
  trophy: { parts: [S("M7.6 4.4h8.8V9a4.4 4.4 0 0 1-8.8 0Z"), L("M7.6 6.4H4.6v1a3 3 0 0 0 3 3M16.4 6.4h3v1a3 3 0 0 1-3 3M12 13.4v3.6M8.6 19.6h6.8")] },
  sparkles: { parts: [S("M11.4 3.6l1.75 4.95 4.95 1.75-4.95 1.75-1.75 4.95-1.75-4.95L4.7 10.3l4.95-1.75Z"), D("M18.4 14.6l.75 1.85 1.85.75-1.85.75-.75 1.85-.75-1.85-1.85-.75 1.85-.75Z")] },
  "shield-checkmark": { parts: [S("M12 3.4l7 2.8v5.3c0 4.3-3 7.7-7 9.1-4-1.4-7-4.8-7-9.1V6.2Z"), K("M8.8 12.1l2.2 2.2 4.2-4.4")] },
  happy: { parts: [S(c(12, 12, 9)), K("M8.5 13.6a4 4 0 0 0 7 0"), D(c(9, 9.8, 1.15)), D(c(15, 9.8, 1.15))] },
  hourglass: { parts: [L("M6.4 3.6h11.2M6.4 20.4h11.2"), S("M8 3.6v2.9c0 1.9 4 4.1 4 5.5s-4 3.6-4 5.5v2.9h8v-2.9c0-1.9-4-4.1-4-5.5s4-3.6 4-5.5V3.6Z")] },
  "radio-button-on": { parts: [L(c(12, 12, 8.2)), D(c(12, 12, 4.2))] },
  "radio-button-off": { parts: [L(c(12, 12, 8.2))] },
  chatbubbles: { parts: [S("M4 6.6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V11a2 2 0 0 1-2 2H9.6L6 15.6V13a2 2 0 0 1-2-2Z"), L("M16 8.6h2a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2v2.6L14.4 17H11a2 2 0 0 1-2-1.6")] },
  "document-text": { parts: [S("M7 3.4h7l4.6 4.6v11A1.6 1.6 0 0 1 17 20.6H7A1.6 1.6 0 0 1 5.4 19V5A1.6 1.6 0 0 1 7 3.4Z"), L("M13.6 3.6v4.8h4.8"), K("M9 12.6h6M9 16h4")] },
  folder: { parts: [S("M3.4 7A1.6 1.6 0 0 1 5 5.4h4.2l1.8 2h8A1.6 1.6 0 0 1 20.6 9v8.4A1.6 1.6 0 0 1 19 19H5a1.6 1.6 0 0 1-1.6-1.6Z")] },
  "cloud-download": { parts: [S(CLOUD), L("M12 10.8v5.6M9.8 14.4l2.2 2.2 2.2-2.2")] },
  "cloud-offline": { parts: [S(CLOUD), L("M4 4l16 16")] },
  play: { parts: [D("M8 5.4v13.2L18.6 12Z")] },
  "play-skip-back": { parts: [D("M18 5.4v13.2L8.6 12Z"), L("M6.2 5.6v12.8")] },
  square: { parts: [D("M7 6.6h10A.4.4 0 0 1 17.4 7v10a.4.4 0 0 1-.4.4H7a.4.4 0 0 1-.4-.4V7A.4.4 0 0 1 7 6.6Z")] },
  globe: { parts: [S(c(12, 12, 8.6)), L("M3.6 12h16.8M12 3.4c2.4 2.3 3.6 5.2 3.6 8.6s-1.2 6.3-3.6 8.6c-2.4-2.3-3.6-5.2-3.6-8.6S9.6 5.7 12 3.4Z")] },
  pricetag: { parts: [S("M3.8 12.6V5.3c0-.8.7-1.5 1.5-1.5h7.3l7.6 7.6a1.5 1.5 0 0 1 0 2.1l-7.2 7.2a1.5 1.5 0 0 1-2.1 0Z"), D(c(8.3, 8.3, 1.45))] },
  person: { parts: [S(c(12, 8.1, 3.7)), S("M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6Z")] },
  body: { parts: [D(c(12, 4.8, 1.9)), L("M5.6 8.6l6.4 1.5 6.4-1.5M12 10.1v4.4l-3 5.8M12 14.5l3 5.8")] },
  accessibility: { parts: [D(c(12, 4.7, 1.9)), L("M5.4 8.6l6.6 1.4 6.6-1.4M12 10v4.2"), L("M8.8 20.2l3.2-6 3.2 6")] },

  // ── Map, places & travel ────────────────────────────────────────────────
  location: { filled: "solid", parts: [S(PIN), K(c(12, 10.1, 2.4))] },
  locate: { parts: [L(c(12, 12, 6.6)), D(c(12, 12, 2.3)), L("M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3")] },
  navigate: { filled: "solid", parts: [S("M19.6 4.4 4.4 11.1l6.85 1.65 1.65 6.85Z")] },
  "navigate-circle": { filled: "solid", parts: [S(c(12, 12, 9)), K("M16.2 7.8l-8.6 3.6 3.9 1.1 1.1 3.9Z")] },
  map: { parts: [S("M3.4 6.6l5.3-2.1 6.6 2.1 5.3-2.1v13l-5.3 2.1-6.6-2.1-5.3 2.1Z"), K("M8.7 4.6v12.8M15.3 6.6v12.8")] },
  compass: { parts: [S(c(12, 12, 8.8)), K("M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1Z")] },
  time: { parts: [S(c(12, 12, 8.8)), K("M12 7.4V12l3.1 2")] },
  home: { parts: [S("M4.4 10.6 12 4.4l7.6 6.2V19a1.6 1.6 0 0 1-1.6 1.6h-3.6v-5.6H9.6v5.6H6A1.6 1.6 0 0 1 4.4 19Z")] },
  business: { parts: [S("M5.4 20.6V5A1.6 1.6 0 0 1 7 3.4h7A1.6 1.6 0 0 1 15.6 5v15.6"), L("M15.6 9.4H18a1.6 1.6 0 0 1 1.6 1.6v9.6M3.4 20.6h17.2"), K("M9 7.6h3M9 11h3M9 14.4h3")] },
  "trail-sign": { parts: [L("M11.4 3.4v17.2M8.4 20.6h6"), S("M6 5.4h10.8L19.4 8l-2.6 2.6H6Z"), S("M16.8 12.8H11.4v3.6h5.4l2.4-1.8Z")] },
  bus: { parts: [S("M4.4 7.4A2 2 0 0 1 6.4 5.4h9.3c.66 0 1.28.33 1.66.88l2.45 3.6c.23.33.35.73.35 1.13v4.39a1 1 0 0 1-1 1H4.4Z"), K("M4.4 11h15.5M9 5.6V11M13.6 5.6V11"), D(c(8, 16.6, 1.9)), D(c(16.4, 16.6, 1.9))] },
  train: { parts: [S("M7 4.4h10a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.4a2 2 0 0 1 2-2Z"), K("M5 11h14"), D(c(8.6, 14, 1.05)), D(c(15.4, 14, 1.05)), L("M8.6 20.2l1.4-3.2M15.4 20.2 14 17")] },
  walk: { parts: [D(c(13.1, 4.6, 1.9)), L("M12.6 8.4 10.2 13l3 2.6 1 5M10.2 13l-2.6 7.6M12.6 8.4l3.4 3 2.6.6M12.6 8.4 9.1 10l-1.6 3")] },
  bicycle: { parts: [L(c(6, 16, 3.6)), L(c(18, 16, 3.6)), L("M6 16l4-7h6l2 7M10 9 8.6 6.4H7M16 9l-4 7")] },
  car: { parts: [S("M4.4 13.4l1.65-4.25A2 2 0 0 1 7.9 7.9h8.2a2 2 0 0 1 1.85 1.25l1.65 4.25V17a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1Z"), K("M4.6 13.4h14.8"), D(c(7.8, 15.6, 1.2)), D(c(16.2, 15.6, 1.2)), L("M6.4 18v1.6M17.6 18v1.6")] },
};

/** Ionicons-style names the app uses, mapped to a glyph and a variant. */
export function resolveGlyph(name: string): { glyph: Glyph; outline: boolean } | null {
  const outline = name.endsWith("-outline");
  const base = outline ? name.slice(0, -"-outline".length) : name;
  const glyph = GLYPHS[base] ?? GLYPHS[ALIASES[base] ?? ""];
  return glyph ? { glyph, outline } : null;
}

const ALIASES: Record<string, string> = {
  "search-circle": "search",
  "help-circle": "information-circle",
  "warning-sign": "warning",
  "ellipsis": "ellipsis-horizontal",
  "notifications-off": "notifications",
  "people": "person",
  "image": "images",
  "bus-stop": "bus",
  "subway": "train",
  "trending-up": "arrow-up",
};
