// utils/departures.ts
//
// Wording for departure boards. The API only sends real timetable data:
// stops_away is null for headway-based trips, crowding is null until there
// is an occupancy feed, and empty lists come with an arrivals_status.
import { sToMin } from "./mapHelpers";

export type ArrivalsStatus = "scheduled" | "ended" | "terminates_here" | "not_running_today";

export interface DepartureLike {
  stops_away?: number | null;
  crowding?: string | null;
  headway_secs?: number | null;
  source?: "schedule" | "frequency" | string;
}

/**
 * Secondary line under a departure time, built only from data we have:
 * "Starts here", "3 stops away", "Every 15min", plus crowding when known.
 * Returns "" when there's nothing real to say.
 */
export function departureMeta(dep: DepartureLike): string {
  const parts: string[] = [];
  if (dep.stops_away != null) {
    parts.push(
      dep.stops_away === 0
        ? "Starts here"
        : `${dep.stops_away} stop${dep.stops_away === 1 ? "" : "s"} away`
    );
  } else if (dep.headway_secs) {
    parts.push(`Every ${sToMin(dep.headway_secs)}`);
  }
  if (dep.crowding) parts.push(dep.crowding);
  return parts.join(" · ");
}

export interface StatusCopy {
  title: string;
  icon: "moon-outline" | "flag-outline" | "calendar-outline" | "time-outline";
  tone: "neutral" | "info";
}

/** Why a line has no departures to show at this stop. */
export function arrivalsStatusCopy(status?: ArrivalsStatus | string | null): StatusCopy {
  switch (status) {
    case "ended":
      return { title: "No more departures today", icon: "moon-outline", tone: "neutral" };
    case "terminates_here":
      return { title: "Terminates here", icon: "flag-outline", tone: "info" };
    case "not_running_today":
      return { title: "Not running today", icon: "calendar-outline", tone: "neutral" };
    default:
      return { title: "No timetable yet", icon: "time-outline", tone: "neutral" };
  }
}
