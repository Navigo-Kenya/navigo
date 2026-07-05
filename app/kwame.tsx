import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView,
  Animated, ActivityIndicator, KeyboardAvoidingView,
  Platform, useColorScheme, Alert, Dimensions, Text,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, AudioModule, RecordingPresets } from 'expo-audio';
import { File as ExpoFile } from 'expo-file-system';
import * as Location from 'expo-location';

import { AiService, VoiceSettings, LocationResolutionAction, KwamePlace, KwameContext, NavContext } from '../services/ai';
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

const ORANGE = "#FF6F00";
const CARD_WIDTH = Dimensions.get('window').width - 28;

function RouteScroller({ routes, C }: { routes: any[]; C: any }) {
  const scrollRef  = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const prefsRanking = usePrefsStore((s) => s.prefs.routeRanking);
  const [rankingOverride, setRankingOverride] = useState<RouteRanking | null>(null);
  const ranking = rankingOverride ?? prefsRanking;
  const ranked  = useMemo(() => rankRoutes(routes, ranking), [routes, ranking]);
  const isLast = activeIndex >= routes.length - 1;

  const scrollToNext = () => {
    const next = Math.min(activeIndex + 1, routes.length - 1);
    scrollRef.current?.scrollTo({ x: next * CARD_WIDTH, animated: true });
  };

  return (
    <>
      <RouteRankChips
        routes={ranked}
        active={ranking}
        onSelect={(r) => {
          setRankingOverride(r);
          scrollRef.current?.scrollTo({ x: 0, animated: true });
        }}
        dark={C.bg === "#0F0F0F"}
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={routeScrollerStyles.row}
        onScroll={(e) => setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH))}
        scrollEventThrottle={16}
      >
        {ranked.map((route, i) => <RouteCard key={i} route={route} index={i} C={C} />)}
      </ScrollView>
      {routes.length > 1 && !isLast && (
        <View style={routeScrollerStyles.hintContainer}>
          <TouchableOpacity
            style={[routeScrollerStyles.hintCircle, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={scrollToNext}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={16} color={ORANGE} />
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const routeScrollerStyles = StyleSheet.create({
  row:           { paddingRight: 12, alignItems: 'stretch' },
  hintContainer: { alignItems: 'center', marginTop: 8 },
  hintCircle:    { width: 30, height: 30, borderRadius: 15, borderWidth: 1, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
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
    bg:         dark ? "#0F0F0F" : "#FFFFFF",
    card:       dark ? "#1A1A1A" : "#F2F2F7",
    text:       dark ? "#FFFFFF" : "#000000",
    sub:        dark ? "#B3B3B3" : "#8E8E93",
    border:     dark ? "#2A2A2A" : "#E5E5EA",
    iconBg:     dark ? "#2C2C2E" : "#E5E5EA",
    bubbleAI:   dark ? "#1A1A1A" : "#F2F2F7",
    overlay:    dark ? "#0A0A0A" : "#FFFFFF",
    actionCard: dark ? "#1C1C1E" : "#F2F2F7",
  };
}

// ─── MINI WAVEFORM COMPONENT FOR AUDIO MESSAGES ───────────────────────────────
const N_MINI_BARS = 35;
const MINI_BAR_MAX = 22;
const MINI_BAR_MIN = 3;

function MiniWaveform({ meteringRef, C }: { meteringRef: { current: number }, C: any }) {
  const barSpreads = useRef(Array.from({ length: N_MINI_BARS }, () => 0.3 + Math.random() * 0.7)).current;
  const barAnims = useRef(Array.from({ length: N_MINI_BARS }, () => new Animated.Value(MINI_BAR_MIN))).current;
  const barSmoothedRef = useRef<number[]>(new Array(N_MINI_BARS).fill(MINI_BAR_MIN));

  useEffect(() => {
    const id = setInterval(() => {
      const db = Math.max(-60, Math.min(0, meteringRef.current));
      const energy = Math.pow((db + 60) / 60, 1.5); 
      
      barAnims.forEach((anim, i) => {
        const target = Math.max(MINI_BAR_MIN, energy * MINI_BAR_MAX * barSpreads[i]);
        const smoothed = barSmoothedRef.current[i] * 0.35 + target * 0.65; 
        barSmoothedRef.current[i] = smoothed;
        anim.setValue(smoothed);
      });
    }, 50);
    
    return () => clearInterval(id);
  }, [meteringRef]);

  return (
    <View style={styles.miniWaveContainer}>
      {barAnims.map((anim, i) => (
        <Animated.View key={i} style={[styles.miniWaveBar, { height: anim, backgroundColor: C.sub }]} />
      ))}
    </View>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function KwameScreen() {
  const router  = useRouter();
  const dark    = useColorScheme() === 'dark';
  const C       = makeC(dark);
  const insets  = useSafeAreaInsets();

  const { messages, addMessage, loadHistory, clearHistory } = useChatStore();
  const setJourney    = useJourneyStore((state: any) => state.setJourney);
  const kwameSettings = useKwameSettingsStore((s) => s.settings);
  const loadSettings  = useKwameSettingsStore((s) => s.load);
  const sessionId     = "kwame_main_session";

  const [uiMode,            setUiMode]            = useState<'chat' | 'voice'>('chat');
  const [voiceState,        setVoiceState]        = useState<'idle' | 'listening' | 'speaking' | 'processing'>('idle');
  const [inputText,         setInputText]         = useState('');
  const [loading,           setLoading]           = useState(false);
  const [holdingPhrase,     setHoldingPhrase]     = useState<string | null>(null);
  const [isMuted,           setIsMuted]           = useState(false);
  const [isSpeakerOn,       setIsSpeakerOn]       = useState(true);
  const [streamingMessageId,setStreamingMessageId]= useState<string | null>(null);
  const [showScrollBottom,  setShowScrollBottom]  = useState(false);
  const [speakingMsgId,     setSpeakingMsgId]     = useState<string | null>(null);

  const [isRecordingMsg,    setIsRecordingMsg]    = useState(false);

  // ─── Pre-load UI Sound Effects ──────────────────────────────────────────────
  const triggerPlayer = useAudioPlayer(require('../assets/sounds/trigger.mp3'));
  const clickPlayer   = useAudioPlayer(require('../assets/sounds/click.mp3'));

  const audioRecorder     = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState     = useAudioRecorderState(audioRecorder, 80);
  const latestMeteringRef = useRef<number>(-160);
  
  useEffect(() => { latestMeteringRef.current = recorderState.metering ?? -160; }, [recorderState.metering]);

  const [audioPlayerUri, setAudioPlayerUri] = useState<string | null>(null);
  const audioPlayer = useAudioPlayer(audioPlayerUri);

  const orbScaleAnim        = useRef(new Animated.Value(1)).current;
  const scrollViewRef       = useRef<ScrollView>(null);
  const animRunner          = useRef<Animated.CompositeAnimation | null>(null);

  const silenceStartRef = useRef<number | null>(null);
  const vadIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSpeechRef    = useRef(false);
  const voiceActiveRef  = useRef(false);

  // Adaptive VAD state: the noise floor tracks ambient loudness so "silence"
  // means the *user* stopped talking, not that the street went quiet.
  const noiseFloorRef       = useRef(-50);
  const speechAccumMsRef    = useRef(0);
  const vadStartRef         = useRef(0);
  const calibratingUntilRef = useRef(0);

  // Upcoming calendar events (next 24 h) — fetched once per screen visit,
  // sent as context so "get me to my meeting" resolves to a real place.
  const calendarCtxRef = useRef<KwameContext | undefined>(undefined);

  // Live trip snapshot (published by useNavigation) → in-trip copilot.
  const navSnapshot = useNavStateStore((s) => s.snapshot);
  const onTrip = navSnapshot.tripStatus === "IN_TRANSIT" || navSnapshot.tripStatus === "PAUSED";

  /** Merge calendar + live-trip context for every Kwame request. */
  const buildContext = (): KwameContext | undefined => {
    const nav: NavContext | undefined = onTrip
      ? {
          trip_status:      navSnapshot.tripStatus,
          destination:      navSnapshot.destination,
          next_instruction: navSnapshot.nextInstruction,
          segment_mode:     navSnapshot.currentSegmentMode,
          current_line:     navSnapshot.currentLine,
          stops_remaining:  navSnapshot.stopsRemaining,
          current_stop:     navSnapshot.currentStopName,
          remaining_m:      navSnapshot.remainingDistanceM,
          eta:              navSnapshot.etaIso
            ? new Date(navSnapshot.etaIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : null,
        }
      : undefined;
    const calendar = calendarCtxRef.current?.calendar_events;
    if (!nav && !calendar?.length) return undefined;
    return { ...(calendar?.length ? { calendar_events: calendar } : {}), ...(nav ? { nav } : {}) };
  };

  const isProcessing = loading || voiceState === 'processing';

  const fetchCurrentLocation = async () => {
    let lat = -1.2921, lng = 36.8219;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch (e) {}
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
      const minScale = 0.95;
      const maxScale = voiceState === 'speaking' ? 1.3 : 1.15;
      const randomAmplitude = Math.random() * (maxScale - minScale) + minScale;
      animRunner.current = Animated.spring(orbScaleAnim, {
        toValue: randomAmplitude, speed: 25, bounciness: 8, useNativeDriver: true,
      });
      animRunner.current.start(({ finished }) => {
        if (finished && isActive) simulateAudioWaveform();
      });
    };
    simulateAudioWaveform();
    return () => { isActive = false; animRunner.current?.stop(); };
  }, [uiMode, voiceState, orbScaleAnim]);

  const startVAD = () => {
    // ── Adaptive VAD with auto-submit ──
    // Instead of a fixed dB threshold, we continuously track the ambient
    // noise floor and treat "speech" as sound clearly ABOVE that floor.
    // A matatu idling next to the user raises the floor, so engine noise
    // never counts as speech — and once the user pauses ~2.5 s, we submit.
    const SILENCE_HOLD_MS      = Math.min(3000, Math.max(2000, kwameSettings.silenceHoldMs));
    const ONSET_ABOVE_FLOOR    = 9;     // dB above ambience = user speaking
    const RELEASE_ABOVE_FLOOR  = 4;     // hysteresis: keep "speaking" until below this
    const MIN_SPEECH_MS        = 350;   // ignore blips (horn, door slam)
    const MAX_UTTERANCE_MS     = 30000; // hard-stop safety
    const CALIBRATION_MS       = 600;   // opening window assumed to be ambience
    const TICK_MS              = 80;

    hasSpeechRef.current        = false;
    silenceStartRef.current     = null;
    speechAccumMsRef.current    = 0;
    vadStartRef.current         = Date.now();
    calibratingUntilRef.current = Date.now() + CALIBRATION_MS;
    noiseFloorRef.current       = Math.max(-60, Math.min(-30, latestMeteringRef.current));

    vadIntervalRef.current = setInterval(() => {
      const level = latestMeteringRef.current; // dBFS, roughly -60..0
      const now   = Date.now();

      // Phase 1 — calibration: seed the floor from ambient sound.
      if (now < calibratingUntilRef.current) {
        noiseFloorRef.current = Math.max(-60, Math.min(-20, noiseFloorRef.current * 0.6 + level * 0.4));
        return;
      }

      const inSpeech   = hasSpeechRef.current && silenceStartRef.current === null;
      const threshold  = noiseFloorRef.current + (inSpeech ? RELEASE_ABOVE_FLOOR : ONSET_ABOVE_FLOOR);
      const speakingNow = level > threshold;

      if (speakingNow) {
        speechAccumMsRef.current += TICK_MS;
        if (speechAccumMsRef.current >= MIN_SPEECH_MS) {
          hasSpeechRef.current    = true;
          silenceStartRef.current = null;
        }
      } else {
        speechAccumMsRef.current = Math.max(0, speechAccumMsRef.current - TICK_MS);

        // Track the environment while the user isn't speaking: floor rises
        // slowly (sudden noise shouldn't instantly desensitise us) and falls
        // faster (recover sensitivity when things quieten down).
        const a = level > noiseFloorRef.current ? 0.05 : 0.15;
        noiseFloorRef.current = Math.max(-60, Math.min(-20, noiseFloorRef.current * (1 - a) + level * a));

        if (hasSpeechRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current >= SILENCE_HOLD_MS) {
            // User finished talking → auto-submit.
            stopVAD();
            stopRecording();
            return;
          }
        }
      }

      // Safety: never record forever.
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
    voice_name:     kwameSettings.voiceName,
    speaking_rate:  kwameSettings.speakingRate,
    pitch:          kwameSettings.pitch,
    language_code:  kwameSettings.languageCode,
    response_style: kwameSettings.responseStyle,
  });

  // ─── Voice Mode Recording Logic (Continuous) ──────────────────────────────────
  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert('Microphone Access', 'Kwame needs microphone access.'); return; }
      if (audioPlayer?.playing) audioPlayer.pause();

      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoiceState('listening');

      setTimeout(() => startVAD(), 300);
    } catch (err) {
      setVoiceState('idle');
    }
  };

// ─── Voice Mode Recording Logic (Continuous) ──────────────────────────────────
  const stopRecording = async () => {
    if (voiceState !== 'listening') return;
    stopVAD();
    setVoiceState('processing');

    const uri = audioRecorder.uri;
    try {
      await audioRecorder.stop();
      if (!voiceActiveRef.current || !uri) { setVoiceState('idle'); return; }

      await new Promise(resolve => setTimeout(resolve, 150));
      const base64Audio = await new ExpoFile(uri).base64();
      if (!base64Audio || !voiceActiveRef.current) { setVoiceState('idle'); return; }

      // 1. Instantly show the bubble as Transcribing (Replaces the hardcoded text)
      const userMsgId = Math.random().toString();
      addMessage({ id: userMsgId, role: 'user', text: 'Transcribing...' });
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      
      // 2. Fire the Transcription asynchronously
      AiService.transcribeAudio(base64Audio).then(transcript => {
        useChatStore.getState().updateMessageText(userMsgId, transcript);
      });
      
      // 3. Continue with Route Planning
      const { lat, lng } = await fetchCurrentLocation();
      setHoldingPhrase("Processing your route...");
      
      const response = await AiService.planRoute(
        sessionId, undefined, base64Audio, 'audio/mp4', lat, lng, undefined, buildVoiceSettings(), buildContext()
      );

      setHoldingPhrase(null);
      if (!voiceActiveRef.current) { setVoiceState('idle'); return; }

      if (response.spoken_response) {
        const newMsgId = Math.random().toString();
        setStreamingMessageId(newMsgId);
        addMessage({
          id: newMsgId, role: 'assistant', text: response.spoken_response,
          routes: response.routes, actionRequired: response.actionRequired,
          places: response.places, suggestions: response.suggestions,
        });
      }

      if (response.tts_audio && isSpeakerOn && voiceActiveRef.current) {
        await AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        setVoiceState('speaking');
        setAudioPlayerUri(`data:audio/mp3;base64,${response.tts_audio}`);
      } else {
        setVoiceState('idle');
        if (voiceActiveRef.current && !isMuted && kwameSettings.autoListen) {
          setTimeout(() => startRecording(), 800);
        }
      }
    } catch (err: any) {
      setVoiceState('idle');
      setHoldingPhrase(null);
    }
  };

  const handleOrbPress = () => {
    if (isMuted) return;
    if (voiceState === 'idle' || voiceState === 'speaking') startRecording();
    else if (voiceState === 'listening') stopRecording();
  };

  // ─── Play Sounds on Mode Toggle ─────────────────────────────────────────────
  const toggleUiMode = (targetMode: 'chat' | 'voice', opts: { keepAudio?: boolean } = {}) => {
    if (targetMode === 'voice') {
      try {
        if (triggerPlayer) {
          // Force the volume to maximum (1.0) before playing
          triggerPlayer.volume = 1.0;
          if (typeof triggerPlayer.seekTo === 'function') triggerPlayer.seekTo(0);
          triggerPlayer.play();
        }
      } catch (e) {
        console.warn('Could not play trigger sound', e);
      }

      voiceActiveRef.current = true;
      setUiMode('voice');
      if (!isMuted) startRecording();
    } else {
      try {
        if (clickPlayer) {
          if (typeof clickPlayer.seekTo === 'function') clickPlayer.seekTo(0);
          clickPlayer.play();
        }
      } catch (e) {
        console.warn('Could not play close sound', e);
      }

      voiceActiveRef.current = false;
      stopVAD();
      if (!opts.keepAudio && audioPlayer?.playing) audioPlayer.pause();
      if (voiceState === 'listening') audioRecorder.stop().catch(() => {});
      setUiMode('chat');
      if (!opts.keepAudio) setVoiceState('idle');
    }
  };

  // ─── Chat Mode Audio Message Logic (Manual push to talk) ──────────────────────
  const startRecordingMsg = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert('Microphone Access Required', 'Please enable mic access.'); return; }
      if (audioPlayer?.playing) audioPlayer.pause();

      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecordingMsg(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const cancelRecordingMsg = async () => {
    try {
      await audioRecorder.stop();
    } catch (e) {}
    setIsRecordingMsg(false);
  };

  // ─── Chat Mode Audio Message Logic (Manual push to talk) ──────────────────────
  const stopRecordingMsgAndSend = async () => {
    setIsRecordingMsg(false);
    setLoading(true);
    try {
      const uri = audioRecorder.uri;
      await audioRecorder.stop();
      if (!uri) throw new Error("No audio uri");
      
      await new Promise(resolve => setTimeout(resolve, 150));
      const base64Audio = await new ExpoFile(uri).base64();
      
      // 1. Instantly show the bubble as Transcribing
      const userMsgId = Math.random().toString();
      addMessage({ id: userMsgId, role: 'user', text: 'Transcribing...' });
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      // 2. Fire the Transcription asynchronously
      AiService.transcribeAudio(base64Audio).then(transcript => {
        useChatStore.getState().updateMessageText(userMsgId, transcript);
      });
      
      // 3. Fire the main AI Route Planner immediately
      const { lat, lng } = await fetchCurrentLocation();
      const response = await AiService.planRoute(
        sessionId, undefined, base64Audio, 'audio/mp4', lat, lng, undefined, buildVoiceSettings(), buildContext()
      );

      const newMsgId = Math.random().toString();
      setStreamingMessageId(newMsgId);
      addMessage({ id: newMsgId, role: 'assistant', text: response.spoken_response || '', routes: response.routes, actionRequired: response.actionRequired, places: response.places, suggestions: response.suggestions });
    } catch (err) {
       addMessage({ id: Math.random().toString(), role: 'assistant', text: "Failed to send audio message." });
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ─── Text Message Logic ───────────────────────────────────────────────────────
  const handleSendText = async (overrideText?: string, aliasesOverride?: Record<string, { lat: number; lng: number; name: string }>) => {
    const userQuery = (overrideText ?? inputText).trim();
    if (!userQuery || isProcessing) return;
    setInputText('');
    setLoading(true);

    const userMsgId = Math.random().toString();
    addMessage({ id: userMsgId, role: 'user', text: userQuery });

    try {
      const { lat, lng } = await fetchCurrentLocation();
      const response = await AiService.planRoute(
        sessionId, userQuery, undefined, undefined, lat, lng, aliasesOverride, buildVoiceSettings(), buildContext()
      );

      const newMsgId = Math.random().toString();
      setStreamingMessageId(newMsgId);
      addMessage({ id: newMsgId, role: 'assistant', text: response.spoken_response || '', routes: response.routes, actionRequired: response.actionRequired, places: response.places, suggestions: response.suggestions });
    } catch (err) {
      addMessage({ id: Math.random().toString(), role: 'assistant', text: "Network error, please try again." });
    } finally {
      setLoading(false);
    }
  };

  // Place card "Directions" → route to that exact place. The alias pins the
  // name to real coordinates so geocoding can't miss.
  const handlePlaceDirections = (place: KwamePlace) => {
    const aliases = { [place.name.toLowerCase()]: { lat: place.lat, lng: place.lng, name: place.name } };
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
      await AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const { audio } = await AiService.speak(text, buildVoiceSettings());
      setAudioPlayerUri(`data:audio/mp3;base64,${audio}`);
    } catch {
      setSpeakingMsgId(null);
    }
  };

  const handleSelectSavedPlace = async (placeName: string, pLat: number, pLng: number, action: LocationResolutionAction) => {
    setLoading(true);
    const customAliases = { [placeName.toLowerCase()]: { lat: pLat, lng: pLng, name: placeName } };
    const query = action.field === 'from'
      ? `From ${placeName} to ${action.unresolvedName}`
      : `Take me to ${placeName}`;

    addMessage({ id: Math.random().toString(), role: 'user', text: `Use saved place: ${placeName}` });

    try {
      const { lat, lng } = await fetchCurrentLocation();
      const response = await AiService.planRoute(
        sessionId, query, undefined, undefined, lat, lng, customAliases, buildVoiceSettings(), buildContext()
      );
      const newMsgId = Math.random().toString();
      setStreamingMessageId(newMsgId);
      addMessage({ id: newMsgId, role: 'assistant', text: response.spoken_response || '', routes: response.routes, actionRequired: response.actionRequired, places: response.places, suggestions: response.suggestions });
    } catch (err) {
      addMessage({ id: Math.random().toString(), role: 'assistant', text: "Failed to recalculate." });
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 150;
    setShowScrollBottom(!isCloseToBottom);
  };

  const activeBtnBgColor = C.text === '#FFFFFF' ? '#FFFFFF' : '#000000';
  const activeBtnIconColor = C.bg;

  // Suggestion chips stay tappable only on Kwame's latest reply.
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <SafeAreaView edges={['top']} style={[styles.masterContainer, { backgroundColor: C.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.masterContainer}>
        
        {/* Main Chat Flow */}
        <View style={styles.chatView}>
          <ChatHeader C={C} router={router} clearHistory={clearHistory} />

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {messages.map((msg) => (
              <View key={msg.id} style={[styles.bubbleWrapper, msg.role === 'user' ? styles.userWrapper : styles.aiWrapper]}>
                <MessageBubble msg={msg} C={C} isStreaming={msg.id === streamingMessageId} />
                <ActionUI msg={msg} C={C} router={router} onSelectPlace={handleSelectSavedPlace} />
                {msg.routes && msg.routes.length > 0 && (
                  <RouteScroller routes={msg.routes} C={C} />
                )}
                {msg.places && msg.places.length > 0 && (
                  <PlacesScroller places={msg.places} C={C} onDirections={handlePlaceDirections} />
                )}
                {msg.suggestions && msg.suggestions.length > 0 && msg.id === lastAssistantId && (
                  <SuggestionChips
                    suggestions={msg.suggestions}
                    C={C}
                    disabled={isProcessing}
                    onPress={(sug) => handleSendText(sug)}
                  />
                )}
                {msg.role === 'assistant' && (
                  <View style={styles.bubbleUtilityRow}>
                    <TouchableOpacity onPress={() => Clipboard.setStringAsync(msg.text)} hitSlop={10} style={styles.utilityIcon}>
                      <Ionicons name="copy-outline" size={16} color={C.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={10} style={styles.utilityIcon}
                      onPress={() => handleSpeak(msg.id, msg.text)} disabled={msg.id === streamingMessageId}
                    >
                      <Ionicons
                        name={speakingMsgId === msg.id ? "stop-circle-outline" : "volume-medium-outline"}
                        size={18} color={speakingMsgId === msg.id ? ORANGE : C.sub}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            {loading && (
              <View style={[styles.bubbleWrapper, styles.aiWrapper]}>
                <View style={[styles.loaderBubble, { backgroundColor: C.bubbleAI }]}>
                  <ActivityIndicator color={ORANGE} size="small" />
                </View>
              </View>
            )}
            {/* Added extra space at bottom when Voice is active to prevent orb overlapping last message */}
            {uiMode === 'voice' && <View style={{ height: 160 }} />}
          </ScrollView>

          {/* In-trip copilot quick questions */}
          {onTrip && uiMode === 'chat' && !isProcessing && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 6, gap: 8 }}
            >
              {[
                navSnapshot.currentSegmentMode !== 'WALK' ? 'How many stops left?' : 'Where do I go next?',
                'When do I arrive?',
                ...(navSnapshot.currentLine ? [`Tell me about Line ${navSnapshot.currentLine}`] : []),
              ].map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => handleSendText(q)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    backgroundColor: C.card, borderColor: C.border, borderWidth: 1,
                    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
                  }}
                >
                  <Ionicons name="navigate-outline" size={12} color={ORANGE} />
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: C.text }}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* ChatGPT-style Interactive Bottom Dock */}
          {uiMode === 'chat' ? (
            <View style={[styles.bottomInputDock, { backgroundColor: C.bg, paddingBottom: insets.bottom + 10 }]}>
              
              {isRecordingMsg ? (
                // --- STATE 3: RECORDING AUDIO MESSAGE ---
                <>
                  <TouchableOpacity style={styles.cancelRecBtn} onPress={cancelRecordingMsg}>
                    <View style={[styles.stopSquare, { backgroundColor: C.text }]} />
                  </TouchableOpacity>
                  
                  <View style={[styles.recordingWaveformPill, { backgroundColor: C.card }]}>
                    <MiniWaveform meteringRef={latestMeteringRef} C={C} />
                  </View>
                  
                  <TouchableOpacity style={[styles.floatingActionBtn, { backgroundColor: activeBtnBgColor }]} onPress={stopRecordingMsgAndSend}>
                    <Ionicons name="arrow-up" size={20} color={activeBtnIconColor} />
                  </TouchableOpacity>
                </>
              ) : (
                // --- STATE 1 & 2: IDLE OR TYPING ---
                <>
                  <View style={[styles.inputPillContainer, { backgroundColor: C.card }]}>
                    <TouchableOpacity style={styles.dockAddonButton} disabled={isProcessing}>
                      <Ionicons name="add" size={26} color={C.sub} />
                    </TouchableOpacity>
                    
                    <TextInput
                      style={[styles.textInputField, { color: C.text }]}
                      placeholder={isProcessing ? "Kwame is thinking..." : "Ask Kwame..."}
                      placeholderTextColor={C.sub}
                      value={inputText}
                      onChangeText={setInputText}
                      editable={!isProcessing}
                      onSubmitEditing={() => handleSendText()}
                    />
                    
                    {/* Inline Mic Icon (disappears when typing) */}
                    {inputText.trim().length === 0 && (
                      <TouchableOpacity style={styles.micActionIcon} onPress={startRecordingMsg} disabled={isProcessing}>
                        <Ionicons name="mic-outline" size={22} color={C.sub} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Right Floating Button Swap */}
                  {inputText.trim().length > 0 ? (
                     // State 2: Text Send Button
                    <TouchableOpacity style={[styles.floatingActionBtn, { backgroundColor: activeBtnBgColor }]} onPress={() => handleSendText()} disabled={isProcessing}>
                      <Ionicons name="arrow-up" size={20} color={activeBtnIconColor} />
                    </TouchableOpacity>
                  ) : (
                     // State 1: Voice Mode Launcher
                    <TouchableOpacity style={[styles.floatingActionBtn, { backgroundColor: '#3B82F6' }]} onPress={() => toggleUiMode('voice')} disabled={isProcessing}>
                      <Ionicons name="headset" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ) : (
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
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  masterContainer:    { flex: 1 },
  chatView:           { flex: 1, width: '100%', height: '100%' },
  scrollContainer:    { flex: 1 },
  scrollContent:      { paddingVertical: 20, paddingHorizontal: 14 },
  bubbleWrapper:      { marginBottom: 16, width: '100%', flexDirection: 'column' },
  userWrapper:        { alignItems: 'flex-end' },
  aiWrapper:          { alignItems: 'flex-start' },
  bubbleUtilityRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 8, gap: 16 },
  utilityIcon:        { padding: 2 },
  loaderBubble:       { paddingHorizontal: 24, paddingVertical: 14, borderTopLeftRadius: 4, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, justifyContent: 'center', alignItems: 'center' },
  
  // Layout for the ChatGPT-style bottom section
  bottomInputDock: { 
    paddingHorizontal: 16, 
    paddingTop: 10, 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 12,
  },
  
  // Idle/Typing State Styles
  inputPillContainer: { 
    flex: 1, 
    minHeight: 40,
    maxHeight: 100,
    flexDirection: 'row', 
    alignItems: 'center', 
    borderRadius: 20, 
    paddingHorizontal: 6,
  },
  dockAddonButton: { 
    padding: 6 
  },
  textInputField: { 
    flex: 1, 
    fontSize: 16, 
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  micActionIcon: { 
    padding: 8 
  },
  floatingActionBtn: {
    width: 38, 
    height: 38,
    borderRadius: 19,
    justifyContent: 'center', 
    alignItems: 'center',
  },

  // Audio Message Recording Styles (Mini Waveform specific)
  cancelRecBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopSquare: {
    width: 14, 
    height: 14, 
    borderRadius: 2,
  },
  recordingWaveformPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  miniWaveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 10,
  },
  miniWaveBar: {
    width: 2.5,
    borderRadius: 2,
  },
});