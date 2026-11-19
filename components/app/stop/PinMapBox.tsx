// components/app/stop/PinMapBox.tsx
//
// A small map with a fixed pin: drag the map under it to place something
// (where a stop really is, a stage that's missing). The locate button
// jumps to where the rider stands. Used by StopEditForm and NewStopForm.
import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, useColorScheme } from "react-native";
import * as Location from "expo-location";
import { Camera as MapboxCamera, MapView as MapboxMapView } from "@rnmapbox/maps";
import { Icon } from "@/components/icons/Icon";

const BLUE = "#2563EB";
const ORANGE = "#FF6F00";

export interface PinMapBoxHandle {
  /** Moves the map, and so the pin, to a point. */
  moveTo: (lat: number, lng: number, zoom?: number) => void;
}

export const PinMapBox = forwardRef<
  PinMapBoxHandle,
  {
    initial: { lat: number; lng: number };
    onMove: (p: { lat: number; lng: number }) => void;
    zoom?: number;
    height?: number;
    /** The locate button's background (the form's). */
    buttonBg: string;
  }
>(function PinMapBox({ initial, onMove, zoom = 17.5, height = 190, buttonBg }, ref) {
  const dark = useColorScheme() === "dark";
  const cameraRef = useRef<MapboxCamera>(null);
  const [gps, setGps] = useState(false);

  const moveTo = (lat: number, lng: number, z = 18) => {
    onMove({ lat, lng });
    cameraRef.current?.setCamera({ centerCoordinate: [lng, lat], zoomLevel: z, animationDuration: 450 });
  };
  useImperativeHandle(ref, () => ({ moveTo }));

  const locate = async () => {
    setGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location is off", "Allow location access to use where you're standing.");
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      moveTo(p.coords.latitude, p.coords.longitude);
    } catch {
      Alert.alert("Couldn't get your location", "Please try again outside.");
    } finally {
      setGps(false);
    }
  };

  return (
    <View style={[s.box, { height }]}>
      <MapboxMapView
        style={StyleSheet.absoluteFill}
        styleURL={dark ? "mapbox://styles/mapbox/dark-v11" : process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? "mapbox://styles/mapbox/streets-v12"}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onRegionDidChange={(f: any) => {
          const [lng, lat] = f?.geometry?.coordinates ?? [];
          if (Number.isFinite(lat) && Number.isFinite(lng)) onMove({ lat, lng });
        }}
      >
        <MapboxCamera ref={cameraRef} defaultSettings={{ centerCoordinate: [initial.lng, initial.lat], zoomLevel: zoom }} />
      </MapboxMapView>
      {/* Fixed pin: the map moves under it. */}
      <View pointerEvents="none" style={s.pinWrap}>
        <Icon name="location" size={38} color={ORANGE} style={{ marginBottom: 30 }} />
      </View>
      <Pressable
        onPress={locate}
        style={[s.gpsBtn, { backgroundColor: buttonBg }]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Use where I'm standing"
      >
        {gps ? <ActivityIndicator size="small" color={BLUE} /> : <Icon name="locate" size={18} color={BLUE} />}
      </Pressable>
    </View>
  );
});

const s = StyleSheet.create({
  box: { borderRadius: 14, overflow: "hidden" },
  pinWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  gpsBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
});
