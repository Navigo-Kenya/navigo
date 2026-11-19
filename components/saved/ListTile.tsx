// components/saved/ListTile.tsx
//
// A list's coloured tile (KakaoMap's folder colours): the list's icon on a
// tint of its colour, or on the solid colour when selected.
import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/icons/Icon";
import type { ListIcon } from "@/store/savedListsStore";

export function ListTile({
  icon,
  color,
  size = 40,
  solid = false,
}: {
  icon: ListIcon;
  color: string;
  size?: number;
  solid?: boolean;
}) {
  return (
    <View
      style={[
        s.tile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: solid ? color : color + "1F",
        },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={solid ? "#FFFFFF" : color} />
    </View>
  );
}

const s = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
});
