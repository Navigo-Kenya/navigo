// components/icons/NavigoIcons.tsx
//
// Navigo's own vector icon set, drawn on a 24-unit grid with react-native-svg.
//
// One visual language throughout:
//   - rounded caps and joins, 1.9 stroke
//   - "duotone" UI icons: the outline in the icon colour plus a soft 18% fill
//     of the same colour on the main shape
//   - stop glyphs: solid white strokes, made to sit on a coloured badge
import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

const ORANGE = "#FF6F00";
const STROKE = 1.9;
const FILL_OPACITY = 0.18;

type IconProps = { color: string; size?: number };

/** Common stroke props for an outline path. */
function line(color: string, width = STROKE) {
  return {
    stroke: color,
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
}

/** Outline plus soft tinted fill, for the main shape of a duotone icon. */
function tinted(color: string) {
  return { ...line(color), fill: color, fillOpacity: FILL_OPACITY };
}

// ─── Map controls ────────────────────────────────────────────────────────────

/**
 * Map layers: three map sheets in perspective. Solid orange top sheet with a
 * soft highlight; the two below show only their front edges, fading with depth.
 */
export function MapLayersIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3.5 16.2 12 20.6l8.5-4.4" {...line(color)} strokeOpacity={0.4} />
      <Path d="M3.5 12.3 12 16.7l8.5-4.4" {...line(color)} strokeOpacity={0.72} />
      <Path
        d="M12 3.4 20.5 8 12 12.6 3.5 8Z"
        fill={ORANGE}
        stroke={ORANGE}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M11.6 5.5 7.4 7.8"
        stroke="#FFFFFF"
        strokeOpacity={0.6}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Report: a megaphone in the icon colour, with the sound waves in Navigo
 * orange, which is what makes it read as "broadcast an alert".
 */
export function ReportIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* handle */}
      <Path d="m7.6 14.9 1.5 4.4" {...line(color)} />
      {/* horn */}
      <Path
        d="M3.5 10.3v3.4c0 .6.4 1.1 1 1.1H7l7 4V5.2l-7 4H4.5c-.6 0-1 .5-1 1.1Z"
        {...tinted(color)}
      />
      {/* sound waves */}
      <Path d="M16.7 9.4a3.7 3.7 0 0 1 0 5.2" {...line(ORANGE)} />
      <Path d="M19.1 7a7.2 7.2 0 0 1 0 10" {...line(ORANGE)} strokeOpacity={0.55} />
    </Svg>
  );
}

// ─── Place categories (QUICK_CATEGORIES) ─────────────────────────────────────

export type PlaceCategoryKey =
  | "restaurant"
  | "cafe"
  | "gas"
  | "hospital"
  | "parking"
  | "store"
  | "pharmacy"
  | "atm"
  // Same glyphs as the map's POI badges, so a chip matches its pins.
  | "hotel"
  | "mall"
  | "shopping"
  | "attraction"
  | "park"
  | "entertainment"
  | "nightlife"
  | "sport"
  | "school"
  | "worship"
  | "government";

function RestaurantGlyph({ color }: { color: string }) {
  return (
    <>
      {/* knife blade, then fork */}
      <Path d="M16.8 13.5h-3V9.8c0-3 1.2-5.5 3-6.3v17" {...tinted(color)} />
      <Path d="M5.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5M8 3.5v17" {...line(color)} />
    </>
  );
}

function CafeGlyph({ color }: { color: string }) {
  return (
    <>
      <Path
        d="M4.5 9.5h11v4.7a4.8 4.8 0 0 1-4.8 4.8H9.3a4.8 4.8 0 0 1-4.8-4.8Z"
        {...tinted(color)}
      />
      <Path d="M15.5 11h1.3a2.4 2.4 0 0 1 0 4.8h-1.6" {...line(color)} />
      {/* steam */}
      <Path d="M8.3 3.6c-.9 1 .9 2 0 3.1M11.7 3.6c-.9 1 .9 2 0 3.1" {...line(color)} strokeOpacity={0.7} />
    </>
  );
}

function GasGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M5 20.3V5.6A1.6 1.6 0 0 1 6.6 4h6.3a1.6 1.6 0 0 1 1.6 1.6v14.7Z" {...tinted(color)} />
      <Path d="M3.5 20.3h12.5" {...line(color)} />
      <Rect x={7.4} y={7.2} width={4.7} height={3.8} rx={0.9} {...line(color)} />
      {/* hose and nozzle */}
      <Path d="M14.5 9.5h1.4c.8 0 1.4.6 1.4 1.4v4.7a1.6 1.6 0 0 0 3.2 0V8.3L18.3 6" {...line(color)} />
    </>
  );
}

function HospitalGlyph({ color }: { color: string }) {
  return (
    <>
      <Rect x={3.6} y={3.6} width={16.8} height={16.8} rx={4.6} {...tinted(color)} />
      <Path d="M12 8v8M8 12h8" {...line(color, 2.4)} />
    </>
  );
}

function ParkingGlyph({ color }: { color: string }) {
  return (
    <>
      <Rect x={3.6} y={3.6} width={16.8} height={16.8} rx={4.6} {...tinted(color)} />
      <Path d="M9.6 17V7.4h3.1a2.9 2.9 0 0 1 0 5.8H9.6" {...line(color, 2.2)} />
    </>
  );
}

function StoreGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M5.5 11.4v8.1h13v-8.1" {...tinted(color)} />
      {/* awning with scallops */}
      <Path
        d="M4 9.4 5.6 4.5h12.8L20 9.4a2.67 2.67 0 0 1-5.33 0 2.67 2.67 0 0 1-5.34 0A2.67 2.67 0 0 1 4 9.4Z"
        {...line(color)}
      />
      <Path d="M10.2 19.5v-4.3h3.6v4.3" {...line(color)} />
    </>
  );
}

function PharmacyGlyph({ color }: { color: string }) {
  return (
    <>
      {/* capsule at 45°, one half tinted */}
      <Path
        d="M10.4 4.9a4.6 4.6 0 0 1 6.5 6.5l-6.1 6.1a4.6 4.6 0 0 1-6.5-6.5Z"
        {...line(color)}
      />
      <Path
        d="M10.4 4.9a4.6 4.6 0 0 1 6.5 6.5L13.8 14.5 7.3 8Z"
        fill={color}
        fillOpacity={0.32}
      />
      <Path d="m7.4 8.1 6.5 6.5" {...line(color)} />
    </>
  );
}

function AtmGlyph({ color }: { color: string }) {
  return (
    <>
      <Rect x={3} y={5.5} width={18} height={13} rx={2.6} {...tinted(color)} />
      <Path d="M3 10h18" {...line(color, 2.2)} />
      <Path d="M6.6 14.6h3.2" {...line(color)} />
    </>
  );
}

const PLACE_GLYPHS: Record<PlaceCategoryKey, React.FC<{ color: string }>> = {
  restaurant: RestaurantGlyph,
  cafe: CafeGlyph,
  gas: GasGlyph,
  hospital: HospitalGlyph,
  parking: ParkingGlyph,
  store: StoreGlyph,
  pharmacy: PharmacyGlyph,
  atm: AtmGlyph,
  hotel: LodgingGlyph,
  mall: MallGlyph,
  shopping: StoreGlyph,
  attraction: AttractionGlyph,
  park: ParkGlyph,
  entertainment: EntertainmentGlyph,
  nightlife: NightlifeGlyph,
  sport: SportGlyph,
  school: EducationGlyph,
  worship: WorshipGlyph,
  government: GovernmentGlyph,
};

/** Duotone icon for a quick-search place category. */
export function PlaceCategoryIcon({
  category,
  color,
  size = 16,
}: IconProps & { category: PlaceCategoryKey }) {
  const Glyph = PLACE_GLYPHS[category];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Glyph color={color} />
    </Svg>
  );
}

// ─── Stop types (map markers) ────────────────────────────────────────────────

export type StopCategory =
  | "rail"
  | "metro"
  | "tram"
  | "brt"
  | "ferry"
  | "airport"
  | "cable"
  | "terminal"
  | "bus";

/** Matatu / bus stage: a bus seen from the front. */
function BusStopGlyph({ color }: { color: string }) {
  return (
    <>
      <Rect x={5.8} y={3.8} width={12.4} height={13.4} rx={2.8} {...line(color)} />
      <Path d="M5.8 10.6h12.4M8.6 17.2v2.6M15.4 17.2v2.6" {...line(color)} />
      <Circle cx={9} cy={13.9} r={1.05} fill={color} />
      <Circle cx={15} cy={13.9} r={1.05} fill={color} />
    </>
  );
}

/** Terminal / major stage: a station canopy over a bus. */
function TerminalGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M3.8 9 12 4.2 20.2 9M6.4 9.6v9.6M17.6 9.6v9.6M4.6 19.6h14.8" {...line(color)} />
      <Rect x={9.2} y={11.2} width={5.6} height={5.6} rx={1.3} {...line(color, 1.7)} />
    </>
  );
}

/** Rail / SGR: a train front on its tracks. */
function RailGlyph({ color }: { color: string }) {
  return (
    <>
      <Rect x={6.6} y={3.4} width={10.8} height={12.6} rx={3.4} {...line(color)} />
      <Path d="M6.6 9.4h10.8M9.2 16.4 7 20.4M14.8 16.4l2.2 4M8.1 18.6h7.8" {...line(color)} />
      <Circle cx={9.4} cy={12.7} r={1} fill={color} />
      <Circle cx={14.6} cy={12.7} r={1} fill={color} />
    </>
  );
}

/** Metro: the universal "M" mark. */
function MetroGlyph({ color }: { color: string }) {
  return <Path d="M6.6 17.6V6.6l5.4 6.6 5.4-6.6v11" {...line(color, 2.3)} />;
}

/** BRT: an articulated bus in side view. */
function BrtGlyph({ color }: { color: string }) {
  return (
    <>
      <Path
        d="M3.4 15.6V8.6C3.4 7.7 4.1 7 5 7h14c.9 0 1.6.7 1.6 1.6v7Z"
        {...line(color)}
      />
      <Path d="M3.4 11.2h17.2M12 7v8.6" {...line(color)} />
      <Circle cx={7.2} cy={17.4} r={1.6} fill={color} />
      <Circle cx={16.8} cy={17.4} r={1.6} fill={color} />
    </>
  );
}

/** Ferry: a boat with a cabin on the water line. */
function FerryGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M7.2 13.4V9.4h9.6v4M12 9.4V5.2" {...line(color)} />
      <Path
        d="M3.6 13.4h16.8l-2 4.2a2 2 0 0 1-1.8 1.2H7.4a2 2 0 0 1-1.8-1.2Z"
        {...line(color)}
      />
    </>
  );
}

/** Tram: a tram car under its overhead wire, pantograph raised. */
function TramGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M7.4 3h9.2M10 3l2 2.6L14 3" {...line(color)} />
      <Rect x={6.6} y={5.8} width={10.8} height={11} rx={2.6} {...line(color)} />
      <Path d="M6.6 10.4h10.8M8.8 16.8l-1.2 3M15.2 16.8l1.2 3" {...line(color)} />
      <Circle cx={9.4} cy={13.6} r={1} fill={color} />
      <Circle cx={14.6} cy={13.6} r={1} fill={color} />
    </>
  );
}

/** Airport: an aircraft seen from above, solid so it reads at marker size. */
function AirportGlyph({ color }: { color: string }) {
  return (
    <Path
      d="M12 3.2c.8 0 1.4.8 1.4 1.8v4.4l6.6 3.9v1.9l-6.6-2.1v4.1l2 1.5v1.6L12 19.4l-3.4.9v-1.6l2-1.5v-4.1L4 15.2v-1.9l6.6-3.9V5c0-1 .6-1.8 1.4-1.8Z"
      fill={color}
    />
  );
}

/** Cable car: a cabin hanging from a sloping cable. */
function CableGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M3.6 6.8 20.4 3.6M12 5.2v3" {...line(color)} />
      <Rect x={7} y={8.2} width={10} height={11} rx={2.4} {...line(color)} />
      <Path d="M7 12.8h10" {...line(color)} />
    </>
  );
}

const STOP_GLYPHS: Record<StopCategory, React.FC<{ color: string }>> = {
  bus: BusStopGlyph,
  terminal: TerminalGlyph,
  rail: RailGlyph,
  metro: MetroGlyph,
  tram: TramGlyph,
  brt: BrtGlyph,
  ferry: FerryGlyph,
  airport: AirportGlyph,
  cable: CableGlyph,
};

/** Glyph for a stop type. White on a coloured badge by default. */
export function StopTypeGlyph({
  category,
  color = "#FFFFFF",
  size = 18,
}: Partial<IconProps> & { category: StopCategory }) {
  const Glyph = STOP_GLYPHS[category];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Glyph color={color} />
    </Svg>
  );
}

// ─── POI categories (map markers) ────────────────────────────────────────────
// Keys match the API's config/pois.php categories. Several reuse the place
// glyphs above; the rest are drawn here in the same style.

export type PoiCategory =
  | "health" | "fuel" | "lodging" | "mall" | "attraction" | "park"
  | "entertainment" | "sport"
  | "food" | "cafe" | "nightlife" | "grocery" | "pharmacy" | "bank"
  | "education" | "worship" | "government" | "parking"
  | "shopping" | "services";

/** Shopping bag (malls). */
function MallGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M5 8.5h14l-1.1 11a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8Z" {...tinted(color)} />
      <Path d="M9 10.5V7.2a3 3 0 0 1 6 0v3.3" {...line(color)} />
    </>
  );
}

/** Shopping basket (groceries, supermarkets). */
function GroceryGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M3.5 9.5h17l-1.7 9a2 2 0 0 1-2 1.6H7.2a2 2 0 0 1-2-1.6Z" {...tinted(color)} />
      <Path d="M8 9.5 11 4M16 9.5 13 4M9.5 13v3.6M14.5 13v3.6" {...line(color)} />
    </>
  );
}

/** Bed (hotels, lodging). */
function LodgingGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M11 14v-3.6h6.6a3.4 3.4 0 0 1 3.4 3.4v.2Z" {...tinted(color)} />
      <Rect x={5.2} y={10.4} width={4} height={3.2} rx={1.1} {...tinted(color)} />
      <Path d="M3 6.5v12.5M3 14h18v5" {...line(color)} />
    </>
  );
}

/** Cocktail glass (bars, lounges, clubs). */
function NightlifeGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M5 4.5h14l-7 7.8Z" {...tinted(color)} />
      <Path d="M12 12.3v7.2M8.4 20h7.2M15.8 3l1.6-1.2" {...line(color)} />
    </>
  );
}

/** Graduation cap (schools, universities). */
function EducationGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M12 4.2 2.6 9 12 13.8 21.4 9Z" {...tinted(color)} />
      <Path d="M6.4 11.2v4.4c0 1.5 2.5 2.9 5.6 2.9s5.6-1.4 5.6-2.9v-4.4M21.4 9v5.2" {...line(color)} />
    </>
  );
}

/** Domed building with a finial: a neutral place of worship. */
function WorshipGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M7 12a5 5 0 0 1 10 0Z" {...tinted(color)} />
      <Path d="M12 3.4V7M5 12h14v8H5ZM10.5 20v-3.3a1.5 1.5 0 0 1 3 0V20" {...line(color)} />
    </>
  );
}

/** Columned building (government offices, police, post). */
function GovernmentGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M3 9.2 12 4.2l9 5Z" {...tinted(color)} />
      <Path d="M6 11.6v6.4M10 11.6v6.4M14 11.6v6.4M18 11.6v6.4M3.4 20.2h17.2" {...line(color)} />
    </>
  );
}

/** Star (attractions, historic sites, parks). */
function AttractionGlyph({ color }: { color: string }) {
  return (
    <Path
      d="m12 3.6 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.2 6.9 19l1.1-5.6L3.8 9.5l5.7-.7Z"
      {...tinted(color)}
    />
  );
}

/** Tree (parks, gardens, nature). */
function ParkGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M12 3.6c3.2 0 5.7 2.5 5.7 5.6a5.6 5.6 0 0 1-5.7 5.5 5.6 5.6 0 0 1-5.7-5.5c0-3.1 2.5-5.6 5.7-5.6Z" {...tinted(color)} />
      <Path d="M12 14.7v5.7M8.9 20.4h6.2M12 12.3l2.2-2" {...line(color)} />
    </>
  );
}

/** Ticket (cinemas, theatres, music venues, casinos). */
function EntertainmentGlyph({ color }: { color: string }) {
  return (
    <>
      <Path d="M4 8.2A1.2 1.2 0 0 1 5.2 7h13.6A1.2 1.2 0 0 1 20 8.2v2a1.8 1.8 0 0 0 0 3.6v2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 15.8v-2a1.8 1.8 0 0 0 0-3.6Z" {...tinted(color)} />
      <Path d="M14.6 7.6v1.3M14.6 11.35v1.3M14.6 15.1v1.3" {...line(color)} />
    </>
  );
}

/** Ball (stadiums, gyms, sports clubs and fields). */
function SportGlyph({ color }: { color: string }) {
  return (
    <>
      <Circle cx={12} cy={12} r={8.4} {...tinted(color)} />
      <Path d="M3.6 12h16.8M12 3.6v16.8M5.9 6.1c1.9 1.6 3 3.6 3 5.9s-1.1 4.3-3 5.9M18.1 6.1c-1.9 1.6-3 3.6-3 5.9s1.1 4.3 3 5.9" {...line(color)} />
    </>
  );
}

/** Briefcase (offices and services). */
function ServicesGlyph({ color }: { color: string }) {
  return (
    <>
      <Rect x={3.5} y={7.5} width={17} height={12} rx={2.6} {...tinted(color)} />
      <Path d="M9 7.5V6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 6v1.5M3.5 12.8h17" {...line(color)} />
    </>
  );
}

const POI_GLYPHS: Record<PoiCategory, React.FC<{ color: string }>> = {
  health: HospitalGlyph,
  fuel: GasGlyph,
  lodging: LodgingGlyph,
  mall: MallGlyph,
  attraction: AttractionGlyph,
  park: ParkGlyph,
  entertainment: EntertainmentGlyph,
  sport: SportGlyph,
  food: RestaurantGlyph,
  cafe: CafeGlyph,
  nightlife: NightlifeGlyph,
  grocery: GroceryGlyph,
  pharmacy: PharmacyGlyph,
  bank: AtmGlyph,
  education: EducationGlyph,
  worship: WorshipGlyph,
  government: GovernmentGlyph,
  parking: ParkingGlyph,
  shopping: StoreGlyph,
  services: ServicesGlyph,
};

/** Glyph for a POI category. White on a coloured badge by default. */
export function PoiCategoryGlyph({
  category,
  color = "#FFFFFF",
  size = 16,
}: Partial<IconProps> & { category: string }) {
  const Glyph = POI_GLYPHS[category as PoiCategory] ?? ServicesGlyph;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Glyph color={color} />
    </Svg>
  );
}
