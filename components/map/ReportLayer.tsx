// components/map/ReportLayer.tsx
import type { TransitReport } from "@/services/report";
import { Ionicons } from "@expo/vector-icons";
import { PointAnnotation } from "@rnmapbox/maps";
import React, { forwardRef, memo, useImperativeHandle, useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { MapView } from "@rnmapbox/maps";

// Must stay in sync with ReportSheet CATS and ReportDetailCard CAT
const CAT: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  traffic_jam:   { icon: "car-outline",          color: "#FF6F00" },
  accident:      { icon: "alert-circle-outline", color: "#FF3B30" },
  road_blocked:  { icon: "close-circle-outline", color: "#FF2D55" },
  stage_queue:   { icon: "people-outline",       color: "#FF9500" },
  police_check:  { icon: "shield-outline",       color: "#007AFF" },
  flooded_route: { icon: "water-outline",        color: "#5856D6" },
  breakdown:     { icon: "build-outline",        color: "#AF52DE" },
  security:      { icon: "alert-outline",        color: "#D32F2F" },
  fare_hike:     { icon: "trending-up-outline",  color: "#30B050" },
};

const PIN = 34; // pin diameter
const WRAP = 44; // touch target
const MIN_ZOOM_VISIBILITY = 11.5;

const CLUSTER_DEG = 30 / 111_320;

interface Group { primary: TransitReport; count: number }

function clusterReports(reports: TransitReport[]): Group[] {
  const sorted = [...reports].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const used = new Set<string>();
  const groups: Group[] = [];

  for (const r of sorted) {
    if (used.has(r.id)) continue;
    used.add(r.id);
    let count = 1;
    for (const other of sorted) {
      if (used.has(other.id)) continue;
      if (
        Math.abs(r.lat - other.lat) < CLUSTER_DEG &&
        Math.abs(r.lng - other.lng) < CLUSTER_DEG
      ) {
        used.add(other.id);
        count++;
      }
    }
    groups.push({ primary: r, count });
  }

  return groups;
}

export interface ReportLayerHandle {
  project(): void; 
}

interface ReportLayerProps {
  reports:  TransitReport[];
  mapRef:   React.RefObject<MapView | null>;
  viewZoom?: number; 
  onPress:  (report: TransitReport, count: number) => void;
}

export const ReportLayer = memo(forwardRef<ReportLayerHandle, ReportLayerProps>(
  function ReportLayer({ reports, viewZoom = 13, onPress }, ref) {
    
    useImperativeHandle(ref, () => ({ project: () => {} }), []);

    const groups = useMemo(() => clusterReports(reports), [reports]);

    if (viewZoom < MIN_ZOOM_VISIBILITY || groups.length === 0) return null;

    return (
      <>
        {groups.map((g) => (
          <ReportPin
            key={g.primary.id}
            report={g.primary}
            count={g.count}
            onPress={() => onPress(g.primary, g.count)}
          />
        ))}
      </>
    );
  }
));

const ReportPin = memo(function ReportPin({
  report, count, onPress,
}: {
  report: TransitReport; count: number; onPress: () => void;
}) {
  // 🛠️ FIX 3: Absolute safety guard against Mapbox native crashes
  if (typeof report.lng !== "number" || typeof report.lat !== "number" || isNaN(report.lng) || isNaN(report.lat)) {
    return null;
  }

  const meta = CAT[report.type] ?? { icon: "warning-outline" as const, color: "#FF9500" };
  
  return (
    <PointAnnotation
      id={`report-${report.id}`}
      coordinate={[report.lng, report.lat]}
      onSelected={onPress}
      // Ensure zIndex keeps it above map layers
      style={{ zIndex: 10 }}
    >
      <View style={s.pinWrap}>
        <View style={[s.pin, { backgroundColor: meta.color }]}>
          <Ionicons name={meta.icon} size={15} color="#fff" />
        </View>
        {count > 1 && (
          <View style={[s.badge, { borderColor: meta.color }]}>
            <Text style={[s.badgeText, { color: meta.color }]}>
              {count > 9 ? "9+" : String(count)}
            </Text>
          </View>
        )}
      </View>
    </PointAnnotation>
  );
});

const s = StyleSheet.create({
  pinWrap: {
    width: WRAP, height: WRAP,
    alignItems: "center", justifyContent: "center",
  },
  pin: {
    width: PIN, height: PIN, borderRadius: PIN / 2,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2.5, borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor:   "#000",
        shadowOpacity: 0.22,
        shadowRadius:  4,
        shadowOffset:  { width: 0, height: 2 },
      },
      android: { elevation: 5 },
    }),
  },
  badge: {
    position: "absolute", top: 2, right: 2,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: "#FFFFFF", borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3,
    ...Platform.select({ android: { elevation: 6 } }),
  },
  badgeText: { fontSize: 9, fontWeight: "800", lineHeight: 11 },
});