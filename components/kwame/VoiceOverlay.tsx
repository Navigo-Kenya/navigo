import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  C: any;
  voiceState: 'idle' | 'listening' | 'speaking' | 'processing';
  holdingPhrase: string | null;
  orbScaleAnim: Animated.Value;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  toggleUiMode: (mode: 'chat' | 'voice', opts?: { keepAudio?: boolean }) => void;
  handleOrbPress: () => void;
}

const ORANGE  = '#FF6F00';
const { width: SCREEN_W } = Dimensions.get('window');

export default function VoiceOverlay({
  C, voiceState, holdingPhrase, orbScaleAnim, isMuted, setIsMuted, toggleUiMode, handleOrbPress
}: Props) {
  
  // Smooth fade-in for the container
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  // Determine status text to mimic ChatGPT
  const getStatusText = () => {
    if (holdingPhrase) return holdingPhrase;
    switch (voiceState) {
      case 'listening': return "Listening — pause to send";
      case 'processing': return "Thinking...";
      case 'speaking': return "";
      case 'idle': return "Tap to speak";
      default: return "";
    }
  };

  return (
    <Animated.View style={[styles.container, { backgroundColor: C.bg, opacity: fadeAnim }]}>
      
      {/* Dynamic Status Text above the Orb */}
      <View style={styles.statusContainer}>
        <Text style={[styles.statusText, { color: C.text }]}>{getStatusText()}</Text>
      </View>

      {/* Main Control Row */}
      <View style={styles.controlRow}>
        
        {/* Left Slot: Mute Button */}
        <View style={[styles.sideSlot, { alignItems: 'flex-start' }]}>
          <TouchableOpacity 
            style={[styles.sideBtn, { backgroundColor: C.iconBg }]} 
            onPress={() => setIsMuted(!isMuted)}
          >
            <Ionicons 
              name={isMuted ? "mic-off" : "mic"} 
              size={22} 
              color={isMuted ? "#FF3B30" : C.text} 
            />
          </TouchableOpacity>
        </View>

        {/* The Glowing Orb */}
        <TouchableOpacity activeOpacity={0.9} onPress={handleOrbPress} style={styles.orbHitArea}>
          <Animated.View style={[
            styles.orb,
            { transform: [{ scale: orbScaleAnim }] },
            voiceState === 'listening'  && { backgroundColor: '#FF8F00', shadowColor: '#FF8F00', shadowOpacity: 0.7, shadowRadius: 30 },
            voiceState === 'speaking'   && { backgroundColor: ORANGE, shadowColor: ORANGE, shadowOpacity: 0.9, shadowRadius: 40 },
            voiceState === 'processing' && { backgroundColor: '#CC5800', shadowOpacity: 0 },
            isMuted && { backgroundColor: '#331A00' },
          ]} />
        </TouchableOpacity>

        {/* Right Slot: Close 'X' Button */}
        <View style={[styles.sideSlot, { alignItems: 'flex-end' }]}>
          <TouchableOpacity 
            style={[styles.sideBtn, { backgroundColor: C.iconBg }]} 
            onPress={() => toggleUiMode('chat')}
          >
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    width: SCREEN_W,
    paddingBottom: 40,
    paddingTop: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    zIndex: 999,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 20,
    height: 24,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.8,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  sideSlot: {
    flex: 1,
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbHitArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 90, 
    height: 90, 
    borderRadius: 45, 
    backgroundColor: ORANGE,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  }
});