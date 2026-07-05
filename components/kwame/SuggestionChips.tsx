// components/kwame/SuggestionChips.tsx
// Tappable quick-reply chips shown under a Kwame message when the assistant
// calls suggest_replies (unclear/open-ended requests).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ORANGE = '#FF6F00';

export default function SuggestionChips({ suggestions, C, onPress, disabled = false }: {
  suggestions: string[];
  C: any;
  onPress: (suggestion: string) => void;
  disabled?: boolean;
}) {
  if (!suggestions?.length) return null;
  return (
    <View style={styles.wrap}>
      {suggestions.map((s, i) => (
        <TouchableOpacity
          key={`${s}-${i}`}
          style={[styles.chip, { backgroundColor: C.card, borderColor: C.border, opacity: disabled ? 0.5 : 1 }]}
          activeOpacity={0.7}
          disabled={disabled}
          onPress={() => onPress(s)}
        >
          <Ionicons name="arrow-forward-circle-outline" size={14} color={ORANGE} />
          <Text style={[styles.chipText, { color: C.text }]} numberOfLines={1}>{s}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  chipText: { fontSize: 13, fontWeight: '600' },
});
