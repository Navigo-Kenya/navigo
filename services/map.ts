// services/map.ts
import { labelForGoogleTypes } from "./placeCategory";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

export interface PlacePrediction {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

export interface RichGooglePlace {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  reviewCount?: number;
  openNow?: boolean;
  distanceM?: number;
  photos?: string[];
}

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function buildGooglePhotoUrl(
  photoReference: string,
  maxWidth = 500
): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(
    photoReference
  )}&key=${GOOGLE_KEY}`;
}

export const MapService = {
  async placesAutocomplete(
    query: string,
    proximityLat?: number,
    proximityLng?: number
  ): Promise<PlacePrediction[]> {
    if (!query || query.length < 2) return [];

    const location =
      proximityLat != null && proximityLng != null
        ? `&location=${proximityLat},${proximityLng}&radius=30000`
        : "";

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          query
        )}&region=ke&components=country:ke&language=en${location}&key=${GOOGLE_KEY}`
      );
      const json = await res.json();
      if (!json.predictions) return [];
      return (json.predictions as any[]).slice(0, 6).map((r) => ({
        place_id: r.place_id,
        description: r.description,
        main_text:
          r.structured_formatting?.main_text ?? r.description.split(",")[0],
        secondary_text: r.structured_formatting?.secondary_text ?? "",
      }));
    } catch {
      return [];
    }
  },

  /**
   * Rich Google Places Text/Category Search:
   * Returns real star ratings, review counts, Open/Closed status, and Google Place Photo URLs!
   */
  async searchRichPlaces(
    query: string,
    proximityLat?: number,
    proximityLng?: number
  ): Promise<RichGooglePlace[]> {
    if (!query || query.trim().length < 2) return [];

    const locParam =
      proximityLat != null && proximityLng != null
        ? `&location=${proximityLat},${proximityLng}&radius=15000`
        : "";

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
          query
        )}&region=ke&language=en${locParam}&key=${GOOGLE_KEY}`
      );
      const json = await res.json();
      const results: any[] = json.results ?? [];

      return results.slice(0, 10).map((r) => {
        const lat = Number(r.geometry?.location?.lat ?? 0);
        const lng = Number(r.geometry?.location?.lng ?? 0);
        const dist =
          proximityLat != null && proximityLng != null
            ? Math.round(haversineM(proximityLat, proximityLng, lat, lng))
            : undefined;

        // The most specific of Google's types ("Shopping mall"), which also
        // picks the place's badge on the map (services/placeCategory).
        const rawType = labelForGoogleTypes(r.types) || "Place";

        const photos: string[] = (r.photos ?? [])
          .slice(0, 3)
          .map((p: any) =>
            p.photo_reference ? buildGooglePhotoUrl(p.photo_reference, 500) : ""
          )
          .filter(Boolean);

        return {
          id: r.place_id,
          name: r.name,
          address: r.formatted_address ?? r.vicinity ?? "Nairobi",
          category: rawType,
          lat,
          lng,
          rating: r.rating ? Number(r.rating) : undefined,
          reviewCount: r.user_ratings_total
            ? Number(r.user_ratings_total)
            : undefined,
          openNow: r.opening_hours?.open_now,
          distanceM: dist,
          photos,
        };
      });
    } catch {
      return [];
    }
  },

  /**
   * Google Place Details with photos, rating, formatted address, and phone number.
   */
  async getPlaceDetails(placeId: string): Promise<{
    lat: number;
    lng: number;
    name: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    openNow?: boolean;
    photos?: string[];
    /** Google's place types, most specific first. */
    types: string[];
    /** The label for them ("Restaurant", "Address"): picks the place's badge. */
    category: string;
  } | null> {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
          placeId
        )}&fields=geometry,name,formatted_address,rating,user_ratings_total,opening_hours,photos,types&key=${GOOGLE_KEY}`
      );
      const json = await res.json();
      const r = json.result;
      if (!r?.geometry?.location) return null;

      const photos: string[] = (r.photos ?? [])
        .slice(0, 4)
        .map((p: any) =>
          p.photo_reference ? buildGooglePhotoUrl(p.photo_reference, 600) : ""
        )
        .filter(Boolean);

      return {
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        name: r.name ?? "",
        address: r.formatted_address ?? "",
        rating: r.rating ? Number(r.rating) : undefined,
        reviewCount: r.user_ratings_total
          ? Number(r.user_ratings_total)
          : undefined,
        openNow: r.opening_hours?.open_now,
        photos,
        types: Array.isArray(r.types) ? r.types : [],
        category: labelForGoogleTypes(r.types),
      };
    } catch {
      return null;
    }
  },

  /**
   * Uses Google Reverse Geocoding first for accurate local names, with Mapbox as fallback.
   */
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    if (GOOGLE_KEY) {
      try {
        const gRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&key=${GOOGLE_KEY}`
        );
        const gJson = await gRes.json();
        const first = gJson.results?.[0];
        if (first) {
          const neighborhood = first.address_components?.find((c: any) =>
            c.types?.some((t: string) =>
              [
                "sublocality",
                "sublocality_level_1",
                "neighborhood",
                "route",
                "premise",
              ].includes(t)
            )
          );
          const locality = first.address_components?.find((c: any) =>
            c.types?.includes("locality")
          );
          if (neighborhood && locality) {
            return `${neighborhood.long_name}, ${locality.long_name}`;
          }
          return (
            first.formatted_address?.split(",").slice(0, 2).join(", ") ??
            `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          );
        }
      } catch {
        // Fallback to Mapbox below
      }
    }

    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,neighborhood,address,poi&language=en&access_token=${MAPBOX_TOKEN}`
      );
      const json = await res.json();
      const first = json.features?.[0];
      return (
        first?.text ??
        first?.place_name?.split(",")[0] ??
        `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      );
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  },
};