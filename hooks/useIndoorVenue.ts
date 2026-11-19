// hooks/useIndoorVenue.ts
//
// The venue the map is looking at, once zoomed in close enough: the live
// venue nearest the centre, loaded once per published version. It stays
// while the map zooms out a little (no flicker at the edge) and comes back
// at once from cache. Each venue remembers the level the rider picked.
import { useCallback, useEffect, useRef, useState } from "react";
import { VenueService, type IndoorVenue } from "@/services/venues";
import { bboxAround, defaultLevel, INDOOR_KEEP_ZOOM, INDOOR_MIN_ZOOM, pickVenue } from "@/utils/indoor";

export interface IndoorState {
  venue: IndoorVenue | null;
  levelId: string | null;
  setLevelId: (id: string) => void;
}

export function useIndoorVenue(
  center: { lat: number; lng: number } | null,
  zoom: number,
  enabled: boolean
): IndoorState {
  const [venue, setVenue] = useState<IndoorVenue | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const reqId = useRef(0);

  const shown = enabled && zoom >= (venue ? INDOOR_KEEP_ZOOM : INDOOR_MIN_ZOOM);
  // Rounded so small pans reuse the last answer (and the box cache).
  const lat = center ? Math.round(center.lat * 1000) / 1000 : null;
  const lng = center ? Math.round(center.lng * 1000) / 1000 : null;
  const z = Math.max(INDOOR_MIN_ZOOM, Math.round(zoom));

  useEffect(() => {
    if (!shown || lat == null || lng == null) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const here = { lat, lng };
        const [s, w, n, e] = bboxAround(here, z);
        const pick = pickVenue(await VenueService.inView(s, w, n, e), here);
        if (id !== reqId.current) return;
        if (!pick) { setVenue(null); return; }
        const snap = await VenueService.get(pick.id, pick.version);
        if (id !== reqId.current) return;
        setVenue(snap);
      } catch {
        // No indoor map is better than an error: the street map still works.
      }
    }, 450);
    return () => clearTimeout(t);
  }, [shown, lat, lng, z]);

  const current = shown ? venue : null;
  const uuid = current?.venue.uuid ?? null;
  const own = uuid ? picked[uuid] : undefined;
  const levelId = current
    ? own && current.levels.some((l) => l.id === own) ? own : defaultLevel(current)
    : null;

  const setLevelId = useCallback((lid: string) => {
    if (uuid) setPicked((p) => ({ ...p, [uuid]: lid }));
  }, [uuid]);

  return { venue: current, levelId, setLevelId };
}
