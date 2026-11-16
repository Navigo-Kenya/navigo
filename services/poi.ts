// services/poi.ts
//
// Details for one of our POIs (GET /pois/{id}): our own data plus live Google
// Places content (rating, hours, photos) when the API could match the place.
// Google content isn't stored on the device: React Query keeps it briefly.
import { useQuery } from "@tanstack/react-query";
import { BASE_URL, fetchApi } from "@/services/apiClient";

export interface PoiGooglePhoto {
  name: string;
  width: number | null;
  height: number | null;
  attributions: { name: string | null; uri: string | null }[];
}

export interface PoiGoogleDetails {
  place_id: string;
  name: string | null;
  type: string | null;
  address: string | null;
  short_address: string | null;
  maps_url: string | null;
  business_status: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
  rating: number | null;
  rating_count: number | null;
  price_level: string | null;
  phone: string | null;
  phone_intl: string | null;
  website: string | null;
  open_now: boolean | null;
  /** Monday first, e.g. "Monday: 6:30 AM – 9:00 PM". */
  weekday_hours: string[] | null;
  photos: PoiGooglePhoto[];
}

export interface PoiDetails {
  id: string;
  source: string;
  name: string;
  category: string;
  subcategory: string | null;
  importance: number;
  lat: number;
  lng: number;
  address: string | null;
  locality: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  brand: string | null;
  google: PoiGoogleDetails | null;
}

export async function fetchPoiDetails(id: string): Promise<PoiDetails> {
  const res = await fetchApi<{ data: PoiDetails }>(`/pois/${encodeURIComponent(id)}`);
  return res.data;
}

export interface NearbyPoi {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  importance: number;
  address: string | null;
  locality: string | null;
  brand: string | null;
  lat: number;
  lng: number;
  /** From the search centre (not necessarily the user). */
  distance_m: number;
}

/** Nearest POIs of one category around a point (our data, no Google). */
export async function fetchNearbyPois(
  category: string,
  lat: number,
  lng: number,
  opts: { radius?: number; limit?: number } = {}
): Promise<NearbyPoi[]> {
  const res = await fetchApi<{ data: NearbyPoi[] }>("/pois/nearby", {
    params: {
      category,
      lat: lat.toFixed(5),
      lng: lng.toFixed(5),
      radius: opts.radius ?? 3000,
      limit: opts.limit ?? 40,
    },
  });
  return res.data ?? [];
}

/** Image URL for a Google photo; the API redirects to Google (key stays server-side). */
export function poiPhotoUrl(photoName: string, width = 600): string {
  return `${BASE_URL}/pois/photo?w=${width}&name=${encodeURIComponent(photoName)}`;
}

/** `poiId` is the numeric POI id (without the "poi:" prefix); null disables the query. */
export function usePoiDetails(poiId: string | null) {
  return useQuery({
    queryKey: ["poi", poiId],
    queryFn: () => fetchPoiDetails(poiId as string),
    enabled: !!poiId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}
