import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const ORB_SIZE = 215;

export default function VoiceOverlay({
  C,
  voiceState,
  holdingPhrase,
  orbScaleAnim,
  isMuted,
  setIsMuted,
  toggleUiMode,
  handleOrbPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cloudDriftAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cloudDriftAnim, {
          toValue: 1,
          duration: 3800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(cloudDriftAnim, {
          toValue: 0,
          duration: 3800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const getStatusText = () => {
    if (holdingPhrase) return holdingPhrase;
    if (isMuted) return 'Microphone muted';
    switch (voiceState) {
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Thinking...';
      case 'speaking':
        return '';
      case 'idle':
        return 'Tap orb to speak';
      default:
        return '';
    }
  };

  const cloudTranslateY = cloudDriftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, -10],
  });

  const cloudRotate = cloudDriftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-6deg', '8deg'],
  });

  // Palette shifts gently between active/muted states while keeping the organic cloud aesthetic
  const baseOrbColor = isMuted
    ? '#94A3B8'
    : voiceState === 'speaking'
    ? '#FF6F00'
    : '#3B82F6';

  const secondaryWashColor = isMuted
    ? '#CBD5E1'
    : voiceState === 'speaking'
    ? '#FFCC80'
    : '#93C5FD';

  return (
    <Animated.View
      style={[
        styles.overlayContainer,
        { backgroundColor: C.bg, opacity: fadeAnim },
      ]}
    >
      {/* Center Organic Fluid Cloud Orb */}
      <View style={styles.centerStage}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handleOrbPress}
          style={styles.orbTouchArea}
        >
          <Animated.View
            style={[
              styles.orbShell,
              {
                backgroundColor: baseOrbColor,
                transform: [{ scale: orbScaleAnim }],
              },
            ]}
          >
            {/* Upper Mid-Tone Sky/Amber Wash */}
            <Animated.View
              style={[
                styles.cloudLayerMid,
                {
                  backgroundColor: secondaryWashColor,
                  transform: [
                    { translateY: cloudTranslateY },
                    { rotate: cloudRotate },
                  ],
                },
              ]}
            />
            {/* Lower Soft White Cloud Crest */}
            <Animated.View
              style={[
                styles.cloudLayerBright,
                {
                  transform: [
                    {
                      translateY: Animated.multiply(cloudTranslateY, -0.8),
                    },
                  ],
                },
              ]}
            />
          </Animated.View>
        </TouchableOpacity>

        {!!getStatusText() && (
          <Text style={[styles.statusCaption, { color: C.sub }]}>
            {getStatusText()}
          </Text>
        )}
      </View>

      {/* Bottom Voice Mode Dock: "+ Ask Kwame" Pill + Mute Circle + Dark Close Circle */}
      <View
        style={[
          styles.bottomVoiceBar,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.askTextPill,
            { backgroundColor: C.surfacePill, shadowColor: C.shadow },
          ]}
          activeOpacity={0.8}
          onPress={() => toggleUiMode('chat', { keepAudio: true })}
        >
          <Ionicons name="add" size={24} color={C.text} />
          <Text style={[styles.askPlaceholder, { color: C.sub }]}>Ask Kwame</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.roundControlBtn,
            { backgroundColor: C.surfacePill, shadowColor: C.shadow },
          ]}
          onPress={() => setIsMuted(!isMuted)}
          activeOpacity={0.75}
        >
          <Ionicons
            name={isMuted ? 'mic-off-outline' : 'mic-outline'}
            size={22}
            color={isMuted ? '#FF3B30' : C.text}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roundControlBtn, { backgroundColor: C.text }]}
          onPress={() => toggleUiMode('chat')}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color={C.bg} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  centerStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbTouchArea: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbShell: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cloudLayerMid: {
    position: 'absolute',
    bottom: -25,
    left: -30,
    width: ORB_SIZE * 1.35,
    height: ORB_SIZE * 0.72,
    borderRadius: ORB_SIZE * 0.45,
    opacity: 0.75,
  },
  cloudLayerBright: {
    position: 'absolute',
    bottom: -48,
    right: -25,
    width: ORB_SIZE * 1.25,
    height: ORB_SIZE * 0.65,
    borderRadius: ORB_SIZE * 0.45,
    backgroundColor: '#F8FAFC',
    opacity: 0.92,
  },
  statusCaption: {
    marginTop: 28,
    fontSize: 15,
    fontWeight: '500',
  },
  bottomVoiceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  askTextPill: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  askPlaceholder: {
    fontSize: 16,
    fontWeight: '400',
  },
  roundControlBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
});