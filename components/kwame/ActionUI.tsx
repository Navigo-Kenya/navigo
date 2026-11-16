import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LocationResolutionAction } from '../../services/ai';

interface Props {
  msg: any;
  C: any;
  router: any;
  onSelectPlace: (
    name: string,
    lat: number,
    lng: number,
    action: LocationResolutionAction
  ) => void;
}

export default function ActionUI({ msg, C, router, onSelectPlace }: Props) {
  if (!msg.actionRequired) return null;
  const action = msg.actionRequired;
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!action.isAuthenticated) {
    return (
      <View
        style={[
          styles.actionCardContainer,
          { backgroundColor: C.bg, borderColor: C.border },
        ]}
      >
        <Text style={[styles.actionCardTitle, { color: C.text }]}>
          Sign in to access saved places
        </Text>
        <Text style={[styles.actionCardDesc, { color: C.sub }]}>
          Log in to route using your custom saved locations (Home, Work, Gym, etc.).
        </Text>
        <TouchableOpacity
          style={[styles.primaryCtaBtn, { backgroundColor: C.text }]}
          onPress={() => router.push('/login')}
        >
          <Text style={[styles.primaryCtaText, { color: C.bg }]}>
            Sign In to Account
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.actionCardContainer,
        { backgroundColor: C.bg, borderColor: C.border },
      ]}
    >
      <Text style={[styles.actionCardTitle, { color: C.text }]}>
        Where should "{action.unresolvedName}" resolve to?
      </Text>

      {action.savedPlaces.length === 0 ? (
        <TouchableOpacity
          style={[styles.primaryCtaBtn, { backgroundColor: C.text, marginTop: 8 }]}
          onPress={() => router.push('/settings')}
        >
          <Text style={[styles.primaryCtaText, { color: C.bg }]}>
            + Add a Saved Place
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          {action.savedPlaces.map((place: any, idx: number) => {
            const isSelected = selectedIdx === idx;
            return (
              <TouchableOpacity
                key={place.id || idx}
                style={styles.radioRow}
                activeOpacity={0.7}
                onPress={() => setSelectedIdx(idx)}
              >
                <View
                  style={[
                    styles.radioOuter,
                    {
                      borderColor: isSelected ? C.text : C.borderStrong,
                      backgroundColor: isSelected ? C.text : 'transparent',
                    },
                  ]}
                >
                  {isSelected && (
                    <View style={[styles.radioInner, { backgroundColor: C.bg }]} />
                  )}
                </View>
                <Text style={[styles.radioLabel, { color: C.text }]}>
                  {place.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.primaryCtaBtn, { backgroundColor: C.text, marginTop: 14 }]}
            activeOpacity={0.85}
            onPress={() => {
              const chosen = action.savedPlaces[selectedIdx] || action.savedPlaces[0];
              if (chosen) onSelectPlace(chosen.name, chosen.lat, chosen.lng, action);
            }}
          >
            <Text style={[styles.primaryCtaText, { color: C.bg }]}>
              Get detailed directions
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actionCardContainer: {
    width: '100%',
    marginTop: 12,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  actionCardDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  radioLabel: {
    fontSize: 15.5,
    fontWeight: '400',
  },
  primaryCtaBtn: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    fontSize: 15,
    fontWeight: '600',
  },
});