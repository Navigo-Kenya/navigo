// utils/streetModes.ts
// Journeys on the street network (no timetable): walk, bike, car, boda.

export const STREET_MODES = ["WALK", "BICYCLE", "CAR", "MOTORBIKE"] as const;
export type StreetMode = (typeof STREET_MODES)[number];

export function isStreetMode(mode?: string | null): mode is StreetMode {
  return STREET_MODES.includes(String(mode ?? "").toUpperCase() as StreetMode);
}

/** The verb for an instruction on this mode ("Ride to Sarit Centre"). */
export function streetVerb(mode?: string | null): "Drive" | "Ride" | "Cycle" | "Walk" {
  switch (String(mode ?? "").toUpperCase()) {
    case "CAR": return "Drive";
    case "MOTORBIKE": return "Ride";
    case "BICYCLE": return "Cycle";
    default: return "Walk";
  }
}
