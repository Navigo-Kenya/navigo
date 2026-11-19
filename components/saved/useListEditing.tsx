// components/saved/useListEditing.tsx
//
// Editing a saved list, wherever it's shown (the Saved tab, a list's own
// screen): rename it (custom lists), restyle it (colour, icon), delete it
// (its places leave this list only). `element` goes once in the screen.
import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSavedStore } from "@/store/savedStore";
import { useSavedListsStore, type SavedListMeta } from "@/store/savedListsStore";
import { NewListForm, type ListDraft } from "./NewListForm";

export function useListEditing(lists: SavedListMeta[], countOf: (key: string) => number) {
  const dark = useColorScheme() === "dark";
  const { renameList, deleteListPlaces } = useSavedStore();
  const { update, remove } = useSavedListsStore();
  const [editing, setEditing] = useState<SavedListMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [editing]);

  const save = async (d: ListDraft): Promise<string | null> => {
    if (!editing) return null;
    const name = d.name.replace(/\s+/g, " ").trim();
    const renamed = !editing.builtIn && name && name !== editing.name;
    if (renamed && lists.some((l) => l.key !== editing.key && (l.name.toLowerCase() === name.toLowerCase() || l.key.toLowerCase() === name.toLowerCase()))) {
      return "You already have a list with this name.";
    }
    if (renamed) {
      try {
        await renameList(editing.key, name);
      } catch {
        return "Couldn't rename the list. Check your connection.";
      }
      remove(editing.key);
      update(name, { name, color: d.color, icon: d.icon });
    } else {
      update(editing.key, { color: d.color, icon: d.icon });
    }
    setEditing(null);
    return null;
  };

  /** Asks first; `after` runs once it's gone (a list screen goes back). */
  const confirmDelete = (l: SavedListMeta, after?: () => void) => {
    const n = countOf(l.key);
    Alert.alert(
      `Delete "${l.name}"?`,
      n ? `Its ${n} saved place${n === 1 ? "" : "s"} will be removed from this list. Places in other lists stay there.` : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteListPlaces(l.key).catch(() => {});
            remove(l.key);
            after?.();
          },
        },
      ]
    );
  };

  const element = (
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} />
        {editing ? (
          <View style={[s.card, { backgroundColor: dark ? "#18181B" : "#FFFFFF" }]}>
            <Text style={[s.title, { color: dark ? "#F4F4F5" : "#111827" }]}>
              {editing.builtIn ? `Style "${editing.name}"` : "Edit list"}
            </Text>
            <NewListForm
              dark={dark}
              initial={{ name: editing.name, color: editing.color, icon: editing.icon }}
              submitLabel="Save"
              error={error}
              onCancel={() => setEditing(null)}
              onSubmit={async (d) => setError(await save(d))}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );

  return { edit: setEditing, confirmDelete, element };
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,0.4)" },
  card: { borderRadius: 22, padding: 18, gap: 6 },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
});
