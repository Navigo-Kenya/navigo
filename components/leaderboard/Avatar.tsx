// components/leaderboard/Avatar.tsx
//
// A person on a board: their photo, or their initials on the ring's
// colour, inside a ring (a metal on the podium, the level elsewhere).
// Inline data: avatars are skipped: too heavy for a list of 50.
import { Image } from "expo-image";
import React from "react";
import { Text, View } from "react-native";

export const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

export function Avatar({ person, size, ring }: { person: { name: string; avatar: string | null }; size: number; ring: string }) {
  const img = person.avatar && !person.avatar.startsWith("data:") ? person.avatar : null;
  return (
    <View style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, borderWidth: 3, borderColor: ring, alignItems: "center", justifyContent: "center" }}>
      {img ? (
        <Image source={{ uri: img }} style={{ width: size - 2, height: size - 2, borderRadius: size / 2 }} contentFit="cover" />
      ) : (
        <View style={{ width: size - 2, height: size - 2, borderRadius: size / 2, backgroundColor: ring, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: size * 0.36 }}>{initials(person.name)}</Text>
        </View>
      )}
    </View>
  );
}
