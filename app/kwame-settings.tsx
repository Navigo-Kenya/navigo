import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Switch, ActivityIndicator, useColorScheme, Animated, Alert
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAudioPlayer, AudioModule } from 'expo-audio';
import { useKwameSettingsStore } from '../store/kwameSettingsStore';
import { AiService } from '../services/ai';

const ORANGE = '#FF6F00';

function makeC(dark: boolean) {
  return {
    bg:      dark ? '#000000' : '#F2F2F7', 
    card:    dark ? '#1C1C1E' : '#FFFFFF',
    raised:  dark ? '#2C2C2E' : '#F0F0F5',
    text:    dark ? '#FFFFFF' : '#1C1C1E',
    sub:     dark ? '#8E8E93' : '#8E8E93',
    border:  dark ? '#38383A' : '#E5E5EA',
    divider: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    activeBg:dark ? 'rgba(255, 111, 0, 0.12)' : 'rgba(255, 111, 0, 0.08)',
  };
}

type C = ReturnType<typeof makeC>;

// ─── Data ────────────────────────────────────────────────────────────────────────

const VOICES = [
  { id: 'en-US-Neural2-D', name: 'Marcus', gender: 'M', trait: 'Warm'   },
  { id: 'en-US-Neural2-J', name: 'Devon',  gender: 'M', trait: 'Deep'   },
  { id: 'en-US-Neural2-F', name: 'Amara',  gender: 'F', trait: 'Warm'   },
  { id: 'en-US-Neural2-H', name: 'Zara',   gender: 'F', trait: 'Bright' },
] as const;

const LANGUAGES = [
  { code: 'en-US', flag: '🇺🇸', name: 'English', region: 'American accent' },
  { code: 'en-KE', flag: '🇰🇪', name: 'English', region: 'Kenyan accent'   },
  { code: 'sw-KE', flag: '🇰🇪', name: 'Swahili', region: 'Kenya'           },
  { code: 'fr-FR', flag: '🇫🇷', name: 'French',  region: 'Standard'        },
] as const;

const LANG_PREVIEWS: Record<string, string> = {
  'en-US': "Hi there! I'm Kwame, your transit guide. Ready to navigate the city?",
  'en-KE': "Sasa! I'm Kwame, your transit guide. Ready to hit the road?",
  'sw-KE': "Habari! Mimi ni Kwame, msaidizi wako wa usafiri. Tuko tayari kwenda!",
  'fr-FR': "Bonjour ! Je suis Kwame, votre guide de transport. Prêt à explorer la ville ?",
};

const STYLES = [
  { value: 'casual'       as const, icon: 'chatbubble-ellipses-outline', label: 'Casual',       desc: 'Friendly, like a local' },
  { value: 'professional' as const, icon: 'briefcase-outline',           label: 'Professional', desc: 'Formal and precise'     },
  { value: 'brief'        as const, icon: 'flash-outline',               label: 'Brief',        desc: 'One sentence max'       },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const adj = (v: number, delta: number, min: number, max: number, dp: number) =>
  parseFloat(Math.max(min, Math.min(max, v + delta)).toFixed(dp));

// ─── Sub-components ──────────────────────────────────────────────────────────────

function SectionLabel({ label, C }: { label: string; C: C }) {
  return <Text style={[s.sectionLabel, { color: C.sub }]}>{label}</Text>;
}

function RangeBar({ pct, C }: { pct: number; C: C }) {
  const anim = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: pct, useNativeDriver: false, speed: 25, bounciness: 4 }).start();
  }, [pct]);
  return (
    <View style={[s.rangeTrack, { backgroundColor: C.divider }]}>
      <Animated.View style={[s.rangeFill, {
        width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
      }]} />
    </View>
  );
}

function StepRow({
  label, display, pct, onDec, onInc, C,
}: {
  label: string; display: string; pct: number;
  onDec: () => void; onInc: () => void; C: C;
}) {
  return (
    <View style={[s.stepOuter, { borderBottomColor: C.divider }]}>
      <View style={s.stepInner}>
        <Text style={[s.stepLabel, { color: C.text }]}>{label}</Text>
        <View style={s.stepControls}>
          <TouchableOpacity onPress={onDec} hitSlop={10} style={[s.stepBtn, { backgroundColor: C.raised }]}>
            <Ionicons name="remove" size={16} color={C.text} />
          </TouchableOpacity>
          <Text style={[s.stepValue, { color: ORANGE }]}>{display}</Text>
          <TouchableOpacity onPress={onInc} hitSlop={10} style={[s.stepBtn, { backgroundColor: C.raised }]}>
            <Ionicons name="add" size={16} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>
      <RangeBar pct={pct} C={C} />
    </View>
  );
}

function PreviewActionBtn({ isPreviewing, isPlaying, onToggle, C }: any) {
  return (
    <TouchableOpacity onPress={onToggle} hitSlop={12} style={[s.previewBtn, { backgroundColor: isPlaying ? ORANGE : C.raised }]}>
      {isPreviewing && !isPlaying ? (
        <ActivityIndicator size="small" color={ORANGE} />
      ) : isPlaying ? (
        <Ionicons name="square" size={12} color="#FFF" />
      ) : (
        <Ionicons name="play" size={14} color={C.text} style={{ marginLeft: 2 }} />
      )}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────────

export default function KwameSettingsScreen() {
  const router  = useRouter();
  const dark    = useColorScheme() === 'dark';
  const C       = makeC(dark);
  const insets  = useSafeAreaInsets();

  const { settings, load, set } = useKwameSettingsStore();
  
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [playingId, setPlayingId]               = useState<string | null>(null);
  const [previewUri, setPreviewUri]             = useState<string | null>(null);

  const previewPlayer = useAudioPlayer(previewUri);
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (previewUri && previewPlayer) {
      setLoadingPreviewId(null);
      previewPlayer.volume = 1.0;
      previewPlayer.play();
      const playTime = (previewPlayer.duration || 4) * 1000;
      const timer = setTimeout(() => {
        setPlayingId(null);
        setPreviewUri(null);
      }, playTime + 200);
      return () => clearTimeout(timer);
    }
  }, [previewUri, previewPlayer]);

  const togglePreview = async (id: string, fetchAudioContent: () => Promise<string>) => {
    if (playingId === id || loadingPreviewId === id) {
      previewPlayer?.pause();
      setPlayingId(null);
      setLoadingPreviewId(null);
      setPreviewUri(null);
      return;
    }

    previewPlayer?.pause();
    setPreviewUri(null);
    setPlayingId(null);
    setLoadingPreviewId(id);

    try {
      await AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const audio = await fetchAudioContent();
      setPlayingId(id);
      setPreviewUri(`data:audio/mp3;base64,${audio}`);
    } catch {
      setLoadingPreviewId(null);
      Alert.alert("Preview Failed", "Could not load the voice preview. Check your connection.");
    }
  };

  const handleVoicePreview = (voiceId: string) => {
    togglePreview(voiceId, async () => {
      // Dynamically fetch the text matching the user's currently selected language 
      const text = LANG_PREVIEWS[settings.languageCode] || LANG_PREVIEWS['en-US'];
      
      const { audio } = await AiService.speak(text, { 
        voice_name: voiceId, 
        speaking_rate: settings.speakingRate, 
        pitch: settings.pitch, 
        language_code: settings.languageCode // Respects the active language instead of forcing en-US
      });
      return audio;
    });
  };

  const handleLangPreview = (langCode: string) => {
    togglePreview(langCode, async () => {
      const { audio } = await AiService.speak(
        LANG_PREVIEWS[langCode],
        { voice_name: settings.voiceName, speaking_rate: settings.speakingRate, pitch: settings.pitch, language_code: langCode }
      );
      return audio;
    });
  };

  const speedPct = ((settings.speakingRate - 0.75)         / (1.5 - 0.75)) * 100;
  const pitchPct = ((settings.pitch - (-5))                / 10)            * 100;
  const vadPct   = ((settings.silenceThresholdDb - (-42))  / 17)            * 100;
  const holdPct  = ((settings.silenceHoldMs - 700)         / 1300)          * 100;

  return (
    <SafeAreaView edges={['top']} style={[s.root, { backgroundColor: C.bg }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: C.bg }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={15} style={s.headerBack}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: C.text }]}>Voice Settings</Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Voice persona ──────────────────────────────────────────────── */}
        <SectionLabel label="VOICE PERSONA" C={C} />
        <View style={[s.card, { backgroundColor: C.card }]}>
          {VOICES.map((v, i) => {
            const isSelected = settings.voiceName === v.id;
            return (
              <TouchableOpacity
                key={v.id} activeOpacity={0.7}
                onPress={() => set('voiceName', v.id)}
                style={[s.rowLayout, !isSelected && isSelected && { backgroundColor: C.activeBg }, i !== VOICES.length - 1 && { borderBottomColor: C.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <View style={[s.initCircle, { backgroundColor: isSelected ? ORANGE : C.raised }]}>
                  <Text style={[s.initLetter, { color: isSelected ? '#FFF' : C.sub }]}>{v.name[0]}</Text>
                </View>
                <View style={s.rowLabels}>
                  <Text style={[s.rowTitle, { color: isSelected ? ORANGE : C.text }]}>{v.name}</Text>
                  <Text style={[s.rowSubtitle, { color: C.sub }]}>{v.gender === 'M' ? 'Male' : 'Female'} · {v.trait}</Text>
                </View>
                
                <PreviewActionBtn 
                  isPreviewing={loadingPreviewId === v.id} 
                  isPlaying={playingId === v.id} 
                  onToggle={() => handleVoicePreview(v.id)} 
                  C={C} 
                />
                
                {isSelected && <Ionicons name="checkmark" size={20} color={ORANGE} style={s.trailingCheck} />}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Playback ───────────────────────────────────────────────────── */}
        <SectionLabel label="PLAYBACK" C={C} />
        <View style={[s.card, { backgroundColor: C.card }]}>
          <StepRow
            label="Speed"
            display={`${settings.speakingRate.toFixed(2)}×`}
            pct={speedPct}
            onDec={() => set('speakingRate', adj(settings.speakingRate, -0.05, 0.75, 1.5, 2))}
            onInc={() => set('speakingRate', adj(settings.speakingRate, +0.05, 0.75, 1.5, 2))}
            C={C}
          />
          <StepRow
            label="Pitch"
            display={settings.pitch === 0 ? '0' : settings.pitch > 0 ? `+${settings.pitch}` : `${settings.pitch}`}
            pct={pitchPct}
            onDec={() => set('pitch', adj(settings.pitch, -1, -5, 5, 0))}
            onInc={() => set('pitch', adj(settings.pitch, +1, -5, 5, 0))}
            C={C}
          />
        </View>

        {/* ── Language ───────────────────────────────────────────────────── */}
        <SectionLabel label="LANGUAGE & ACCENT" C={C} />
        <View style={[s.card, { backgroundColor: C.card }]}>
          {LANGUAGES.map((lang, i) => {
            const isSelected = settings.languageCode === lang.code;
            return (
              <TouchableOpacity
                key={lang.code} activeOpacity={0.7}
                onPress={() => set('languageCode', lang.code)}
                style={[s.rowLayout, i !== LANGUAGES.length - 1 && { borderBottomColor: C.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <Text style={s.langFlag}>{lang.flag}</Text>
                <View style={s.rowLabels}>
                  <Text style={[s.rowTitle, { color: isSelected ? ORANGE : C.text }]}>{lang.name}</Text>
                  <Text style={[s.rowSubtitle, { color: C.sub }]}>{lang.region}</Text>
                </View>

                <PreviewActionBtn 
                  isPreviewing={loadingPreviewId === lang.code} 
                  isPlaying={playingId === lang.code} 
                  onToggle={() => handleLangPreview(lang.code)} 
                  C={C} 
                />

                {isSelected && <Ionicons name="checkmark" size={20} color={ORANGE} style={s.trailingCheck} />}
              </TouchableOpacity>
            )
          })}
        </View>
        <Text style={[s.footnote, { color: C.sub }]}>
          Kwame's voice will automatically adjust to fit the selected region's accent.
        </Text>

        {/* ── Personality ────────────────────────────────────────────────── */}
        <SectionLabel label="PERSONALITY" C={C} />
        <View style={[s.card, { backgroundColor: C.card }]}>
          {STYLES.map((item, i) => {
            const isSelected = settings.responseStyle === item.value;
            return (
              <TouchableOpacity
                key={item.value} activeOpacity={0.7}
                onPress={() => set('responseStyle', item.value)}
                style={[s.rowLayout, i !== STYLES.length - 1 && { borderBottomColor: C.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <View style={[s.styleIcon, { backgroundColor: isSelected ? ORANGE : C.raised }]}>
                  <Ionicons name={item.icon as any} size={18} color={isSelected ? '#FFF' : C.sub} />
                </View>
                <View style={s.rowLabels}>
                  <Text style={[s.rowTitle, { color: isSelected ? ORANGE : C.text }]}>{item.label}</Text>
                  <Text style={[s.rowSubtitle, { color: C.sub }]}>{item.desc}</Text>
                </View>
                {isSelected && <Ionicons name="checkmark" size={20} color={ORANGE} style={s.trailingCheck} />}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Behaviour ──────────────────────────────────────────────────── */}
        <SectionLabel label="BEHAVIOUR" C={C} />
        <View style={[s.card, { backgroundColor: C.card }]}>
          <View style={s.rowLayout}>
            <View style={s.rowLabels}>
              <Text style={[s.rowTitle, { color: C.text }]}>Auto-listen</Text>
              <Text style={[s.rowSubtitle, { color: C.sub }]}>
                Restart microphone after Kwame finishes speaking
              </Text>
            </View>
            <Switch
              value={settings.autoListen}
              onValueChange={(v) => set('autoListen', v)}
              trackColor={{ false: C.raised, true: ORANGE }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* ── Voice detection ────────────────────────────────────────────── */}
        <SectionLabel label="VOICE DETECTION" C={C} />
        <View style={[s.card, { backgroundColor: C.card }]}>
          <StepRow
            label="Sensitivity"
            display={`${settings.silenceThresholdDb} dB`}
            pct={vadPct}
            onDec={() => set('silenceThresholdDb', adj(settings.silenceThresholdDb, -1, -42, -25, 0))}
            onInc={() => set('silenceThresholdDb', adj(settings.silenceThresholdDb, +1, -42, -25, 0))}
            C={C}
          />
          <StepRow
            label="Silence hold"
            display={`${(settings.silenceHoldMs / 1000).toFixed(1)} s`}
            pct={holdPct}
            onDec={() => set('silenceHoldMs', adj(settings.silenceHoldMs, -100, 700, 2000, 0))}
            onInc={() => set('silenceHoldMs', adj(settings.silenceHoldMs, +100, 700, 2000, 0))}
            C={C}
          />
        </View>
        <Text style={[s.footnote, { color: C.sub, marginBottom: 20 }]}>
          Lower sensitivity reduces false triggers. Higher hold adds patience before sending.
        </Text>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    height: 54, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12,
  },
  headerBack:   { width: 44, alignItems: 'flex-start' },
  headerSpacer: { width: 44 },
  headerCenter: { alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '600' },

  content: { paddingHorizontal: 16, paddingTop: 10 },

  sectionLabel: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.6,
    marginBottom: 8, marginTop: 24, marginLeft: 16,
  },

  footnote: { fontSize: 13, lineHeight: 18, marginTop: 10, marginHorizontal: 16 },

  card: { borderRadius: 20, overflow: 'hidden' },

  // Range bar
  rangeTrack: { height: 4, borderRadius: 2, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden' },
  rangeFill:  { height: '100%', borderRadius: 2, backgroundColor: ORANGE },

  // Step row
  stepOuter:    { borderBottomWidth: StyleSheet.hairlineWidth },
  stepInner:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  stepLabel:    { fontSize: 16, fontWeight: '500', flex: 1 },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  stepValue: { fontSize: 15, fontWeight: '600', minWidth: 50, textAlign: 'center' },

  // Unified Rows for Voice/Language/Style
  rowLayout: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowLabels: { flex: 1, marginRight: 10 },
  rowTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  rowSubtitle: { fontSize: 13 },
  trailingCheck: { marginLeft: 14 },

  // Specific Row Assets
  initCircle: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  initLetter:  { fontSize: 18, fontWeight: '700' },
  langFlag:    { fontSize: 26, marginRight: 14 },
  styleIcon:   { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  
  // Play preview button
  previewBtn: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
    marginLeft: 10,
  },
});