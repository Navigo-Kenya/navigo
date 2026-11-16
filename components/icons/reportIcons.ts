// components/icons/reportIcons.ts
//
// Single source of truth for map report types: label, description, colour and
// the 3D icon. Used by ReportSheet, ReportDetailCard and ReportLayer.
//
// Icons are built as SVG strings so the exact same artwork can be rendered in
// the app (react-native-svg's <SvgXml>) and pre-rendered into the map pin PNGs
// in assets/images/reports/. Keep this file free of React / path-alias imports
// and of TS-only runtime syntax (enums etc.): the PNG generator loads it
// directly with Node's built-in type stripping.
//
// Look ("soft clay"): an inflated, matte 3D shape in the type colour, lit from
// the top left (radial shading plus a soft highlight), with the symbol pressed
// into the surface: a pale tint of the colour with a darker inset shadow.

export type ReportType =
  | "traffic_jam"
  | "accident"
  | "road_blocked"
  | "stage_queue"
  | "police_check"
  | "flooded_route"
  | "breakdown"
  | "security"
  | "fare_hike";

export interface ReportTypeMeta {
  label: string;
  desc: string;
  color: string;
}

/** In display order: most common / most urgent first, fare hike last. */
export const REPORT_TYPES: Record<ReportType, ReportTypeMeta> = {
  traffic_jam:   { label: "Traffic Jam",  desc: "Heavy congestion",          color: "#F97316" },
  accident:      { label: "Accident",     desc: "Crash or collision",        color: "#EF4444" },
  road_blocked:  { label: "Road Blocked", desc: "Road closed or barricaded", color: "#E11D48" },
  stage_queue:   { label: "Long Queue",   desc: "Long wait at the stage",    color: "#F59E0B" },
  police_check:  { label: "Police Check", desc: "NTSA / traffic police",     color: "#2563EB" },
  flooded_route: { label: "Flooded Road", desc: "Road impassable",           color: "#0EA5E9" },
  breakdown:     { label: "Breakdown",    desc: "Vehicle blocking the road", color: "#A855F7" },
  security:      { label: "Insecurity",   desc: "Robbery or safety concern", color: "#B91C1C" },
  fare_hike:     { label: "Fare Hike",    desc: "Higher fares than usual",   color: "#16A34A" },
};

export const REPORT_TYPE_ORDER = Object.keys(REPORT_TYPES) as ReportType[];

/** Metadata for a type, with a safe fallback for unknown / future types. */
export function reportMeta(type: string): ReportTypeMeta {
  return (
    (REPORT_TYPES as Record<string, ReportTypeMeta>)[type] ?? {
      label: "Alert",
      desc: "",
      color: "#F59E0B",
    }
  );
}

// ─── Colour helpers ──────────────────────────────────────────────────────────

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (target - c) * amount)
  );
  return "#" + ch.map((c) => c.toString(16).padStart(2, "0")).join("");
}
const lighten = (hex: string, a: number) => mix(hex, 255, a);
const darken = (hex: string, a: number) => mix(hex, 0, a);

// ─── Glyphs ──────────────────────────────────────────────────────────────────
// Drawn on a 24-unit grid. `W` is the glyph colour; `D` is used for cut-outs
// (windows, lights) and is the shape's own colour, so the glyph reads as one
// solid shape with details punched through it.

type Glyph = (W: string, D: string) => string;

/** Front view of a car, the building block for several glyphs. */
function car(W: string, D: string): string {
  return `
    <path d="M6.2 11.2 7.9 6.8A1.9 1.9 0 0 1 9.7 5.6h4.6a1.9 1.9 0 0 1 1.8 1.2l1.7 4.4Z" fill="${W}"/>
    <rect x="3.2" y="10.6" width="17.6" height="7.4" rx="2.6" fill="${W}"/>
    <rect x="4.9" y="17" width="3.3" height="3.4" rx="1.1" fill="${W}"/>
    <rect x="15.8" y="17" width="3.3" height="3.4" rx="1.1" fill="${W}"/>
    <path d="M8.6 10.6 9.6 7.9h4.8l1 2.7Z" fill="${D}"/>
    <circle cx="7" cy="14.3" r="1.35" fill="${D}"/>
    <circle cx="17" cy="14.3" r="1.35" fill="${D}"/>`;
}

const GLYPHS: Record<ReportType, Glyph> = {
  // A car with a second one queued behind it.
  traffic_jam: (W, D) => `
    <g transform="translate(9.4 -2.2) scale(0.58)" opacity="0.6">${car(W, D)}</g>
    <g transform="translate(-1.2 3.4) scale(0.86)">${car(W, D)}</g>`,

  // A car knocked sideways, with an impact burst.
  accident: (W, D) => `
    <g transform="rotate(-14 12 14) translate(-1.6 2) scale(0.82)">${car(W, D)}</g>
    <path d="M18.4 1.8l.9 2.6 2.6-.9-1.4 2.4 2.4 1.4-2.7.4.4 2.7-2.1-1.8-1.8 2.1-.2-2.8-2.7-.3 2.3-1.5-1.2-2.5 2.6 1Z"
      fill="#FDE047" stroke="${W}" stroke-width="0.6" stroke-linejoin="round"/>`,

  // A striped road barrier on two posts.
  road_blocked: (W, D) => `
    <rect x="5.4" y="12" width="2.4" height="9" rx="1" fill="${W}"/>
    <rect x="16.2" y="12" width="2.4" height="9" rx="1" fill="${W}"/>
    <rect x="2.2" y="6.4" width="19.6" height="7" rx="2" fill="${W}"/>
    <path d="M5.4 6.4h3.4l-4.2 7H2.9ZM11.8 6.4h3.4l-4.2 7H7.6ZM18.2 6.4h3.1l-4.2 7h-3.1Z" fill="${D}"/>
    <rect x="3.4" y="20.2" width="17.2" height="1.8" rx="0.9" fill="${W}"/>`,

  // Three people in line, the nearest one largest.
  stage_queue: (W) => `
    <g opacity="0.55"><circle cx="18.6" cy="7.4" r="2.3" fill="${W}"/>
      <path d="M15 17.4v-3.2a3.6 3.6 0 0 1 7.2 0v3.2Z" fill="${W}"/></g>
    <g opacity="0.8"><circle cx="5.4" cy="7.4" r="2.3" fill="${W}"/>
      <path d="M1.8 17.4v-3.2a3.6 3.6 0 0 1 7.2 0v3.2Z" fill="${W}"/></g>
    <circle cx="12" cy="7.6" r="3.2" fill="${W}"/>
    <path d="M6.8 21.4v-4.6a5.2 5.2 0 0 1 10.4 0v4.6Z" fill="${W}"/>`,

  // A police shield with a star.
  police_check: (W, D) => `
    <path d="M12 2.4 20 5.4v6.3c0 4.9-3.4 8.6-8 10-4.6-1.4-8-5.1-8-10V5.4Z" fill="${W}"/>
    <path d="m12 7.6 1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4Z" fill="${D}"/>`,

  // A water drop above rolling waves.
  flooded_route: (W) => `
    <path d="M12 2.2c2.6 3 4 5.2 4 7a4 4 0 0 1-8 0c0-1.8 1.4-4 4-7Z" fill="${W}"/>
    <path d="M2.4 16c1.6 0 1.6-1.4 3.2-1.4s1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4"
      fill="none" stroke="${W}" stroke-width="2" stroke-linecap="round"/>
    <path d="M2.4 20.4c1.6 0 1.6-1.4 3.2-1.4s1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4"
      fill="none" stroke="${W}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`,

  // A warning triangle, the universal "vehicle stopped" sign.
  breakdown: (W, D) => `
    <path d="M10.3 3.4a2 2 0 0 1 3.4 0l8.4 14.6a2 2 0 0 1-1.7 3H3.6a2 2 0 0 1-1.7-3Z" fill="${W}"/>
    <path d="M12 8.6v5.4" stroke="${D}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="12" cy="17.2" r="1.45" fill="${D}"/>`,

  // A flashing siren light.
  security: (W, D) => `
    <path d="M6.6 17.4v-4.6a5.4 5.4 0 0 1 10.8 0v4.6Z" fill="${W}"/>
    <rect x="4.4" y="17.2" width="15.2" height="3.6" rx="1.4" fill="${W}"/>
    <path d="M10 11.6a2.2 2.2 0 0 1 2-1.6" stroke="${D}" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <path d="M12 2.4v2.2M4.4 5.2l1.6 1.6M19.6 5.2 18 6.8M1.8 11.6h2.2M20 11.6h2.2"
      stroke="${W}" stroke-width="2" stroke-linecap="round"/>`,

  // A rising price trend: bars plus an arrow climbing over them.
  fare_hike: (W) => `
    <rect x="3" y="15.2" width="3.6" height="5.8" rx="1.2" fill="${W}" opacity="0.55"/>
    <rect x="10.2" y="12.4" width="3.6" height="8.6" rx="1.2" fill="${W}" opacity="0.55"/>
    <rect x="17.4" y="9" width="3.6" height="12" rx="1.2" fill="${W}" opacity="0.55"/>
    <path d="M2.6 12.2 8.4 7.4l4.2 3.4 7.6-6.8" stroke="${W}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M15.6 3.4h5.2v5.2" stroke="${W}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
};

// ─── Icon ────────────────────────────────────────────────────────────────────

/** The inflated "clay" body: a soft rounded shape, slightly fuller at the top. */
const CLAY_BODY =
  "M24 4.5c9.4 0 16.6 4.6 18.4 12.6 1.4 6.4-.6 13.6-5.6 18.6-4 4-8.6 6-12.8 6s-8.8-2-12.8-6c-5-5-7-12.2-5.6-18.6C7.4 9.1 14.6 4.5 24 4.5Z";

/**
 * The 3D "soft clay" report icon as an SVG string.
 *
 * - `variant: "tile"` (default): the clay shape on a 48×48 canvas with a
 *   soft contact shadow, for lists and cards.
 * - `variant: "pin"`: the same shape with a tail flowing out of its base on a
 *   48×56 canvas, anchored at the tail tip (bottom centre), for the map.
 */
export function reportIconSvg(
  type: string,
  variant: "tile" | "pin" = "tile"
): string {
  const t = (type in REPORT_TYPES ? type : "breakdown") as ReportType;
  const base = reportMeta(type).color;
  const id = `${t}-${variant}`;
  const pin = variant === "pin";
  const H = pin ? 56 : 48;
  const glyph = GLYPHS[t];

  // userSpaceOnUse so the body and the pin's tail share one light source and
  // read as a single piece.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 ${H}" width="48" height="${H}">
  <defs>
    <radialGradient id="clay-${id}" gradientUnits="userSpaceOnUse" cx="17.5" cy="14" r="${pin ? 42 : 36}">
      <stop offset="0" stop-color="${lighten(base, 0.45)}"/>
      <stop offset="0.5" stop-color="${base}"/>
      <stop offset="1" stop-color="${darken(base, 0.34)}"/>
    </radialGradient>
    <radialGradient id="hi-${id}" gradientUnits="userSpaceOnUse" cx="17" cy="10.5" r="15">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${pin
    ? `<ellipse cx="24" cy="53.4" rx="5.5" ry="1.7" fill="#000000" opacity="0.22"/>
  <path d="M17.6 37.8c2.6 2.4 4.6 6.2 5.2 12.4.1.9 1.3.9 1.4 0 .6-6.2 2.6-10 5.2-12.4Z" fill="url(#clay-${id})"/>`
    : `<ellipse cx="24" cy="44.6" rx="13" ry="2.4" fill="#000000" opacity="0.16"/>`}
  <path d="${CLAY_BODY}" fill="url(#clay-${id})"/>
  <path d="${CLAY_BODY}" fill="url(#hi-${id})"/>
  <g transform="translate(12 12.6)" opacity="0.45">${glyph(darken(base, 0.45), darken(base, 0.45))}</g>
  <g transform="translate(12 11.6)">${glyph(lighten(base, 0.84), base)}</g>
</svg>`;
}
