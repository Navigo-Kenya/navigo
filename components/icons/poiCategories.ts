// components/icons/poiCategories.ts
//
// POI categories as served by the API's vector tiles (layer "pois", property
// "category"). Labels and colours must match the API's config/pois.php.
import type { PoiCategory } from "./NavigoIcons";

export const POI_CATEGORIES: Record<PoiCategory, { label: string; color: string }> = {
  health:     { label: "Health",     color: "#DC2626" },
  fuel:       { label: "Fuel",       color: "#2563EB" },
  lodging:    { label: "Lodging",    color: "#0891B2" },
  mall:       { label: "Mall",       color: "#7C3AED" },
  attraction: { label: "Attraction", color: "#0D9488" },
  food:       { label: "Food",       color: "#EA580C" },
  cafe:       { label: "Cafe",       color: "#B45309" },
  nightlife:  { label: "Nightlife",  color: "#9333EA" },
  grocery:    { label: "Grocery",    color: "#16A34A" },
  pharmacy:   { label: "Pharmacy",   color: "#059669" },
  bank:       { label: "Bank",       color: "#0F766E" },
  education:  { label: "Education",  color: "#4F46E5" },
  worship:    { label: "Worship",    color: "#64748B" },
  government: { label: "Government", color: "#475569" },
  parking:    { label: "Parking",    color: "#0284C7" },
  shopping:   { label: "Shopping",   color: "#A855F7" },
  services:   { label: "Services",   color: "#6B7280" },
};

export const POI_CATEGORY_KEYS = Object.keys(POI_CATEGORIES) as PoiCategory[];

export function poiCategoryMeta(category: string) {
  return POI_CATEGORIES[category as PoiCategory] ?? POI_CATEGORIES.services;
}
