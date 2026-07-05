// services/voiceGuide.ts
// Thin wrapper around expo-speech for navigation announcements.
// Callers decide WHEN to speak; this module decides HOW.
import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import * as Speech from "expo-speech";
import { usePrefsStore } from "@/store/prefsStore";
import type { ApproachPhase, NavStep } from "./navigationEngine";

type NavHints = "off" | "concise" | "detailed";

// On iOS, AVSpeechSynthesizer respects the ringer/silent switch by default.
// Setting playsInSilentMode overrides this so navigation voice works even
// when the phone is on silent. Audio routing/ducking follows the user's
// voice-guidance prefs, re-applied whenever they change.
let _appliedKey: string | null = null;
let _audioPromise: Promise<void> | null = null;

function currentAudioPrefs() {
  const { voiceDucking, voiceOutput } = usePrefsStore.getState().prefs;
  return { voiceDucking, voiceOutput };
}

function prepareAudio(): Promise<void> {
  const { voiceDucking, voiceOutput } = currentAudioPrefs();
  const key = `${voiceDucking}:${voiceOutput}`;
  if (_appliedKey === key) return Promise.resolve();

  const interruptionMode =
    voiceDucking === "pause" ? "doNotMix"
    : voiceDucking === "mix" ? "mixWithOthers"
    : "duckOthers";

  if (!_audioPromise) {
    _audioPromise = setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode,
      interruptionModeAndroid: interruptionMode === "mixWithOthers" ? "duckOthers" : interruptionMode,
      // Android-only: route nav voice through the earpiece for privacy on a matatu.
      ...(Platform.OS === "android"
        ? { shouldRouteThroughEarpiece: voiceOutput === "earpiece" }
        : {}),
    } as Parameters<typeof setAudioModeAsync>[0])
      .then(() => { _appliedKey = key; })
      .catch((error) => {
        console.warn("Failed to set audio mode for TTS:", error);
      })
      .finally(() => { _audioPromise = null; }); // allow re-apply on pref change
  }
  return _audioPromise ?? Promise.resolve();
}

// Speech serialization — prevents Speech.stop() from cutting off in-flight announcements.
// At most one announcement plays at a time; a second one waits in _pending (replacing
// any earlier pending item so the queue never piles up).
let _speaking = false;
let _pending: string | null = null;

function _play(text: string) {
  _speaking = true;
  Speech.speak(text, {
    language: "en", rate: 1.05, pitch: 1.0,
    onDone:  () => { _speaking = false; if (_pending) { const t = _pending; _pending = null; _play(t); } },
    onError: () => { _speaking = false; _pending = null; },
  });
}

function niceDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} metres`;
  return `${(m / 1000).toFixed(1)} kilometres`;
}

export const VoiceGuide = {
  /** Speak a navigation cue, letting the current announcement finish first. */
  announce(text: string) {
    prepareAudio()
      .then(() => { _speaking ? (_pending = text) : _play(text); })
      .catch(() => { _speaking ? (_pending = text) : _play(text); });
  },

  /** Interrupt any in-flight speech and speak immediately (for step changes). */
  urgentAnnounce(text: string) {
    prepareAudio()
      .then(() => { Speech.stop(); _pending = null; _speaking = false; _play(text); })
      .catch(() => { Speech.stop(); _pending = null; _speaking = false; _play(text); });
  },

  stop() {
    Speech.stop();
    _pending  = null;
    _speaking = false;
  },

  /**
   * Build the announcement string for a given approach phase.
   * Returns null when the hints setting should silence this phase.
   */
  buildAnnouncement(
    phase:               ApproachPhase,
    step:                NavStep | undefined,
    distanceToNextStepM: number,
    navHints:            NavHints,
  ): string | null {
    if (!phase || !step || navHints === "off") return null;
    // preview is a silent holding state — announcement fires when entering "far" at ~500 m
    if (phase === "preview") return null;
    // concise = imminent only; detailed = far + near + imminent
    if (navHints === "concise" && phase !== "imminent") return null;

    const instruction = step.instruction ?? "Continue";

    if (phase === "imminent") return instruction;
    return `In ${niceDistance(distanceToNextStepM)}, ${instruction.toLowerCase()}`;
  },

  /** Stale-key to prevent re-announcing the same phase for the same step. */
  phaseKey(stepIndex: number, phase: ApproachPhase): string {
    return `${stepIndex}-${phase ?? "null"}`;
  },
};