// components/kwame/PlaceCard.tsx
// Place suggestion cards rendered under a Kwame message when the assistant
// calls find_places / find_nearby_stops. Horizontal scroller + per-card
// "Directions" action that hands the place back to the chat flow.
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KwamePlace, mapboxThumb } from '../../services/ai';

const ORANGE = '#FF6F00';
const CARD_W = Math.min(Dimensions.get('window').width * 0.62, 250);

function Rating({ rating, count, C }: { rating: number; count?: number | null; C: any }) {
  return (
    <View style={styles.ratingRow}>
      <Ionicons name="star" size={12} color="#FFB300" />
      <Text style={[styles.ratingText, { color: C.text }]}>{rating.toFixed(1)}</Text>
      {count != null && <Text style={[styles.ratingCount, { color: C.sub }]}>({count})</Text>}
    </View>
  );
}

export function PlaceCard({ place, C, onDirections }: {
  place: KwamePlace;
  C: any;
  onDirections: (place: KwamePlace) => void;
}) {
  const isStop = place.category === 'Transit stop';

  return (
    <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={styles.thumbContainer}>
        <Image source={{ uri: mapboxThumb(place.lng, place.lat) }} style={styles.thumb} resizeMode="cover" />
        {place.open_now != null && (
          <View style={[styles.openBadge, { backgroundColor: place.open_now ? '#34C759' : '#FF3B30' }]}>
            <Text style={styles.openBadgeText}>{place.open_now ? 'Open' : 'Closed'}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Ionicons
            name={isStop ? 'bus-outline' : 'location-outline'}
            size={14}
            color={ORANGE}
            style={{ marginTop: 2 }}
          />
          <Text style={[styles.name, { color: C.text }]} numberOfLines={1}>{place.name}</Text>
        </View>

        {place.category ? (
          <Text style={[styles.category, { color: C.sub }]} numberOfLines={1}>{place.category}</Text>
        ) : null}

        {place.rating != null && <Rating rating={place.rating} count={place.ratings_count} C={C} />}

        {place.address ? (
          <Text style={[styles.address, { color: C.sub }]} numberOfLines={2}>{place.address}</Text>
        ) : null}

        <TouchableOpacity
          style={styles.directionsBtn}
          activeOpacity={0.8}
          onPress={() => onDirections(place)}
        >
          <Ionicons name="navigate" size={14} color="#FFFFFF" />
          <Text style={styles.directionsText}>Directions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PlacesScroller({ places, C, onDirections }: {
  places: KwamePlace[];
  C: any;
  onDirections: (place: KwamePlace) => void;
}) {
  if (!places?.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      decelerationRate="fast"
      snapToInterval={CARD_W + 10}
    >
      {places.map((p, i) => (
        <PlaceCard key={`${p.name}-${i}`} place={p} C={C} onDirections={onDirections} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row:           { paddingRight: 12, marginTop: 10 },
  card:          { width: CARD_W, borderRadius: 16, borderWidth: 1, marginRight: 10, overflow: 'hidden' },
  thumbContainer:{ width: '100%', height: 92 },
  thumb:         { width: '100%', height: '100%' },
  openBadge:     { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  openBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  body:          { padding: 12 },
  titleRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  name:          { fontSize: 14, fontWeight: '700', flex: 1 },
  category:      { fontSize: 11, marginTop: 2, marginLeft: 19 },
  ratingRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, marginLeft: 19 },
  ratingText:    { fontSize: 12, fontWeight: '700' },
  ratingCount:   { fontSize: 11 },
  address:       { fontSize: 11, lineHeight: 15, marginTop: 5, marginLeft: 19 },
  directionsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ORANGE, borderRadius: 10, height: 34, marginTop: 10 },
  directionsText:{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
});
