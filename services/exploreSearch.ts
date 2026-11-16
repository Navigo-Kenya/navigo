// services/exploreSearch.ts
//
// One search for the map's results sheet: places (Google text search, real
// ratings / open-now / photos in a single call) and our own stops + lines,
// in parallel. Shared by the search screen and the category chips.
import { MapService } from "./map";
import { StopService } from "./stop";
import { useExploreSearchStore } from "@/store/exploreSearchStore";

/** Nairobi CBD, used before the first location fix. */
const FALLBACK = { lat: -1.2864, lng: 36.8172 };

let lastRequest = 0;

/**
 * Runs `query` and fills the explore store. Results of an older search that
 * finishes after a newer one are dropped, so fast typing / chip taps never
 * show stale results.
 */
export async function runExploreSearch(
  query: string,
  near?: { lat?: number | null; lng?: number | null }
): Promise<void> {
  const q = query.trim();
  if (!q) return;
  const store = useExploreSearchStore.getState();
  const id = ++lastRequest;
  const lat = near?.lat ?? FALLBACK.lat;
  const lng = near?.lng ?? FALLBACK.lng;

  store.setLoading(true);
  const [places, mobility] = await Promise.all([
    MapService.searchRichPlaces(q, lat, lng).catch(() => []),
    StopService.searchMobility(q, lat, lng).catch(() => ({ stops: [], routes: [] })),
  ]);
  if (id !== lastRequest) return; // a newer search took over

  useExploreSearchStore.getState().setResults({
    places: places.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      rating: p.rating,
      reviewCount: p.reviewCount,
      openNow: p.openNow,
      distanceM: p.distanceM,
      photos: p.photos,
    })),
    stops: mobility.stops,
    routes: mobility.routes,
  });
}

/** Straight-line distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "350 m", "1.2 km". */
export function formatDistance(m?: number | null): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
