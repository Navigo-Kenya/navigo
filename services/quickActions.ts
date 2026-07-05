// services/quickActions.ts
// Home-screen long-press shortcuts ("Go home", "Go to work", "Ask Kwame").
// Items deep-link into expo-router via expo-quick-actions' router integration
// (useQuickActionRouting in app/_layout.tsx reads params.href).
import * as QuickActions from "expo-quick-actions";
import { Platform } from "react-native";
import { useSavedStore } from "@/store/savedStore";

interface PinPlace {
  name: string;
  lat: number;
  lng: number;
}

function destinationHref(place: PinPlace, label: string): string {
  return `/search?tLat=${place.lat}&tLng=${place.lng}&tName=${encodeURIComponent(label)}`;
}

/** Rebuild the OS shortcut list from the user's saved pins. Fail-soft. */
export async function syncQuickActions(): Promise<void> {
  try {
    const places = useSavedStore.getState().places ?? [];
    const home = places.find((p: any) => p.pin === "home");
    const work = places.find((p: any) => p.pin === "work");

    const items: QuickActions.Action[] = [];

    if (home) {
      items.push({
        id: "go-home",
        title: "Go home",
        subtitle: home.name,
        icon: Platform.OS === "ios" ? "symbol:house.fill" : undefined,
        params: { href: destinationHref(home, "Home") },
      });
    }
    if (work) {
      items.push({
        id: "go-work",
        title: "Go to work",
        subtitle: work.name,
        icon: Platform.OS === "ios" ? "symbol:briefcase.fill" : undefined,
        params: { href: destinationHref(work, "Work") },
      });
    }
    items.push({
      id: "ask-kwame",
      title: "Ask Kwame",
      subtitle: "AI trip planner",
      icon: Platform.OS === "ios" ? "symbol:sparkles" : undefined,
      params: { href: "/kwame" },
    });
    items.push({
      id: "plan-journey",
      title: "Plan a journey",
      icon: Platform.OS === "ios" ? "symbol:magnifyingglass" : undefined,
      params: { href: "/search" },
    });

    await QuickActions.setItems(items);
  } catch {
    // Shortcuts are decorative — never crash over them.
  }
}
