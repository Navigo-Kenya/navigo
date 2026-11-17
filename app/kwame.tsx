import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView,
  Animated, ActivityIndicator, KeyboardAvoidingView,
  Platform, useColorScheme, Alert, Dimensions, Text, Share, Modal, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  useAudioRecorder, useAudioRecorderState, useAudioPlayer, AudioModule, RecordingPresets,
} from 'expo-audio';
import { File as ExpoFile } from 'expo-file-system';
import * as Location from 'expo-location';

import {
  AiService, VoiceSettings, LocationResolutionAction, KwamePlace, KwameContext, NavContext,
} from '../services/ai';
import { getUpcomingCalendarEvents } from '../services/calendarContext';
import { useChatStore } from '../store/chatStore';
import { useJourneyStore } from '../store/journeyStore';
import { useNavStateStore } from '../store/navStateStore';
import { useKwameSettingsStore } from '../store/kwameSettingsStore';
import { usePrefsStore } from '../store/prefsStore';
import { rankRoutes, type RouteRanking } from '../utils/rankRoutes';
import RouteRankChips from '../components/app/RouteRankChips';

import ChatHeader from '../components/kwame/ChatHeader';
import ActionUI from '../components/kwame/ActionUI';
import RouteCard from '../components/kwame/RouteCard';
import VoiceOverlay from '../components/kwame/VoiceOverlay';
import MessageBubble from '../components/kwame/MessageBubble';
import PlacesScroller from '../components/kwame/PlaceCard';
import SuggestionChips from '../components/kwame/SuggestionChips';
import { Icon } from "@/components/icons/Icon";

const ORANGE = '#FF6F00';
const ACCENT_BLUE = '#2563EB';
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_W - 32;

function RouteScroller({ routes, C }: { routes: any[]; C: any }) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const prefsRanking = usePrefsStore((s) => s.prefs.routeRanking);
  const [rankingOverride, setRankingOverride] = useState<RouteRanking | null>(null);
  const ranking = rankingOverride ?? prefsRanking;
  const ranked = useMemo(() => rankRoutes(routes, ranking), [routes, ranking]);
  const isLast = activeIndex >= routes.length - 1;

  const scrollToNext = () => {
    const next = Math.min(activeIndex + 1, routes.length - 1);
    scrollRef.current?.scrollTo({ x: next * CARD_WIDTH, animated: true });
  };

  return (
    <View style={{ width: '100%', marginTop: 8 }}>
      <RouteRankChips
        routes={ranked}
        active={ranking}
        onSelect={(r) => {
          setRankingOverride(r);
          scrollRef.current?.scrollTo({ x: 0, animated: true });
        }}
        dark={C.bg === '#0F0F0F'}
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={routeScrollerStyles.row}
        onScroll={(e) =>
          setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH))
        }
        scrollEventThrottle={16}
      >
        {ranked.map((route, i) => (
          <RouteCard key={i} route={route} index={i} C={C} />
        ))}
      </ScrollView>
      {routes.length > 1 && !isLast && (
        <View style={routeScrollerStyles.hintContainer}>
          <TouchableOpacity
            style={[
              routeScrollerStyles.hintCircle,
              { backgroundColor: C.card, borderColor: C.border },
            ]}
            onPress={scrollToNext}
            activeOpacity={0.7}
          >
            <Icon name="chevron-forward" size={16} color={ORANGE} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const routeScrollerStyles = StyleSheet.create({
  row: { paddingRight: 12, alignItems: 'stretch' },
  hintContainer: { alignItems: 'center', marginTop: 8 },
  hintCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
});

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
};

function makeC(dark: boolean) {
  return {
    bg: dark ? '#0F0F0F' : '#FFFFFF',
    card: dark ? '#1A1A1A' : '#F4F4F5',
    surfacePill: dark ? '#1E1E20' : '#FFFFFF',
    popoverBg: dark ? '#1C1C1E' : '#FFFFFF',
    text: dark ? '#FFFFFF' : '#0D0D0D',
    sub: dark ? '#9CA3AF' : '#6B7280',
    border: dark ? '#2A2A2C' : '#E5E7EB',
    borderStrong: dark ? '#52525B' : '#D1D5DB',
    iconBg: dark ? '#2C2C2E' : '#F2F2F7',
    bubbleAI: 'transparent',
    bubbleUser: dark ? '#27272A' : '#F2F2F7',
    overlay: dark ? '#0A0A0A' : '#FFFFFF',
    actionCard: dark ? '#1C1C1E' : '#F9FAFB',
    shadow: dark ? '#000000' : '#0F172A',
  };
}

// ─── DOTTED + LIVE WAVEFORM FOR INLINE AUDIO RECORDING ───────────────────────
const N_DOTS = 22;
const N_ACTIVE_BARS = 8;
const BAR_MAX = 18;
const BAR_MIN = 4;

function DottedWaveform({
  meteringRef,
  C,
  paused,
}: {
  meteringRef: { current: number };
  C: any;
  paused: boolean;
}) {
  const barSpreads = useRef(
    Array.from({ length: N_ACTIVE_BARS }, (_, idx) =>
      0.4 + Math.sin((idx / N_ACTIVE_BARS) * Math.PI) * 0.6
    )
  ).current;
  const barAnims = useRef(
    Array.from({ length: N_ACTIVE_BARS }, () => new Animated.Value(BAR_MIN))
  ).current;
  const barSmoothedRef = useRef<number[]>(new Array(N_ACTIVE_BARS).fill(BAR_MIN));

  useEffect(() => {
    const id = setInterval(() => {
      if (paused) return;
      const db = Math.max(-60, Math.min(0, meteringRef.current));
      const energy = Math.pow((db + 60) / 60, 1.4);

      barAnims.forEach((anim, i) => {
        const target = Math.max(BAR_MIN, energy * BAR_MAX * barSpreads[i]);
        const smoothed = barSmoothedRef.current[i] * 0.35 + target * 0.65;
        barSmoothedRef.current[i] = smoothed;
        anim.setValue(smoothed);
      });
    }, 50);

    return () => clearInterval(id);
  }, [meteringRef, paused]);

  return (
    <View style={styles.dottedWaveRow}>
      {/* Leading Dotted Track */}
      <View style={styles.dotsTrack}>
        {Array.from({ length: N_DOTS }).map((_, idx) => (
          <View
            key={`dot-${idx}`}
            style={[styles.waveDot, { backgroundColor: C.sub }]}
          />
        ))}
      </View>

      {/* Trailing Active Voice Bars */}
      <View style={styles.activeBarsCluster}>
        {barAnims.map((anim, i) => (
          <Animated.View
            key={`bar-${i}`}
            style={[
              styles.activeWaveBar,
              { height: anim, backgroundColor: C.text },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function KwameScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const C = makeC(dark);
  const insets = useSafeAreaInsets();

  const { messages, addMessage, loadHistory, clearHistory } = useChatStore();
  const kwameSettings = useKwameSettingsStore((s) => s.settings);
  const loadSettings = useKwameSettingsStore((s) => s.load);
  const sessionId = 'kwame_main_session';

  const [uiMode, setUiMode] = useState<'chat' | 'voice'>('chat');
  const [voiceState, setVoiceState] = useState<
    'idle' | 'listening' | 'speaking' | 'processing'
  >('idle');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [holdingPhrase, setHoldingPhrase] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn] = useState(true);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [dislikedMsgIds, setDislikedMsgIds] = useState<Record<string, boolean>>({});

  const [isRecordingMsg, setIsRecordingMsg] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [toastWarning, setToastWarning] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ─── Pre-load UI Sound Effects ──────────────────────────────────────────────
  const triggerPlayer = useAudioPlayer(require('../assets/sounds/trigger.mp3'));
  const clickPlayer = useAudioPlayer(require('../assets/sounds/click.mp3'));

  const audioRecorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder, 80);
  const latestMeteringRef = useRef<number>(-160);

  useEffect(() => {
    latestMeteringRef.current = recorderState.metering ?? -160;
  }, [recorderState.metering]);

  const [audioPlayerUri, setAudioPlayerUri] = useState<string | null>(null);
  const audioPlayer = useAudioPlayer(audioPlayerUri);

  const orbScaleAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const animRunner = useRef<Animated.CompositeAnimation | null>(null);

  const silenceStartRef = useRef<number | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSpeechRef = useRef(false);
  const voiceActiveRef = useRef(false);

  const noiseFloorRef = useRef(-50);
  const speechAccumMsRef = useRef(0);
  const vadStartRef = useRef(0);
  const calibratingUntilRef = useRef(0);

  const calendarCtxRef = useRef<KwameContext | undefined>(undefined);

  const navSnapshot = useNavStateStore((s) => s.snapshot);
  const onTrip =
    navSnapshot.tripStatus === 'IN_TRANSIT' || navSnapshot.tripStatus === 'PAUSED';

  const showFloatingToast = (msg: string) => {
    setToastWarning(msg);
    setTimeout(() => {
      setToastWarning((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const buildContext = (): KwameContext | undefined => {
    const nav: NavContext | undefined = onTrip
      ? {
          trip_status: navSnapshot.tripStatus,
          destination: navSnapshot.destination,
          next_instruction: navSnapshot.nextInstruction,
          segment_mode: navSnapshot.currentSegmentMode,
          current_line: navSnapshot.currentLine,
          stops_remaining: navSnapshot.stopsRemaining,
          current_stop: navSnapshot.currentStopName,
          remaining_m: navSnapshot.remainingDistanceM,
          eta: navSnapshot.etaIso
            ? new Date(navSnapshot.etaIso).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })
            : null,
        }
      : undefined;
    const calendar = calendarCtxRef.current?.calendar_events;
    if (!nav && !calendar?.length) return undefined;
    return {
      ...(calendar?.length ? { calendar_events: calendar } : {}),
      ...(nav ? { nav } : {}),
    };
  };

  const isProcessing = loading || voiceState === 'processing';

  const fetchCurrentLocation = async () => {
    let lat = -1.2921,
      lng = 36.8219;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch {}
    return { lat, lng };
  };

  useEffect(() => {
    loadHistory(sessionId);
    loadSettings();
    getUpcomingCalendarEvents()
      .then((events) => {
        calendarCtxRef.current = events.length ? { calendar_events: events } : undefined;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
  }, [messages.length, uiMode]);

  useEffect(() => {
    if (audioPlayerUri && audioPlayer) {
      audioPlayer.volume = 1.0;
      audioPlayer.play();
      const playTime = (audioPlayer.duration || 5) * 1000;
      setTimeout(() => {
        setSpeakingMsgId(null);
        setVoiceState((prev) => {
          if (prev === 'speaking') {
            if (voiceActiveRef.current && !isMuted && kwameSettings.autoListen) {
              setTimeout(() => startRecording(), 800);
            }
            return 'idle';
          }
          return prev;
        });
      }, playTime);
    }
  }, [audioPlayerUri, audioPlayer]);

  useEffect(() => {
    let isActive = true;
    const simulateAudioWaveform = () => {
      if (!isActive) return;
      if (uiMode !== 'voice' || voiceState === 'idle') {
        Animated.spring(orbScaleAnim, { toValue: 1, useNativeDriver: true }).start();
        return;
      }
      const minScale = 0.96;
      const maxScale = voiceState === 'speaking' ? 1.14 : 1.06;
      const randomAmplitude = Math.random() * (maxScale - minScale) + minScale;
      animRunner.current = Animated.spring(orbScaleAnim, {
        toValue: randomAmplitude,
        speed: 22,
        bounciness: 6,
        useNativeDriver: true,
      });
      animRunner.current.start(({ finished }) => {
        if (finished && isActive) simulateAudioWaveform();
      });
    };
    simulateAudioWaveform();
    return () => {
      isActive = false;
      animRunner.current?.stop();
    };
  }, [uiMode, voiceState, orbScaleAnim]);

  const startVAD = () => {
    const SILENCE_HOLD_MS = Math.min(3000, Math.max(2000, kwameSettings.silenceHoldMs));
    const ONSET_ABOVE_FLOOR = 9;
    const RELEASE_ABOVE_FLOOR = 4;
    const MIN_SPEECH_MS = 350;
    const MAX_UTTERANCE_MS = 30000;
    const CALIBRATION_MS = 600;
    const TICK_MS = 80;

    hasSpeechRef.current = false;
    silenceStartRef.current = null;
    speechAccumMsRef.current = 0;
    vadStartRef.current = Date.now();
    calibratingUntilRef.current = Date.now() + CALIBRATION_MS;
    noiseFloorRef.current = Math.max(-60, Math.min(-30, latestMeteringRef.current));

    vadIntervalRef.current = setInterval(() => {
      const level = latestMeteringRef.current;
      const now = Date.now();

      if (now < calibratingUntilRef.current) {
        noiseFloorRef.current = Math.max(
          -60,
          Math.min(-20, noiseFloorRef.current * 0.6 + level * 0.4)
        );
        return;
      }

      const inSpeech = hasSpeechRef.current && silenceStartRef.current === null;
      const threshold =
        noiseFloorRef.current + (inSpeech ? RELEASE_ABOVE_FLOOR : ONSET_ABOVE_FLOOR);
      const speakingNow = level > threshold;

      if (speakingNow) {
        speechAccumMsRef.current += TICK_MS;
        if (speechAccumMsRef.current >= MIN_SPEECH_MS) {
          hasSpeechRef.current = true;
          silenceStartRef.current = null;
        }
      } else {
        speechAccumMsRef.current = Math.max(0, speechAccumMsRef.current - TICK_MS);
        const a = level > noiseFloorRef.current ? 0.05 : 0.15;
        noiseFloorRef.current = Math.max(
          -60,
          Math.min(-20, noiseFloorRef.current * (1 - a) + level * a)
        );

        if (hasSpeechRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current >= SILENCE_HOLD_MS) {
            stopVAD();
            stopRecording();
            return;
          }
        }
      }

      if (hasSpeechRef.current && now - vadStartRef.current >= MAX_UTTERANCE_MS) {
        stopVAD();
        stopRecording();
      }
    }, TICK_MS);
  };

  const stopVAD = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
  };

  const buildVoiceSettings = (): VoiceSettings => ({
    voice_name: kwameSettings.voiceName,
    speaking_rate: kwameSettings.speakingRate,
    pitch: kwameSettings.pitch,
    language_code: kwameSettings.languageCode,
    response_style: kwameSettings.responseStyle,
  });

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone Access', 'Kwame needs microphone access.');
        return;
      }
      if (audioPlayer?.playing) audioPlayer.pause();

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoiceState('listening');

      setTimeout(() => startVAD(), 300);
    } catch {
      setVoiceState('idle');
    }
  };

  const stopRecording = async () => {
    if (voiceState !== 'listening') return;
    stopVAD();
    setVoiceState('processing');

    const uri = audioRecorder.uri;
    try {
      await audioRecorder.stop();
      if (!voiceActiveRef.current || !uri) {
        setVoiceState('idle');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
      const base64Audio = await new ExpoFile(uri).base64();
      if (!base64Audio || !voiceActiveRef.current) {
        setVoiceState('idle');
        return;
      }

      const userMsgId = Math.random().toString();
      addMessage({ id: userMsgId, role: 'user', text: 'Transcribing...' });
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      AiService.transcribeAudio(base64Audio).then((transcript) => {
        useChatStore.getState().updateMessageText(userMsgId, transcript);
      });

      const { lat, lng } = await fetchCurrentLocation();
      setHoldingPhrase('Processing your route...');

      const response = await AiService.planRoute(
        sessionId,
        undefined,
        base64Audio,
        'audio/mp4',
        lat,
        lng,
        undefined,
        buildVoiceSettings(),
        buildContext()
      );

      setHoldingPhrase(null);
      if (!voiceActiveRef.current) {
        setVoiceState('idle');
        return;
      }

      if (response.spoken_response) {
        const newMsgId = Math.random().toString();
        setStreamingMessageId(newMsgId);
        addMessage({
          id: newMsgId,
          role: 'assistant',
          text: response.spoken_response,
          routes: response.routes,
          actionRequired: response.actionRequired,
          places: response.places,
          suggestions: response.suggestions,
        });
      }

      if (response.tts_audio && isSpeakerOn && voiceActiveRef.current) {
        await AudioModule.setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
        setVoiceState('speaking');
        setAudioPlayerUri(`data:audio/mp3;base64,${response.tts_audio}`);
      } else {
        setVoiceState('idle');
        if (voiceActiveRef.current && !isMuted && kwameSettings.autoListen) {
          setTimeout(() => startRecording(), 800);
        }
      }
    } catch {
      setVoiceState('idle');
      setHoldingPhrase(null);
    }
  };

  const handleOrbPress = () => {
    if (isMuted) return;
    if (voiceState === 'idle' || voiceState === 'speaking') startRecording();
    else if (voiceState === 'listening') stopRecording();
  };

  const toggleUiMode = (
    targetMode: 'chat' | 'voice',
    opts: { keepAudio?: boolean } = {}
  ) => {
    if (isRecordingMsg && targetMode === 'voice') {
      showFloatingToast('Finish your current recording before starting another.');
      return;
    }

    if (targetMode === 'voice') {
      try {
        if (triggerPlayer) {
          triggerPlayer.volume = 1.0;
          if (typeof triggerPlayer.seekTo === 'function') triggerPlayer.seekTo(0);
          triggerPlayer.play();
        }
      } catch {}

      voiceActiveRef.current = true;
      setUiMode('voice');
      if (!isMuted) startRecording();
    } else {
      try {
        if (clickPlayer) {
          if (typeof clickPlayer.seekTo === 'function') clickPlayer.seekTo(0);
          clickPlayer.play();
        }
      } catch {}

      voiceActiveRef.current = false;
      stopVAD();
      if (!opts.keepAudio && audioPlayer?.playing) audioPlayer.pause();
      if (voiceState === 'listening') audioRecorder.stop().catch(() => {});
      setUiMode('chat');
      if (!opts.keepAudio) setVoiceState('idle');
    }
  };

  // ─── Chat Mode Audio Message Logic (Inline Pill Recorder) ────────────────────
  const startRecordingMsg = async () => {
    if (isRecordingMsg) {
      showFloatingToast('Finish your current recording before starting another.');
      return;
    }
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone Access Required', 'Please enable mic access.');
        return;
      }
      if (audioPlayer?.playing) audioPlayer.pause();

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecordingPaused(false);
      setIsRecordingMsg(true);
    } catch {
      showFloatingToast('Could not start microphone recording.');
    }
  };

  const pauseOrStopInlineRecording = async () => {
    if (!isRecordingPaused) {
      try {
        await audioRecorder.stop();
      } catch {}
      setIsRecordingPaused(true);
    } else {
      showFloatingToast('Finish your current recording before starting another.');
    }
  };

  const cancelRecordingMsg = async () => {
    try {
      if (!isRecordingPaused) await audioRecorder.stop();
    } catch {}
    setIsRecordingPaused(false);
    setIsRecordingMsg(false);
  };

  const stopRecordingMsgAndSend = async () => {
    const wasPaused = isRecordingPaused;
    setIsRecordingMsg(false);
    setIsRecordingPaused(false);
    setLoading(true);
    try {
      const uri = audioRecorder.uri;
      if (!wasPaused) {
        await audioRecorder.stop();
      }
      if (!uri) throw new Error('No audio uri');

      await new Promise((resolve) => setTimeout(resolve, 150));
      const base64Audio = await new ExpoFile(uri).base64();

      const userMsgId = Math.random().toString();
      addMessage({ id: userMsgId, role: 'user', text: 'Transcribing...' });
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      AiService.transcribeAudio(base64Audio).then((transcript) => {
        useChatStore.getState().updateMessageText(userMsgId, transcript);
      });

      const { lat, lng } = await fetchCurrentLocation();
      const response = await AiService.planRoute(
        sessionId,
        undefined,
        base64Audio,
        'audio/mp4',
        lat,
        lng,
        undefined,
        buildVoiceSettings(),
        buildContext()
      );

      const newMsgId = Math.random().toString();
      setStreamingMessageId(newMsgId);
      addMessage({
        id: newMsgId,
        role: 'assistant',
        text: response.spoken_response || '',
        routes: response.routes,
        actionRequired: response.actionRequired,
        places: response.places,
        suggestions: response.suggestions,
      });
    } catch {
      addMessage({
        id: Math.random().toString(),
        role: 'assistant',
        text: 'Failed to send audio message.',
      });
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ─── Text Message Logic ───────────────────────────────────────────────────────
  const handleSendText = async (
    overrideText?: string,
    aliasesOverride?: Record<string, { lat: number; lng: number; name: string }>
  ) => {
    const userQuery = (overrideText ?? inputText).trim();
    if (!userQuery || isProcessing) return;
    setInputText('');
    setLoading(true);

    const userMsgId = Math.random().toString();
    addMessage({ id: userMsgId, role: 'user', text: userQuery });

    try {
      const { lat, lng } = await fetchCurrentLocation();
      const response = await AiService.planRoute(
        sessionId,
        userQuery,
        undefined,
        undefined,
        lat,
        lng,
        aliasesOverride,
        buildVoiceSettings(),
        buildContext()
      );

      const newMsgId = Math.random().toString();
      setStreamingMessageId(newMsgId);
      addMessage({
        id: newMsgId,
        role: 'assistant',
        text: response.spoken_response || '',
        routes: response.routes,
        actionRequired: response.actionRequired,
        places: response.places,
        suggestions: response.suggestions,
      });
    } catch {
      addMessage({
        id: Math.random().toString(),
        role: 'assistant',
        text: 'Network error, please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceDirections = (place: KwamePlace) => {
    const aliases = {
      [place.name.toLowerCase()]: { lat: place.lat, lng: place.lng, name: place.name },
    };
    handleSendText(`Take me to ${place.name}`, aliases);
  };

  const handleSpeak = async (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      audioPlayer?.pause();
      setSpeakingMsgId(null);
      return;
    }
    if (audioPlayer?.playing) audioPlayer.pause();
    setSpeakingMsgId(msgId);
    try {
      await AudioModule.setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const { audio } = await AiService.speak(text, buildVoiceSettings());
      setAudioPlayerUri(`data:audio/mp3;base64,${audio}`);
    } catch {
      setSpeakingMsgId(null);
    }
  };

  const handleSelectSavedPlace = async (
    placeName: string,
    pLat: number,
    pLng: number,
    action: LocationResolutionAction
  ) => {
    setLoading(true);
    const customAliases = {
      [placeName.toLowerCase()]: { lat: pLat, lng: pLng, name: placeName },
    };
    const query =
      action.field === 'from'
        ? `From ${placeName} to ${action.unresolvedName}`
        : `Take me to ${placeName}`;

    addMessage({
      id: Math.random().toString(),
      role: 'user',
      text: `Use saved place: ${placeName}`,
    });

    try {
      const { lat, lng } = await fetchCurrentLocation();
      const response = await AiService.planRoute(
        sessionId,
        query,
        undefined,
        undefined,
        lat,
        lng,
        customAliases,
        buildVoiceSettings(),
        buildContext()
      );
      const newMsgId = Math.random().toString();
      setStreamingMessageId(newMsgId);
      addMessage({
        id: newMsgId,
        role: 'assistant',
        text: response.spoken_response || '',
        routes: response.routes,
        actionRequired: response.actionRequired,
        places: response.places,
        suggestions: response.suggestions,
      });
    } catch {
      addMessage({
        id: Math.random().toString(),
        role: 'assistant',
        text: 'Failed to recalculate.',
      });
    } finally {
      setLoading(false);
    }
  };

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastAssistantId = lastAssistantMsg?.id;
  const firstUserMsg = messages.find((m) => m.role === 'user')?.text || 'Casual Greeting';

  return (
    <SafeAreaView edges={['top']} style={[styles.masterContainer, { backgroundColor: C.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.masterContainer}
      >
        <View style={styles.chatView}>
          {/* Floating Top Header */}
          <ChatHeader
            C={C}
            router={router}
            clearHistory={clearHistory}
            hasMessages={messages.length > 0}
            uiMode={uiMode}
            onOpenDrawer={() => setDrawerOpen(true)}
            chatTitle={firstUserMsg}
            lastAssistantText={lastAssistantMsg?.text}
          />

          {/* Non-blocking Floating Warning Toast (e.g. Recording already active) */}
          {toastWarning && (
            <View
              style={[
                styles.floatingToast,
                { backgroundColor: C.surfacePill, borderColor: C.border },
              ]}
            >
              <Icon name="warning" size={18} color={C.text} />
              <Text style={[styles.floatingToastText, { color: C.text }]}>
                {toastWarning}
              </Text>
            </View>
          )}

          {uiMode === 'voice' ? (
            <VoiceOverlay
              C={C}
              voiceState={voiceState}
              holdingPhrase={holdingPhrase}
              orbScaleAnim={orbScaleAnim}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              toggleUiMode={toggleUiMode}
              handleOrbPress={handleOrbPress}
            />
          ) : (
            <>
              <ScrollView
                ref={scrollViewRef}
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {messages.map((msg) => {
                  const hasSources =
                    (msg.routes && msg.routes.length > 0) ||
                    (msg.places && msg.places.length > 0);

                  return (
                    <View
                      key={msg.id}
                      style={[
                        styles.bubbleWrapper,
                        msg.role === 'user' ? styles.userWrapper : styles.aiWrapper,
                      ]}
                    >
                      {/* Interactive Clarification Card renders above or below assistant text */}
                      {msg.suggestions &&
                        msg.suggestions.length > 0 &&
                        msg.id === lastAssistantId && (
                          <SuggestionChips
                            suggestions={msg.suggestions}
                            C={C}
                            disabled={isProcessing}
                            onPress={(sug) => handleSendText(sug)}
                          />
                        )}

                      <MessageBubble
                        msg={msg}
                        C={C}
                        isStreaming={msg.id === streamingMessageId}
                      />

                      <ActionUI
                        msg={msg}
                        C={C}
                        router={router}
                        onSelectPlace={handleSelectSavedPlace}
                      />

                      {msg.routes && msg.routes.length > 0 && (
                        <RouteScroller routes={msg.routes} C={C} />
                      )}

                      {msg.places && msg.places.length > 0 && (
                        <PlacesScroller
                          places={msg.places}
                          C={C}
                          onDirections={handlePlaceDirections}
                        />
                      )}

                      {/* ChatGPT-Style Assistant Action Utility Bar */}
                      {msg.role === 'assistant' && (
                        <View style={styles.bubbleUtilityRow}>
                          <TouchableOpacity
                            onPress={() => Clipboard.setStringAsync(msg.text)}
                            hitSlop={10}
                            style={styles.utilityIcon}
                          >
                            <Icon name="copy-outline" size={17} color={C.sub} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() =>
                              setDislikedMsgIds((prev) => ({
                                ...prev,
                                [msg.id]: !prev[msg.id],
                              }))
                            }
                            hitSlop={10}
                            style={styles.utilityIcon}
                          >
                            <Icon
                              name={
                                dislikedMsgIds[msg.id]
                                  ? 'thumbs-down'
                                  : 'thumbs-down-outline'
                              }
                              size={17}
                              color={dislikedMsgIds[msg.id] ? ORANGE : C.sub}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            hitSlop={10}
                            style={styles.utilityIcon}
                            onPress={() => handleSpeak(msg.id, msg.text)}
                            disabled={msg.id === streamingMessageId}
                          >
                            <Icon
                              name={
                                speakingMsgId === msg.id
                                  ? 'stop-circle-outline'
                                  : 'volume-medium-outline'
                              }
                              size={18}
                              color={speakingMsgId === msg.id ? ORANGE : C.sub}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            hitSlop={10}
                            style={styles.utilityIcon}
                            onPress={() => Share.share({ message: msg.text })}
                          >
                            <Icon name="share-outline" size={17} color={C.sub} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            hitSlop={10}
                            style={styles.utilityIcon}
                            onPress={() => Clipboard.setStringAsync(msg.text)}
                          >
                            <Icon
                              name="ellipsis-horizontal"
                              size={17}
                              color={C.sub}
                            />
                          </TouchableOpacity>

                          {hasSources && (
                            <View style={styles.sourcesBadge}>
                              <View style={styles.sourceDotStack}>
                                <View
                                  style={[
                                    styles.sourceMiniDot,
                                    { backgroundColor: ORANGE },
                                  ]}
                                />
                                <View
                                  style={[
                                    styles.sourceMiniDot,
                                    { backgroundColor: '#10B981', marginLeft: -5 },
                                  ]}
                                />
                                <View
                                  style={[
                                    styles.sourceMiniDot,
                                    { backgroundColor: '#3B82F6', marginLeft: -5 },
                                  ]}
                                />
                              </View>
                              <Text style={[styles.sourcesText, { color: C.sub }]}>
                                Sources
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}

                {loading && (
                  <View style={[styles.bubbleWrapper, styles.aiWrapper]}>
                    <View style={styles.loaderRow}>
                      <ActivityIndicator color={ORANGE} size="small" />
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* In-trip copilot quick questions */}
              {onTrip && !isProcessing && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 8,
                    gap: 8,
                  }}
                >
                  {[
                    navSnapshot.currentSegmentMode !== 'WALK'
                      ? 'How many stops left?'
                      : 'Where do I go next?',
                    'When do I arrive?',
                    ...(navSnapshot.currentLine
                      ? [`Tell me about Line ${navSnapshot.currentLine}`]
                      : []),
                  ].map((q) => (
                    <TouchableOpacity
                      key={q}
                      onPress={() => handleSendText(q)}
                      style={[
                        styles.copilotChip,
                        { backgroundColor: C.card, borderColor: C.border },
                      ]}
                    >
                      <Icon name="navigate-outline" size={12} color={ORANGE} />
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: C.text }}>
                        {q}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Unified Floating Bottom Pill Input Dock */}
              <View
                style={[
                  styles.bottomDockContainer,
                  {
                    backgroundColor: C.bg,
                    paddingBottom: Math.max(insets.bottom, 8) + 6,
                  },
                ]}
              >
                <View
                  style={[
                    styles.unifiedPill,
                    {
                      backgroundColor: C.surfacePill,
                      borderColor: C.border,
                      shadowColor: C.shadow,
                    },
                  ]}
                >
                  {isRecordingMsg ? (
                    // ─── INLINE RECORDING STATE (Cancel X + Dotted Waveform + Stop Square + Send Arrow) ───
                    <>
                      <TouchableOpacity
                        style={[
                          styles.inlineCircleBtn,
                          { backgroundColor: C.iconBg },
                        ]}
                        onPress={cancelRecordingMsg}
                      >
                        <Icon name="close" size={20} color={C.text} />
                      </TouchableOpacity>

                      <DottedWaveform
                        meteringRef={latestMeteringRef}
                        C={C}
                        paused={isRecordingPaused}
                      />

                      <TouchableOpacity
                        style={[
                          styles.inlineCircleBtn,
                          { backgroundColor: C.iconBg },
                        ]}
                        onPress={pauseOrStopInlineRecording}
                      >
                        <View
                          style={[styles.stopSquare, { backgroundColor: C.text }]}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.inlineCircleBtn,
                          { backgroundColor: ACCENT_BLUE },
                        ]}
                        onPress={stopRecordingMsgAndSend}
                      >
                        <Icon name="arrow-up" size={20} color="#FFFFFF" />
                      </TouchableOpacity>
                    </>
                  ) : (
                    // ─── IDLE OR TYPING STATE (All inside the single floating pill) ───
                    <>
                      <TouchableOpacity
                        style={styles.plusBtn}
                        disabled={isProcessing}
                        onPress={() => router.push('/kwame-settings')}
                      >
                        <Icon name="add" size={24} color={C.text} />
                      </TouchableOpacity>

                      <TextInput
                        style={[styles.textInputField, { color: C.text }]}
                        placeholder={
                          isProcessing ? 'Kwame is thinking...' : 'Ask Kwame'
                        }
                        placeholderTextColor={C.sub}
                        value={inputText}
                        onChangeText={setInputText}
                        editable={!isProcessing}
                        onSubmitEditing={() => handleSendText()}
                      />

                      <TouchableOpacity
                        style={styles.inlineMicBtn}
                        onPress={startRecordingMsg}
                        disabled={isProcessing}
                      >
                        <Icon name="mic-outline" size={22} color={C.text} />
                      </TouchableOpacity>

                      {inputText.trim().length > 0 ? (
                        <TouchableOpacity
                          style={[
                            styles.inlineCircleBtn,
                            { backgroundColor: ACCENT_BLUE },
                          ]}
                          onPress={() => handleSendText()}
                          disabled={isProcessing}
                        >
                          <Icon name="arrow-up" size={19} color="#FFFFFF" />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.inlineCircleBtn,
                            { backgroundColor: ACCENT_BLUE },
                          ]}
                          onPress={() => toggleUiMode('voice')}
                          disabled={isProcessing}
                        >
                          {/* 3-Bar Voice Waveform Icon */}
                          <View style={styles.voiceBarsIcon}>
                            <View style={[styles.voiceBarItem, { height: 8 }]} />
                            <View style={[styles.voiceBarItem, { height: 14 }]} />
                            <View style={[styles.voiceBarItem, { height: 10 }]} />
                          </View>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </View>

        {/* Slide-Over Navigation & History Drawer */}
        <Modal
          visible={drawerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={styles.drawerOverlay}>
            <View
              style={[
                styles.drawerPanel,
                {
                  backgroundColor: C.bg,
                  paddingTop: insets.top + 12,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              {/* Drawer Header */}
              <View style={styles.drawerHeader}>
                <Text style={[styles.drawerTitle, { color: C.text }]}>Kwame</Text>
                <TouchableOpacity
                  style={[
                    styles.drawerSearchCircle,
                    { backgroundColor: C.surfacePill, shadowColor: C.shadow },
                  ]}
                  onPress={() => setDrawerOpen(false)}
                >
                  <Icon name="search-outline" size={20} color={C.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Primary Navigation Items */}
                <TouchableOpacity
                  style={styles.drawerMenuItem}
                  onPress={() => {
                    setDrawerOpen(false);
                    router.back();
                  }}
                >
                  <Icon name="map-outline" size={21} color={C.text} />
                  <Text style={[styles.drawerMenuText, { color: C.text }]}>
                    Explore Map
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.drawerMenuItem}
                  onPress={() => {
                    setDrawerOpen(false);
                    router.push('/kwame-settings');
                  }}
                >
                  <Icon name="bookmarks-outline" size={20} color={C.text} />
                  <Text style={[styles.drawerMenuText, { color: C.text }]}>
                    Saved Places & Routes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.drawerMenuItem}
                  onPress={() => {
                    setDrawerOpen(false);
                    router.push('/kwame-settings');
                  }}
                >
                  <Icon name="options-outline" size={21} color={C.text} />
                  <Text style={[styles.drawerMenuText, { color: C.text }]}>
                    Customize Kwame
                  </Text>
                </TouchableOpacity>

                {/* Pinned Section */}
                <Text style={[styles.drawerSectionLabel, { color: C.text }]}>
                  Pinned
                </Text>

                {[
                  'Westlands Matatu Stages',
                  'CBD to Kiambu Road Commute',
                  'SGR Terminus Express Link',
                ].map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.drawerHistoryRow}
                    onPress={() => {
                      setDrawerOpen(false);
                      handleSendText(item);
                    }}
                  >
                    <Icon name="chatbubble-outline" size={18} color={C.text} />
                    <Text
                      style={[styles.drawerHistoryText, { color: C.text }]}
                      numberOfLines={1}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* Recents Section */}
                <Text style={[styles.drawerSectionLabel, { color: C.text }]}>
                  Recents
                </Text>

                {messages
                  .filter((m) => m.role === 'user')
                  .slice(-5)
                  .reverse()
                  .map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.drawerHistoryRow}
                      onPress={() => setDrawerOpen(false)}
                    >
                      <Text
                        style={[styles.drawerHistoryText, { color: C.sub }]}
                        numberOfLines={1}
                      >
                        {m.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              {/* Drawer Bottom Floating Bar: "Chat" Pill + User Avatar */}
              <View style={styles.drawerBottomRow}>
                <TouchableOpacity
                  style={[
                    styles.drawerChatPill,
                    { backgroundColor: ACCENT_BLUE },
                  ]}
                  onPress={() => {
                    setDrawerOpen(false);
                    clearHistory();
                  }}
                >
                  <Icon name="create-outline" size={19} color="#FFFFFF" />
                  <Text style={styles.drawerChatPillText}>Chat</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.userAvatarBadge}
                  onPress={() => {
                    setDrawerOpen(false);
                    router.push('/kwame-settings');
                  }}
                >
                  <Text style={styles.userAvatarText}>AB</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Right Peek Area to dismiss drawer */}
            <Pressable
              style={styles.drawerDismissArea}
              onPress={() => setDrawerOpen(false)}
            />
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  masterContainer: { flex: 1 },
  chatView: { flex: 1, width: '100%', height: '100%' },
  scrollContainer: { flex: 1 },
  scrollContent: { paddingVertical: 14, paddingHorizontal: 16 },
  bubbleWrapper: { marginBottom: 20, width: '100%', flexDirection: 'column' },
  userWrapper: { alignItems: 'flex-end' },
  aiWrapper: { alignItems: 'flex-start' },
  bubbleUtilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 16,
  },
  utilityIcon: { padding: 2 },
  sourcesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4,
  },
  sourceDotStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceMiniDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  sourcesText: {
    fontSize: 13,
    fontWeight: '500',
  },
  loaderRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  copilotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  // Floating Warning Toast
  floatingToast: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  floatingToastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },

  // Single Unified Bottom Pill Input Dock
  bottomDockContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  unifiedPill: {
    minHeight: 52,
    maxHeight: 120,
    borderRadius: 26,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInputField: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  inlineMicBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceBarsIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
  },
  voiceBarItem: {
    width: 2.2,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },

  // Dotted + Live Waveform Inside Pill
  dottedWaveRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 36,
  },
  dotsTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginRight: 6,
  },
  waveDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.45,
  },
  activeBarsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activeWaveBar: {
    width: 2.8,
    borderRadius: 1.5,
  },

  // Slide-Over Navigation Drawer
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  drawerPanel: {
    width: SCREEN_W * 0.78,
    height: '100%',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  drawerDismissArea: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  drawerSearchCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  drawerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  drawerMenuText: {
    fontSize: 16,
    fontWeight: '500',
  },
  drawerSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 22,
    marginBottom: 8,
  },
  drawerHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 12,
  },
  drawerHistoryText: {
    fontSize: 15,
    flex: 1,
  },
  drawerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  drawerChatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
  },
  drawerChatPillText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  userAvatarBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});