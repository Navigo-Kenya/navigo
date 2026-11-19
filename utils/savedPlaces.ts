// utils/savedPlaces.ts
//
// A saved list's places, as the list screen shows them: one row per place
// (the API has one row per place per list), sorted, and the map preview of
// them all (one Mapbox Static image with a pin each, in the list's colour).
import type { SavedPlace } from "@/services/user";
import { listMeta, type SavedListMeta } from "@/store/savedListsStore";
import { distanceM } from "@/services/exploreSearch";

export interface PlaceItem {
  /** The newest row of this place. */
  place: SavedPlace;
  /** Every row: one per list it's in. */
  rows: SavedPlace[];
  lists: SavedListMeta[];
}

export const placeKey = (p: Pick<SavedPlace, "place_id" | "lat" | "lng">) =>
  p.place_id ?? `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;

/** One item per place, newest first; `list` narrows to one list. */
export function groupPlaces(rows: SavedPlace[], custom: SavedListMeta[], list: string | null): PlaceItem[] {
  const listRows = rows.filter((p) => p.list !== null && p.pin === null && (list === null || p.list === list));
  const by = new Map<string, PlaceItem>();
  for (const p of [...listRows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const k = placeKey(p);
    const meta = listMeta(p.list as string, custom);
    const hit = by.get(k);
    if (hit) {
      hit.rows.push(p);
      if (!hit.lists.some((l) => l.key === meta.key)) hit.lists.push(meta);
    } else {
      by.set(k, { place: p, rows: [p], lists: [meta] });
    }
  }
  return [...by.values()];
}

export type SortMode = "recent" | "name" | "nearest";

export function sortPlaces(items: PlaceItem[], mode: SortMode, here: { lat: number; lng: number } | null): PlaceItem[] {
  const out = [...items];
  if (mode === "name") out.sort((a, b) => a.place.name.localeCompare(b.place.name));
  else if (mode === "nearest" && here) {
    const d = (i: PlaceItem) => distanceM(here.lat, here.lng, i.place.lat, i.place.lng);
    out.sort((a, b) => d(a) - d(b));
  }
  return out;
}

/** Nudging the pin less than this (onto the gate) keeps the place's name. */
export const KEEP_NAME_WITHIN_M = 40;

/**
 * The name to save for a pin: the chosen place's while the pin stays on it,
 * else the street address under the pin, else its coordinates.
 */
export function pinName(
  chosen: { name: string; lat: number; lng: number } | null,
  pin: { lat: number; lng: number },
  address: string | null
): string {
  if (chosen && distanceM(chosen.lat, chosen.lng, pin.lat, pin.lng) < KEEP_NAME_WITHIN_M) return chosen.name;
  return address?.trim() || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;
}

/** Keeps the URL well under Mapbox's 8 kB limit. */
export const MAP_PINS_MAX = 40;

/** The map preview: every place as a pin (stages in blue), framed to fit. */
export function listMapUrl(
  places: Pick<SavedPlace, "lat" | "lng" | "type">[],
  color: string,
  dark: boolean,
  token: string,
  size = { w: 640, h: 280 }
): string | null {
  const pts = places
    .map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .slice(0, MAP_PINS_MAX);
  if (!pts.length) return null;
  const hex = color.replace("#", "").toLowerCase();
  const pins = pts
    .map((p) => `pin-s+${p.type === "stop" ? "2563eb" : hex}(${p.lng.toFixed(5)},${p.lat.toFixed(5)})`)
    .join(",");
  const style = dark ? "dark-v11" : "streets-v12";
  // One pin: a street-level view around it; several: framed to fit them all.
  const view = pts.length === 1 ? `${pts[0].lng.toFixed(5)},${pts[0].lat.toFixed(5)},14` : "auto";
  const pad = pts.length === 1 ? "" : "&padding=40";
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${pins}/${view}/${size.w}x${size.h}@2x?access_token=${token}${pad}`;
}
