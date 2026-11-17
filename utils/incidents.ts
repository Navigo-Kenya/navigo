// utils/incidents.ts
// Live TomTom incidents on the map: jams become coloured road lines, the
// rest become pins in the report layer, drawn with our own report artwork.
import type { ReportType } from "@/components/icons/reportIcons";
import type { MapIncident, TransitReport } from "@/services/report";

/** Pin artwork for each incident type; jams are drawn as lines instead. */
const PIN_TYPE: Record<Exclude<MapIncident["type"], "jam">, ReportType> = {
  accident:            "accident",
  road_closed:         "road_blocked",
  lane_closed:         "road_blocked",
  roadworks:           "road_blocked",
  flooding:            "flooded_route",
  broken_down_vehicle: "breakdown",
  incident:            "road_blocked",
};

/** Plain titles for the incident card. */
export const INCIDENT_TITLE: Record<MapIncident["type"], string> = {
  jam:                 "Traffic jam",
  accident:            "Accident",
  road_closed:         "Road closed",
  lane_closed:         "Lane closed",
  roadworks:           "Roadworks",
  flooding:            "Flooding",
  broken_down_vehicle: "Broken-down vehicle",
  incident:            "Incident",
};

export interface JamLine {
  id: string;
  level: 1 | 2;
  /** [lng, lat] pairs, ready for GeoJSON. */
  coordinates: [number, number][];
}

const finite = (p?: [number, number] | null): p is [number, number] =>
  !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * Split incidents into report-layer pins and jam lines. Pins look like
 * reports (so clustering and taps just work) but carry `source: "tomtom"`,
 * no votes and a timestamp of 0, so a tapped cluster opens the newest
 * community report first.
 */
export function splitIncidents(incidents: MapIncident[]): { pins: TransitReport[]; jams: JamLine[] } {
  const pins: TransitReport[] = [];
  const jams: JamLine[] = [];
  for (const inc of incidents) {
    if (inc.type === "jam") {
      const coords = (inc.line ?? []).filter(finite).map(([lat, lng]) => [lng, lat] as [number, number]);
      if (coords.length >= 2) jams.push({ id: inc.id, level: inc.level, coordinates: coords });
      continue;
    }
    if (!finite(inc.point)) continue;
    pins.push({
      id: `tomtom:${inc.id}`,
      type: PIN_TYPE[inc.type] ?? "road_blocked",
      lat: inc.point[0],
      lng: inc.point[1],
      upvotes: 0,
      downvotes: 0,
      created_at: "",
      expires_at: "",
      reporter: null,
      source: "tomtom",
      incident: inc,
    });
  }
  return { pins, jams };
}

/** "Mbagathi Way → Ngong Road", or whichever end is known. */
export function incidentWhere(inc: Pick<MapIncident, "from" | "to" | "road">): string | null {
  if (inc.from && inc.to) return `${inc.from} → ${inc.to}`;
  return inc.from ?? inc.to ?? inc.road ?? null;
}
