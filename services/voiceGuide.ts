// services/voiceGuide.ts
// Thin wrapper around expo-speech for navigation announcements.
// Callers decide WHEN to speak; this module decides HOW.
import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import * as Speech from "expo-speech";
import { usePrefsStore } from "@/store/prefsStore";
import type { ApproachPhase, NavStep } from "./navigationEngine";
import { P, VoiceQueue, type SpokenAlert, type Speaker } from "./navAlerts";

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

// expo-speech behind the queue's Speaker. A line stopped before its audio
// mode was ready is never started (the queue has moved on by then).
let _speechGen = 0;
const speaker: Speaker = {
  speak(text, onDone) {
    const gen = ++_speechGen;
    let finished = false;
    const done = () => { if (!finished) { finished = true; onDone(); } };
    prepareAudio()
      .catch(() => {})
      .then(() => {
        if (gen !== _speechGen) return;
        Speech.speak(text, { language: "en", rate: 1.05, pitch: 1.0, onDone: done, onStopped: done, onError: done });
      });
  },
  stop() {
    _speechGen++;
    Speech.stop();
  },
};

/**
 * The one queue every navigation line goes through: priorities, expiry,
 * each key once, chatter only in quiet gaps (services/navAlerts).
 */
export const NavVoice = new VoiceQueue(speaker);

function niceDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} metres`;
  return `${(m / 1000).toFixed(1)} kilometres`;
}

export const VoiceGuide = {
  /** A cue with its priority, key and expiry (see services/navAlerts). */
  say(alert: SpokenAlert): boolean {
    return NavVoice.say(alert);
  },

  /** Speak a line after what's playing (the same sentence at most every 20 s). */
  announce(text: string) {
    NavVoice.say({ key: `say:${text}:${Math.floor(Date.now() / 20_000)}`, text, priority: P.normal });
  },

  /** Cut in over chatter and speak now (a step change). */
  urgentAnnounce(text: string) {
    NavVoice.say({ key: `urgent:${text}:${Math.floor(Date.now() / 20_000)}`, text, priority: P.high });
  },

  stop() {
    NavVoice.clear();
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