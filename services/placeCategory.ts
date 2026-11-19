// services/placeCategory.ts
//
// A place's category, from whatever describes it: our own category label
// ("Food", from our POI tiles and category search) or Google's place types
// (["shopping_mall", "point_of_interest", "establishment"], from search and
// place details). It picks the place's badge on the map (poi-<key>) and the
// label shown in its sheet.
//
// An address, a road or an area has no category: it gets the plain pin, not
// a badge. (Before, any place without a known category fell back to the
// "Services" badge, a briefcase, so places opened from search showed a
// suitcase.)
import { POI_CATEGORIES, POI_CATEGORY_KEYS } from "@/components/icons/poiCategories";
import type { PoiCategory } from "@/components/icons/NavigoIcons";

/** Google place type → our category. */
const GOOGLE_TYPE: Record<string, PoiCategory> = {
  restaurant: "food", meal_takeaway: "food", meal_delivery: "food", bakery: "food", food: "food",
  cafe: "cafe",
  bar: "nightlife", night_club: "nightlife", liquor_store: "nightlife",
  hospital: "health", doctor: "health", dentist: "health", physiotherapist: "health",
  health: "health", veterinary_care: "health",
  pharmacy: "pharmacy", drugstore: "pharmacy",
  gas_station: "fuel",
  lodging: "lodging", campground: "lodging", rv_park: "lodging",
  shopping_mall: "mall",
  supermarket: "grocery", grocery_or_supermarket: "grocery", convenience_store: "grocery",
  clothing_store: "shopping", shoe_store: "shopping", electronics_store: "shopping",
  department_store: "shopping", jewelry_store: "shopping", furniture_store: "shopping",
  home_goods_store: "shopping", book_store: "shopping", hardware_store: "shopping",
  bicycle_store: "shopping", pet_store: "shopping", florist: "shopping", store: "shopping",
  bank: "bank", atm: "bank", finance: "bank", accounting: "bank", insurance_agency: "bank",
  school: "education", primary_school: "education", secondary_school: "education",
  university: "education", library: "education",
  church: "worship", mosque: "worship", hindu_temple: "worship", synagogue: "worship",
  place_of_worship: "worship",
  city_hall: "government", courthouse: "government", embassy: "government",
  local_government_office: "government", police: "government", post_office: "government",
  fire_station: "government",
  parking: "parking",
  park: "park", natural_feature: "park",
  movie_theater: "entertainment", casino: "entertainment", bowling_alley: "entertainment",
  amusement_park: "entertainment", movie_rental: "entertainment",
  gym: "sport", stadium: "sport",
  tourist_attraction: "attraction", museum: "attraction", art_gallery: "attraction",
  zoo: "attraction", aquarium: "attraction", landmark: "attraction", town_square: "attraction",
  car_repair: "services", car_wash: "services", car_dealer: "services", car_rental: "services",
  beauty_salon: "services", hair_care: "services", spa: "services", laundry: "services",
  lawyer: "services", travel_agency: "services", real_estate_agency: "services",
  electrician: "services", plumber: "services", locksmith: "services", painter: "services",
  moving_company: "services", storage: "services", funeral_home: "services",
  general_contractor: "services", roofing_contractor: "services",
};

/** Addresses, roads and areas: a plain pin. */
const ADDRESS_TYPES = new Set([
  "street_address", "route", "intersection", "premise", "subpremise", "plus_code",
  "postal_code", "postal_town", "locality", "sublocality", "sublocality_level_1",
  "sublocality_level_2", "neighborhood", "colloquial_area", "political", "country",
  "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3",
  "geocode", "street_number", "floor", "room",
]);

/** Types that say nothing about what the place is. */
const GENERIC_TYPES = new Set(["point_of_interest", "establishment"]);

/** Transport hubs: stops have badges of their own, not a POI badge. */
const TRANSIT_TYPES = new Set([
  "bus_station", "train_station", "subway_station", "transit_station",
  "light_rail_station", "taxi_stand", "airport",
]);

const ADDRESS_LABEL = "Address";

/** "shopping_mall" → "Shopping mall". */
export function humanizeType(t: string): string {
  const s = t.replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

/**
 * The label to store and show for Google's types: the most specific one
 * (Google lists it first), "Address" for addresses and areas, "" when the
 * types say nothing.
 */
export function labelForGoogleTypes(types: readonly string[] | null | undefined): string {
  const list = (types ?? []).filter(Boolean);
  const specific = list.find((t) => !GENERIC_TYPES.has(t) && !ADDRESS_TYPES.has(t));
  if (specific) return humanizeType(specific);
  if (list.some((t) => ADDRESS_TYPES.has(t))) return ADDRESS_LABEL;
  return list.length ? "Place" : "";
}

/**
 * Our category for a place's label or Google types, or null for a plain pin
 * (an address, a transport hub, or nothing known).
 */
export function poiCategoryOf(
  label: string | null | undefined,
  types?: readonly string[] | null
): PoiCategory | null {
  for (const t of types ?? []) {
    if (GOOGLE_TYPE[t]) return GOOGLE_TYPE[t];
    if (TRANSIT_TYPES.has(t)) return null;
  }

  const l = String(label ?? "").trim().toLowerCase();
  if (!l || l === ADDRESS_LABEL.toLowerCase() || l === "place") return null;

  // Our own labels ("Food", "Parks & nature").
  const byLabel = POI_CATEGORY_KEYS.find((k) => POI_CATEGORIES[k].label.toLowerCase() === l);
  if (byLabel) return byLabel;

  // A humanized Google type ("Shopping mall", "Gas station").
  const asType = l.replace(/\s+/g, "_");
  if (GOOGLE_TYPE[asType]) return GOOGLE_TYPE[asType];
  if (TRANSIT_TYPES.has(asType) || ADDRESS_TYPES.has(asType)) return null;

  // Anything else that reads like a known kind of place.
  // Word starts, so "theatre" isn't food and "barber" isn't a bar.
  if (/restaurant|food|\beat|grill|kitchen|pizza|burger|chicken/.test(l)) return "food";
  if (/cafe|café|coffee|\btea\b/.test(l)) return "cafe";
  if (/\bbar\b|\bclub\b|lounge|\bpub\b/.test(l)) return "nightlife";
  if (/hospital|clinic|health|doctor|medical|dental/.test(l)) return "health";
  if (/pharmac|chemist/.test(l)) return "pharmacy";
  if (/gas|fuel|petrol/.test(l)) return "fuel";
  if (/hotel|lodg|guest|hostel|inn\b/.test(l)) return "lodging";
  if (/mall/.test(l)) return "mall";
  if (/supermarket|grocer/.test(l)) return "grocery";
  if (/shop|store|boutique|market/.test(l)) return "shopping";
  if (/bank|atm|sacco|mpesa|m-pesa|forex/.test(l)) return "bank";
  if (/school|universit|college|library|academy/.test(l)) return "education";
  if (/church|mosque|temple|worship|cathedral/.test(l)) return "worship";
  if (/government|county|police|embassy|court|ministry|huduma/.test(l)) return "government";
  if (/parking/.test(l)) return "parking";
  if (/park|garden|nature|forest|reserve/.test(l)) return "park";
  if (/cinema|movie|theat|music|casino|entertain/.test(l)) return "entertainment";
  if (/stadium|gym|fitness|sport|golf|pool/.test(l)) return "sport";
  if (/museum|monument|attraction|historic|gallery|zoo/.test(l)) return "attraction";
  return "services";
}
