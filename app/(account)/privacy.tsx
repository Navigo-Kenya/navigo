// app/(account)/privacy.tsx
//
// Privacy & security, every row real:
//   - sessions: the sign-ins on the account, each signed out on its own, or
//     all but this phone (api: /auth/sessions);
//   - location: the phone's actual permissions (not app-side switches that
//     nothing read), with the way to change them;
//   - your data: a JSON copy of the account (/auth/export), saved where you
//     choose; what Kwame remembers;
//   - sharing: navigation quality data (NavMetrics stops sending when off)
//     and anonymous road reports (the API hides your name);
//   - deleting the account, for good (/auth/account), with your password or,
//     for Google and Apple accounts, by typing DELETE.
import { ScreenHeader } from "@/components/app/ScreenHeader";
import { AccountService, type AccountSession } from "@/services/account";
import { SettingsService, UserSettings } from "@/services/settings";
import { NavMetrics } from "@/services/navMetrics";
import { useAuthStore } from "@/store/authStore";
import { useSavedStore } from "@/store/savedStore";
import { useContributionStore } from "@/store/contributionStore";
import { usePrefsStore } from "@/store/prefsStore";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/icons/Icon";
import { PressableScale } from "@/components/ui/PressableScale";

const ORANGE = "#FF6F00";
const DANGER = "#EF4444";
const GREEN = "#16A34A";

function makeC(dark: boolean) {
  return {
    bg:      dark ? "#0F0F10" : "#F6F7F8",
    card:    dark ? "#1C1C1F" : "#FFFFFF",
    text:    dark ? "#F4F4F5" : "#111827",
    sub:     dark ? "#A1A1AA" : "#6B7280",
    line:    dark ? "#2A2A2F" : "#EEF0F3",
    icon:    dark ? "#E4E4E7" : "#374151",
    pressed: dark ? "#27272A" : "#F3F4F6",
    field:   dark ? "#27272A" : "#F3F4F6",
    softRed: dark ? "rgba(239,68,68,0.12)" : "#FEF2F2",
  };
}
type P = ReturnType<typeof makeC>;

function ago(iso: string | null): string {
  if (!iso) return "never used";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 2) return "active now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function Section({ title, note, C, children }: { title: string; note?: string; C: P; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.sectionTitle, { color: C.sub }]}>{title}</Text>
      <View style={[s.card, { backgroundColor: C.card }]}>{children}</View>
      {note ? <Text style={[s.note, { color: C.sub }]}>{note}</Text> : null}
    </View>
  );
}

function Row({ icon, label, desc, value, onPress, C, danger, busy }: {
  icon: IconName;
  label: string;
  desc?: string;
  value?: React.ReactNode;
  onPress?: () => void;
  C: P;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: C.pressed } : null]}
      accessibilityRole={onPress ? "button" : undefined}
    >
      <View style={[s.rowIcon, { backgroundColor: danger ? C.softRed : C.field }]}>
        <Icon name={icon} size={17} color={danger ? DANGER : C.icon} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, { color: danger ? DANGER : C.text }]}>{label}</Text>
        {desc ? <Text style={[s.rowDesc, { color: C.sub }]}>{desc}</Text> : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={C.sub} /> : value}
      {onPress && !busy ? <Icon name="chevron-forward" size={16} color={danger ? DANGER : C.sub} /> : null}
    </Pressable>
  );
}

function Toggle({ icon, label, desc, value, onChange, C }: {
  icon: IconName;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  C: P;
}) {
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: C.field }]}>
        <Icon name={icon} size={17} color={C.icon} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, { color: C.text }]}>{label}</Text>
        <Text style={[s.rowDesc, { color: C.sub }]}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: ORANGE, false: undefined }} thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined} />
    </View>
  );
}

function Pill({ ok, text }: { ok: boolean | null; text: string }) {
  const color = ok == null ? "#9CA3AF" : ok ? GREEN : ORANGE;
  return (
    <View style={[s.pill, { backgroundColor: color + "1F" }]}>
      <Text style={[s.pillText, { color }]}>{text}</Text>
    </View>
  );
}

const Sep = ({ C }: { C: P }) => <View style={[s.sep, { backgroundColor: C.line }]} />;

// ─── Screen ──────────────────────────────────────────────────────────────────

interface Perms {
  fg: boolean | null;
  precise: boolean | null;
  bg: boolean | null;
}

export default function Privacy() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const C = makeC(dark);
  const { user, logout } = useAuthStore();
  const devTraces = usePrefsStore((st) => st.prefs.devTraces);
  const isOAuth = !!user?.oauth_provider;

  const [analytics, setAnalytics] = useState(NavMetrics.isEnabled());
  const [anonymous, setAnonymous] = useState(false);
  const [perms, setPerms] = useState<Perms>({ fg: null, precise: null, bg: null });
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Server-saved switches.
  useEffect(() => {
    SettingsService.get()
      .then((st) => {
        setAnonymous(st.privacy.anonymous_reports ?? false);
        setAnalytics(st.privacy.analytics !== false);
        NavMetrics.setEnabled(st.privacy.analytics !== false);
      })
      .catch(() => {});
  }, []);

  // The phone's permissions, re-read when coming back from Settings.
  const readPerms = useCallback(async () => {
    const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    // Android says fine or coarse; iOS doesn't tell apps, so it's left to Settings.
    const acc = fg?.android?.accuracy;
    setPerms({
      fg: fg ? fg.granted : null,
      precise: !fg?.granted ? null : acc == null ? null : acc === "fine",
      bg: bg ? bg.granted : null,
    });
  }, []);
  useEffect(() => {
    readPerms();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") readPerms(); });
    return () => sub.remove();
  }, [readPerms]);

  const loadSessions = useCallback(() => {
    setSessionsError(false);
    AccountService.sessions()
      .then(setSessions)
      .catch(() => { setSessions(null); setSessionsError(true); });
  }, []);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const savePrivacy = (key: keyof UserSettings["privacy"], value: boolean, revert: () => void) => {
    SettingsService.update({ privacy: { [key]: value } as Partial<UserSettings["privacy"]> }).catch(() => {
      revert();
      Alert.alert("Couldn't save", "Check your connection and try again.");
    });
  };

  const signOutSession = (sess: AccountSession) => {
    Alert.alert(
      sess.current ? "Sign out of this phone?" : "Sign out that session?",
      sess.current ? "You'll need to sign in again." : "That phone will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setBusy(`s${sess.id}`);
            try {
              await AccountService.revokeSession(sess.id);
              if (sess.current) { await logout(); router.replace("/(auth)/login" as any); return; }
              loadSessions();
            } catch {
              Alert.alert("Couldn't sign it out", "Check your connection and try again.");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const signOutOthers = () => {
    Alert.alert("Sign out everywhere else?", "Every other phone signed in to your account will need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out others",
        style: "destructive",
        onPress: async () => {
          setBusy("others");
          try {
            const n = await AccountService.revokeOtherSessions();
            loadSessions();
            Alert.alert(n ? "Signed out" : "Nothing to sign out", n ? `${n} other session${n === 1 ? " was" : "s were"} signed out.` : "This phone is the only one signed in.");
          } catch {
            Alert.alert("Couldn't sign them out", "Check your connection and try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  // A JSON copy of the account, saved where the user chooses.
  const exportData = async () => {
    setBusy("export");
    try {
      const json = await AccountService.exportData();
      const name = `navigo-data-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === "android") {
        const SAF = FileSystem.StorageAccessFramework;
        const dir = await SAF.requestDirectoryPermissionsAsync();
        if (!dir.granted) return;
        const uri = await SAF.createFileAsync(dir.directoryUri, name.replace(/\.json$/, ""), "application/json");
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
        Alert.alert("Saved", `Your data is in the folder you chose, as ${name}.`);
      } else {
        const uri = `${FileSystem.documentDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
        await Share.share({ url: uri, title: name });
      }
    } catch (e: any) {
      Alert.alert(
        "Couldn't download your data",
        e?.response?.status === 404 ? "Your Navigo server doesn't offer data downloads yet." : "Check your connection and try again."
      );
    } finally {
      setBusy(null);
    }
  };

  const openSettings = () => { Linking.openSettings().catch(() => {}); };
  const others = (sessions ?? []).filter((x) => !x.current).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Privacy & security" C={{ bg: C.bg, text: C.text, hairline: C.line }} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>

        <Section title="SIGNING IN" C={C}>
          {isOAuth ? (
            <Row C={C} icon="lock-closed" label={`Signed in with ${user?.oauth_provider === "apple" ? "Apple" : "Google"}`} desc="Your password is managed there." />
          ) : (
            <Row
              C={C}
              icon="lock-closed"
              label="Change password"
              desc={user?.phone_number ? `A code is sent to ${user.phone_number}.` : "Add a phone number first: the code is sent by SMS."}
              onPress={() => router.push("/(auth)/forgot-password" as any)}
            />
          )}
        </Section>

        <Section
          title="SESSIONS"
          note="A session lasts 30 days from sign-in. Signing one out ends it at once."
          C={C}
        >
          {sessions == null && !sessionsError ? (
            <View style={s.loading}><ActivityIndicator color={C.sub} /></View>
          ) : sessionsError ? (
            <Row C={C} icon="refresh" label="Couldn't load your sessions" desc="Tap to try again." onPress={loadSessions} />
          ) : (
            <>
              {(sessions ?? []).map((sess, i) => (
                <View key={sess.id}>
                  {i > 0 ? <Sep C={C} /> : null}
                  <Row
                    C={C}
                    icon={sess.current ? "phone-portrait" : "globe"}
                    label={sess.current ? "This phone" : "Another sign-in"}
                    desc={[
                      sess.current ? "active now" : `last used ${ago(sess.last_used_at)}`,
                      sess.created_at ? `since ${new Date(sess.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}` : null,
                    ].filter(Boolean).join(" · ")}
                    value={sess.current ? <Pill ok text="Current" /> : undefined}
                    busy={busy === `s${sess.id}`}
                    onPress={() => signOutSession(sess)}
                  />
                </View>
              ))}
              {others > 0 ? (
                <>
                  <Sep C={C} />
                  <Row C={C} icon="log-out" label={`Sign out ${others} other session${others === 1 ? "" : "s"}`} danger busy={busy === "others"} onPress={signOutOthers} />
                </>
              ) : null}
            </>
          )}
        </Section>

        <Section title="LOCATION" note="These are your phone's settings: change them there." C={C}>
          <Row
            C={C}
            icon="location"
            label="While using Navigo"
            desc="Needed to find you, stages near you and your trips."
            value={<Pill ok={perms.fg} text={perms.fg == null ? "…" : perms.fg ? "Allowed" : "Off"} />}
            onPress={openSettings}
          />
          <Sep C={C} />
          <Row
            C={C}
            icon="locate"
            label="Precise location"
            desc="For the right stage and the exact turn; approximate is a few hundred metres off."
            value={<Pill ok={perms.precise} text={perms.precise == null ? (Platform.OS === "ios" && perms.fg ? "In Settings" : "—") : perms.precise ? "Precise" : "Approximate"} />}
            onPress={openSettings}
          />
          <Sep C={C} />
          <Row
            C={C}
            icon="navigate"
            label="In the background"
            desc="Lets navigation guide you with the screen off. Used only during a trip."
            value={<Pill ok={perms.bg} text={perms.bg == null ? "…" : perms.bg ? "Allowed" : "Off"} />}
            onPress={openSettings}
          />
        </Section>

        <Section title="YOUR DATA" C={C}>
          <Row
            C={C}
            icon="download"
            label="Download your data"
            desc="A file with your profile, settings, saved places and routes, contributions, reports and badges."
            busy={busy === "export"}
            onPress={exportData}
          />
          <Sep C={C} />
          <Row C={C} icon="sparkles" label="What Kwame remembers" desc="See and delete the assistant's memories about you." onPress={() => router.push("/(account)/kwame-memory" as any)} />
          {devTraces ? (
            <>
              <Sep C={C} />
              <Row C={C} icon="play" label="Dev: navigation traces" desc="Replay recorded trips through the engine." onPress={() => router.push("/(account)/dev-replay" as any)} />
            </>
          ) : null}
        </Section>

        <Section title="SHARING" C={C}>
          <Toggle
            C={C}
            icon="map"
            label="Share navigation quality data"
            desc="How often routes are recalculated, GPS drops, how close you arrive: it's how we tune navigation. No names or places you save."
            value={analytics}
            onChange={(v) => {
              setAnalytics(v);
              NavMetrics.setEnabled(v);
              savePrivacy("analytics", v, () => { setAnalytics(!v); NavMetrics.setEnabled(!v); });
            }}
          />
          <Sep C={C} />
          <Toggle
            C={C}
            icon="person"
            label="Anonymous road reports"
            desc="Hide your name and level on the reports you post. They still count for your points and badges."
            value={anonymous}
            onChange={(v) => { setAnonymous(v); savePrivacy("anonymous_reports", v, () => setAnonymous(!v)); }}
          />
        </Section>

        <Section title="DELETE ACCOUNT" C={C}>
          <Row
            C={C}
            icon="trash"
            label="Delete your account"
            desc="For good: your profile, saved places, contributions and badges."
            danger
            onPress={() => setDeleting(true)}
          />
        </Section>
      </ScrollView>

      <DeleteAccountModal visible={deleting} isOAuth={isOAuth} C={C} onClose={() => setDeleting(false)} />
    </View>
  );
}

// ─── Deleting the account ────────────────────────────────────────────────────

function DeleteAccountModal({ visible, isOAuth, C, onClose }: { visible: boolean; isOAuth: boolean; C: P; onClose: () => void }) {
  const router = useRouter();
  const { logout } = useAuthStore();
  const resetSaved = useSavedStore((st) => st.reset);
  const resetContrib = useContributionStore((st) => st.reset);
  const [proof, setProof] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => { if (!visible) { setProof(""); setError(null); } }, [visible]);
  const ready = isOAuth ? proof.trim() === "DELETE" : proof.length > 0;

  const submit = async () => {
    if (!ready || working) return;
    setWorking(true);
    setError(null);
    try {
      await AccountService.deleteAccount(isOAuth ? { confirm: "DELETE" } : { password: proof });
      resetSaved();
      resetContrib();
      await logout();
      onClose();
      router.replace("/(auth)/get-started" as any);
      Alert.alert("Account deleted", "Your account and its data are gone. Thank you for riding with Navigo.");
    } catch (e: any) {
      const status = e?.response?.status;
      setError(
        status === 422 ? (isOAuth ? "Type DELETE in capitals." : "That password isn't right.")
        : status === 409 ? e?.response?.data?.message ?? "This account is managed by an administrator."
        : status === 404 ? "Your Navigo server doesn't offer account deletion yet."
        : "Couldn't delete the account. Check your connection and try again."
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modalCard, { backgroundColor: C.card }]}>
          <View style={[s.modalIcon, { backgroundColor: C.softRed }]}>
            <Icon name="trash" size={24} color={DANGER} />
          </View>
          <Text style={[s.modalTitle, { color: C.text }]}>Delete your account?</Text>
          <View style={{ gap: 6, alignSelf: "stretch" }}>
            <Text style={[s.modalLine, { color: C.text }]}>
              <Text style={{ fontWeight: "800" }}>Deleted: </Text>your profile, saved places and routes, contributions, badges and points, notifications, and what Kwame remembers.
            </Text>
            <Text style={[s.modalLine, { color: C.sub }]}>
              <Text style={{ fontWeight: "800" }}>Kept, without your name: </Text>{"road reports you posted, so the people relying on them aren’t left without."}
            </Text>
            <Text style={[s.modalLine, { color: C.sub }]}>{"This can’t be undone."}</Text>
          </View>
          <TextInput
            value={proof}
            onChangeText={setProof}
            placeholder={isOAuth ? "Type DELETE" : "Your password"}
            placeholderTextColor={C.sub}
            secureTextEntry={!isOAuth}
            autoCapitalize={isOAuth ? "characters" : "none"}
            autoCorrect={false}
            style={[s.input, { backgroundColor: C.field, color: C.text }]}
            accessibilityLabel={isOAuth ? "Type DELETE to confirm" : "Your password"}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={s.modalButtons}>
            <PressableScale onPress={onClose} containerStyle={{ flex: 1 }} style={[s.btn, { backgroundColor: C.field }]}>
              <Text style={[s.btnText, { color: C.text }]}>Keep it</Text>
            </PressableScale>
            <PressableScale
              onPress={submit}
              containerStyle={{ flex: 1.3 }}
              style={[s.btn, { backgroundColor: ready ? DANGER : C.field }]}
              accessibilityState={{ disabled: !ready, busy: working }}
            >
              {working ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[s.btnText, { color: ready ? "#FFFFFF" : C.sub }]}>Delete for good</Text>}
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  body: { padding: 14, gap: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, paddingHorizontal: 4 },
  note: { fontSize: 12, paddingHorizontal: 6, lineHeight: 17 },
  card: { borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15.5, fontWeight: "600" },
  rowDesc: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  pillText: { fontSize: 12, fontWeight: "800" },
  loading: { padding: 18, alignItems: "center" },
  modalWrap: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { borderRadius: 24, padding: 20, alignItems: "center", gap: 12 },
  modalIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalLine: { fontSize: 14, lineHeight: 20 },
  input: { alignSelf: "stretch", height: 48, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
  error: { color: DANGER, fontSize: 13.5, fontWeight: "600", alignSelf: "stretch" },
  modalButtons: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  btn: { height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 15, fontWeight: "800" },
});
