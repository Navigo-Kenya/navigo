// services/here.ts
//
// Where the phone is, without asking: for the screens that only use the
// position to help (distances, "near you"), never worth a permission
// prompt. Null when location isn't allowed or doesn't come quickly.
import * as Location from "expo-location";

export type LatLng = { lat: number; lng: number };

export async function hereWithoutAsking(timeoutMs = 6000): Promise<LatLng | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 500 });
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    const now = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return now ? { lat: now.coords.latitude, lng: now.coords.longitude } : null;
  } catch {
    return null;
  }
}
