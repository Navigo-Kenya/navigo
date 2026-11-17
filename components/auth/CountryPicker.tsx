import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/icons/Icon";

export const EAST_AFRICA = [
  { code: "KE", name: "Kenya",       flag: "🇰🇪", dial: "+254", placeholder: "712 345 678" },
  { code: "TZ", name: "Tanzania",    flag: "🇹🇿", dial: "+255", placeholder: "712 345 678" },
  { code: "UG", name: "Uganda",      flag: "🇺🇬", dial: "+256", placeholder: "712 345 678" },
  { code: "RW", name: "Rwanda",      flag: "🇷🇼", dial: "+250", placeholder: "788 123 456" },
  { code: "ET", name: "Ethiopia",    flag: "🇪🇹", dial: "+251", placeholder: "912 345 678" },
  { code: "BI", name: "Burundi",     flag: "🇧🇮", dial: "+257", placeholder: "79 123 456"  },
  { code: "SS", name: "South Sudan", flag: "🇸🇸", dial: "+211", placeholder: "912 345 678" },
  { code: "SO", name: "Somalia",     flag: "🇸🇴", dial: "+252", placeholder: "612 345 678" },
  { code: "ER", name: "Eritrea",     flag: "🇪🇷", dial: "+291", placeholder: "712 345 678" },
  { code: "DJ", name: "Djibouti",    flag: "🇩🇯", dial: "+253", placeholder: "77 123 456"  },
] as const;

export type Country = (typeof EAST_AFRICA)[number];

export function detectCountry(phone: string): Country {
  return EAST_AFRICA.find((c) => phone.startsWith(c.dial)) ?? EAST_AFRICA[0];
}

export function buildFullPhone(country: Country, input: string): string {
  return country.dial + input.replace(/^0/, "").replace(/\D/g, "");
}

interface PickerTheme {
  bg: string;
  text: string;
  textSub: string;
  inputBg: string;
  inputBd: string;
  accent: string;
}

interface Props {
  visible: boolean;
  selected: Country;
  C: PickerTheme;
  bottomInset: number;
  onSelect: (c: Country) => void;
  onClose: () => void;
}

export function CountryPickerModal({ visible, selected, C, bottomInset, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: C.bg, paddingBottom: bottomInset + 16 }]}>
        <View style={[styles.handle, { backgroundColor: C.inputBd }]} />

        <View style={styles.header}>
          <Text style={[styles.title, { color: C.text }]}>Select country</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <View style={[styles.closeBtn, { backgroundColor: C.inputBg }]}>
              <Icon name="close" size={18} color={C.text} />
            </View>
          </Pressable>
        </View>

        <View style={[styles.divider, { backgroundColor: C.inputBd }]} />

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {EAST_AFRICA.map((country, idx) => {
            const isSelected = country.code === selected.code;
            return (
              <Pressable
                key={country.code}
                style={[
                  styles.row,
                  isSelected && { backgroundColor: `${C.accent}10` },
                  idx < EAST_AFRICA.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.inputBd },
                ]}
                onPress={() => onSelect(country)}
              >
                <Text style={styles.flag}>{country.flag}</Text>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: C.text }]}>{country.name}</Text>
                  <Text style={[styles.rowDial, { color: C.textSub }]}>{country.dial}</Text>
                </View>
                {isSelected && (
                  <View style={[styles.check, { backgroundColor: C.accent }]}>
                    <Icon name="checkmark" size={12} color="#FFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handle:   { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  header:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  title:    { fontSize: 17, fontWeight: "700" },
  closeBtn: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  divider:  { height: StyleSheet.hairlineWidth, marginBottom: 4 },
  row:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  flag:     { fontSize: 32, width: 40, textAlign: "center" },
  rowText:  { flex: 1 },
  rowName:  { fontSize: 15, fontWeight: "600" },
  rowDial:  { fontSize: 13, marginTop: 1 },
  check:    { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },
});
