// components/saved/NewListForm.tsx
//
// Make or edit a list: a name, a colour and an icon (KakaoMap's folder
// colours), with a live preview of its tile.
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import {
  LIST_COLORS,
  LIST_ICONS,
  cleanListName,
  type ListIcon,
} from "@/store/savedListsStore";
import { ListTile } from "./ListTile";

const ORANGE = "#FF6F00";

export interface ListDraft {
  name: string;
  color: string;
  icon: ListIcon;
}

export function NewListForm({
  initial,
  submitLabel = "Create list",
  dark,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ListDraft>;
  submitLabel?: string;
  dark: boolean;
  /** Shown under the name ("You already have a list called…"). */
  error?: string | null;
  onSubmit: (draft: ListDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? LIST_COLORS[7]);
  const [icon, setIcon] = useState<ListIcon>(initial?.icon ?? "bookmark");
  const ok = cleanListName(name).length > 0;

  const C = {
    text: dark ? "#F4F4F5" : "#111827",
    sub: dark ? "#A1A1AA" : "#6B7280",
    field: dark ? "#27272A" : "#F3F4F6",
    ring: dark ? "#F4F4F5" : "#111827",
  };

  return (
    <View style={s.wrap}>
      <View style={s.nameRow}>
        <ListTile icon={icon} color={color} size={44} solid />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="List name"
          placeholderTextColor={C.sub}
          autoFocus
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => ok && onSubmit({ name, color, icon })}
          style={[s.input, { color: C.text, backgroundColor: C.field }]}
          accessibilityLabel="List name"
        />
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}

      <Text style={[s.label, { color: C.sub }]}>COLOUR</Text>
      <View style={s.swatches}>
        {LIST_COLORS.map((c) => (
          <PressableScale
            key={c}
            onPress={() => { Haptics.selectionAsync(); setColor(c); }}
            style={[s.swatch, { backgroundColor: c, borderColor: color === c ? C.ring : "transparent" }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: color === c }}
            accessibilityLabel={`Colour ${c}`}
          >
            {color === c ? <Icon name="checkmark" size={14} color="#FFFFFF" /> : null}
          </PressableScale>
        ))}
      </View>

      <Text style={[s.label, { color: C.sub }]}>ICON</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.icons}>
        {LIST_ICONS.map((i) => (
          <PressableScale
            key={i}
            onPress={() => { Haptics.selectionAsync(); setIcon(i); }}
            style={[s.iconBtn, { backgroundColor: icon === i ? color : C.field }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: icon === i }}
            accessibilityLabel={`Icon ${i}`}
          >
            <Icon name={i} size={18} color={icon === i ? "#FFFFFF" : C.sub} />
          </PressableScale>
        ))}
      </ScrollView>

      <View style={s.buttons}>
        <PressableScale onPress={onCancel} style={[s.btn, { backgroundColor: C.field }]} containerStyle={{ flex: 1 }}>
          <Text style={[s.btnText, { color: C.text }]}>Cancel</Text>
        </PressableScale>
        <PressableScale
          onPress={() => ok && onSubmit({ name, color, icon })}
          style={[s.btn, { backgroundColor: ok ? ORANGE : C.field }]}
          containerStyle={{ flex: 1.4 }}
          accessibilityState={{ disabled: !ok }}
        >
          <Text style={[s.btnText, { color: ok ? "#FFFFFF" : C.sub }]}>{submitLabel}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, paddingVertical: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: { flex: 1, height: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, fontWeight: "600" },
  error: { color: "#DC2626", fontSize: 13, marginLeft: 56 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginTop: 4 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  icons: { gap: 8, paddingRight: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttons: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 15, fontWeight: "700" },
});
