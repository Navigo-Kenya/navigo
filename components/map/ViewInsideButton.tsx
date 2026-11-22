// components/map/ViewInsideButton.tsx
//
// "Inside": the way into a place's or a station's indoor map from its sheet.
// It looks for a published venue at the spot; with one, the map flies there
// and the indoor map opens (it shows from zoom 16). Without one, it says
// plainly that the inside isn't mapped yet.
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { NavigoIcon } from "@/components/icons/NavigoIcon";
import { PressableScale } from "@/components/ui/PressableScale";
import { VenueService, type VenueInView } from "@/services/venues";
import { pickVenue } from "@/utils/indoor";

/** A venue counts as this place's inside when its point is this close. */
const SAME_PLACE_M = 250;

/** The published venue at a point: a venue, null (none), or undefined while looking. */
function useVenueAt(lat: number, lng: number): VenueInView | null | undefined {
  const [venue, setVenue] = useState<VenueInView | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setVenue(undefined);
    const d = 0.004;
    VenueService.inView(lat - d, lng - d, lat + d, lng + d)
      .then((list) => live && setVenue(pickVenue(list, { lat, lng }, SAME_PLACE_M)))
      .catch(() => live && setVenue(null));
    return () => { live = false; };
  }, [lat, lng]);
  return venue;
}

export function ViewInsideButton({ lat, lng, name, onGoInside, chip, text, sub, size = 42 }: {
  lat: number;
  lng: number;
  name: string;
  /** Fly the map to the venue (the indoor map opens on its own). */
  onGoInside: (lat: number, lng: number) => void;
  chip: string;
  text: string;
  sub: string;
  size?: number;
}) {
  const venue = useVenueAt(lat, lng);
  const ready = !!venue;

  const press = () => {
    Haptics.selectionAsync();
    if (venue) return onGoInside(venue.lat, venue.lng);
    Alert.alert(
      "Indoor map not available yet",
      venue === undefined
        ? `Still checking whether ${name} has an indoor map. Try again in a moment.`
        : `We haven't mapped the inside of ${name} yet, so there are no floors, shops or entrances to show. Indoor maps are coming to more stations, malls and markets.`,
    );
  };

  return (
    <PressableScale onPress={press} hitSlop={4} style={s.wrap} accessibilityRole="button"
      accessibilityLabel={ready ? `View inside ${name}` : `Indoor map not available for ${name}`}>
      <View style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: chip, opacity: ready ? 1 : 0.55 }]}>
        <NavigoIcon name="entrance" size={18} color={ready ? text : sub} />
      </View>
      <Text style={[s.label, { color: ready ? sub : sub + "99" }]}>Inside</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", gap: 5, minWidth: 56 },
  circle: { alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11.5, fontWeight: "600" },
});
