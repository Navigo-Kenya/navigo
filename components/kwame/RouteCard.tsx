import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform, Share, Dimensions } from 'react-native';

const CARD_WIDTH = Dimensions.get('window').width - 28; // matches scrollContent paddingHorizontal: 14
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { mapboxJourneyThumb, TransitLeg } from '../../services/ai';
import { UserService } from '../../services/user';
import { useAuthStore } from '../../store/authStore';
import { usePrefsStore, formatDist } from '../../store/prefsStore';
import { useSavedStore } from '../../store/savedStore'; 
import { useJourneyStore } from '../../store/journeyStore';
import { renderMarkdownText } from '../../utils/markdown';
import { sToMin } from '../../utils/mapHelpers';

interface Props {
  route: any;
  index: number;
  C: any;
}

const ORANGE = "#FF6F00";

// --- SUB-COMPONENT FOR HOOKS & ACTIONS ---
const RouteActions = ({ route, C, startLeg, endLeg }: { route: any; C: any; startLeg: any; endLeg: any }) => {
  const router = useRouter();
  const token = useAuthStore((state: any) => state.token);
  
  const journeys = useSavedStore((state: any) => state.journeys || []);
  const fetchSaved = useSavedStore((state: any) => state.fetch);
  const setJourney = useJourneyStore((state: any) => state.setJourney);
  
  const [saving, setSaving] = useState(false);
  const [savedJourneyId, setSavedJourneyId] = useState<number | null>(null);

  const isSavedLocally = journeys.some((j: any) => 
    j.summary === route.summary &&
    Math.abs(j.duration - route.total_duration) < 10
  );

  useEffect(() => {
    const existingJourney = journeys.find((j: any) => 
      j.summary === route.summary && Math.abs(j.duration - route.total_duration) < 10
    );
    if (existingJourney) setSavedJourneyId(existingJourney.id);
    else setSavedJourneyId(null);
  }, [journeys, route.summary, route.total_duration]);

  const handleSelectRoute = () => {
    const fromLoc = {
      _type: 'location',
      id: startLeg.from?.name || 'Origin',
      name: startLeg.from?.name || 'Origin',
      lat: startLeg.from.lat,
      lng: startLeg.from.lng,
    };
    
    const toLoc = {
      _type: 'location',
      id: endLeg.to?.name || 'Destination',
      name: endLeg.to?.name || 'Destination',
      lat: endLeg.to.lat,
      lng: endLeg.to.lng,
    };

    setJourney(fromLoc, toLoc, route);
    router.push('/'); 
  };

  // Handoff to OS Share Sheet
  const handleShare = async () => {
    // Constructing a stateless, universal HTTPS link
    const fLat = startLeg.from.lat;
    const fLng = startLeg.from.lng;
    const tLat = endLeg.to.lat;
    const tLng = endLeg.to.lng;
    const fName = encodeURIComponent(startLeg.from?.name || 'Origin');
    const tName = encodeURIComponent(endLeg.to?.name || 'Destination');

    // WhatsApp will recognize this as a clickable link
    const url = `https://navigo.co.ke/route?fLat=${fLat}&fLng=${fLng}&tLat=${tLat}&tLng=${tLng}&fName=${fName}&tName=${tName}`;

    try {
      await Share.share({
        message: `Check out this Matatu route to ${endLeg.to?.name || 'your destination'} on Navigo: \n\n${url}`,
        title: 'Shared Route', // Title is primarily used by iOS
      });
    } catch (error) {
      console.error('Share failed', error);
    }
  };

  const executeSave = async (customLabel?: string) => {
    setSaving(true);
    try {
      const result = await UserService.saveJourney({
        label: customLabel || route.summary || 'AI Suggested Route',
        from_name: startLeg.from?.name || 'Origin',
        from_lat: startLeg.from.lat,
        from_lng: startLeg.from.lng,
        from_id: null,
        from_type: 'location',
        to_name: endLeg.to?.name || 'Destination',
        to_lat: endLeg.to.lat,
        to_lng: endLeg.to.lng,
        to_id: null,
        to_type: 'location',
        summary: route.summary || 'Transit Route',
        duration: route.total_duration,
        route: route
      });
      
      setSavedJourneyId(result.id);
      if (fetchSaved) await fetchSaved();
    } catch (err) {
      Alert.alert("Error", "Could not save the journey. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const executeUnsave = async () => {
    if (!savedJourneyId) return;
    setSaving(true);
    try {
      await UserService.deleteJourney(savedJourneyId);
      setSavedJourneyId(null);
      if (fetchSaved) await fetchSaved();
    } catch (err) {
      Alert.alert("Error", "Could not remove the journey.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveJourney = async () => {
    if (!token) {
      Alert.alert("Authentication Required", "Please sign in to save this journey to your account.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push('/login') }
      ]);
      return;
    }

    if (saving) return;

    if (isSavedLocally || savedJourneyId) {
      await executeUnsave();
      return;
    }

    if (Platform.OS === 'ios') {
      Alert.prompt(
        "Save journey",
        "Add an optional label (e.g. \"Work commute\")",
        async (text) => await executeSave(text?.trim()),
        "plain-text",
        ""
      );
    } else {
      await executeSave();
    }
  };

  return (
    <View style={styles.actionsRow}>
      <TouchableOpacity 
        style={[styles.selectRouteZone, { backgroundColor: ORANGE }]}
        onPress={handleSelectRoute}
        activeOpacity={0.8}
      >
        <Text style={styles.selectRouteText}>Select Route</Text>
        <Ionicons name="arrow-forward-circle" size={18} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.secondaryActions}>
        <TouchableOpacity 
          style={[styles.iconActionBtn, { borderColor: C.border }]}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={20} color={C.text} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.iconActionBtn, 
            { borderColor: (isSavedLocally || savedJourneyId) ? ORANGE : C.border, backgroundColor: (isSavedLocally || savedJourneyId) ? `${ORANGE}15` : 'transparent' }
          ]}
          onPress={handleSaveJourney}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={ORANGE} />
          ) : (
            <Ionicons name={(isSavedLocally || savedJourneyId) ? "bookmark" : "bookmark-outline"} size={20} color={(isSavedLocally || savedJourneyId) ? ORANGE : C.text} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- MAIN ROUTE CARD COMPONENT ---
export default function RouteCard({ route, index, C }: Props) {
  const legs = route.legs || route.segments || [];
  if (legs.length === 0) return null;

  const { prefs } = usePrefsStore();

  const startLeg = legs[0];
  const endLeg = legs[legs.length - 1];
  
  const mapUrl = startLeg?.from && endLeg?.to 
    ? mapboxJourneyThumb(startLeg.from.lng, startLeg.from.lat, endLeg.to.lng, endLeg.to.lat) 
    : null;

  const totalDistanceStr = route.total_distance 
    ? formatDist(route.total_distance, prefs?.units || 'km') 
    : '';

  return (
    <View key={`route-${index}`} style={[styles.routeCard, { backgroundColor: C.card, borderColor: C.border }]}>

      <View style={styles.cardContent}>
        {/* Route Header Info */}
        <View style={[styles.routeHeader, { borderBottomColor: C.border }]}>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="navigate-circle-outline" size={20} color={ORANGE} style={{ marginRight: 6 }} />
            {renderMarkdownText(route.summary || "Suggested Travel Plan", [styles.routeHeadline, { color: C.text }], C.text)}
          </View>
          <View style={styles.headerBadges}>
            {totalDistanceStr ? (
              <View style={[styles.badge, { backgroundColor: C.border, marginRight: 6 }]}>
                <Text style={styles.badgeText}>{totalDistanceStr}</Text>
              </View>
            ) : null}
            <View style={[styles.badge, { backgroundColor: C.border }]}>
              <Ionicons name="time-outline" size={13} color={ORANGE} style={{ marginRight: 4 }} />
              <Text style={[styles.badgeText, { color: ORANGE }]}>{sToMin(route.total_duration)}</Text>
            </View>
          </View>
        </View>

        {/* Mapbox Journey Snapshot */}
        {mapUrl && (
          <View style={[styles.mapContainer, { borderColor: C.border }]}>
            <Image source={{ uri: mapUrl }} style={styles.mapboxThumbnail} resizeMode="cover" />
          </View>
        )}

        {/* Dynamic Route Steps Timeline */}
        <View style={styles.timelineContainer}>
          {legs.map((leg: TransitLeg, legIndex: number) => {
            const isWalk = leg.mode?.toUpperCase() === 'WALK';
            return (
              <View key={legIndex} style={styles.legRow}>
                <View style={styles.indicatorContainer}>
                  <View style={[styles.iconNodeFrame, { backgroundColor: isWalk ? C.iconBg : `${ORANGE}20` }]}>
                    <Ionicons name={isWalk ? "walk-outline" : "bus-outline"} size={14} color={isWalk ? C.sub : ORANGE} />
                  </View>
                  {legIndex < legs.length - 1 && <View style={[styles.indicatorLine, { backgroundColor: C.border }]} />}
                </View>
                <View style={styles.legContent}>
                  {renderMarkdownText(isWalk ? 'Walk to stage' : `Board Matatu ${leg.routeNumber || 'Transit'}`, [styles.legTitle, { color: C.text }], C.text)}
                  <Text style={[styles.legSubtext, { color: C.sub }]}>
                    From <Text style={[styles.locationHighlight, { color: C.text }]}>{leg.from?.name}</Text>
                    {"\n"}to <Text style={[styles.locationHighlight, { color: C.text }]}>{leg.to?.name}</Text>
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <RouteActions route={route} C={C} startLeg={startLeg} endLeg={endLeg} />

    </View>
  );
}

const styles = StyleSheet.create({
  routeCard: { borderRadius: 16, padding: 16, marginTop: 4, marginRight: 12, borderWidth: 1, width: CARD_WIDTH, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1, flexDirection: 'column' },
  cardContent: { flex: 1 },
  routeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  routeHeadline: { fontSize: 15, fontWeight: '700', lineHeight: 20, flex: 1 },
  headerBadges: { flexDirection: 'row', alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#8E8E93' },
  mapContainer: { width: '100%', height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 1, marginBottom: 16 },
  mapboxThumbnail: { width: '100%', height: '100%' },
  timelineContainer: { paddingHorizontal: 2, marginBottom: 4 },
  legRow: { flexDirection: 'row', minHeight: 65 },
  indicatorContainer: { alignItems: 'center', marginRight: 14, width: 28 },
  iconNodeFrame: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  indicatorLine: { flex: 1, width: 2, marginVertical: 4, zIndex: 1 },
  legContent: { flex: 1, paddingTop: 3, paddingBottom: 14 },
  legTitle: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  legSubtext: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  locationHighlight: { fontWeight: '600' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  secondaryActions: { flexDirection: 'row', gap: 8 },
  selectRouteZone: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  selectRouteText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  iconActionBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
});