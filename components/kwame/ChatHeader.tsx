import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, ActionSheetIOS } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  C: any;
  router: any;
  clearHistory: () => void;
}

const ORANGE = "#FF6F00";

export default function ChatHeader({ C, router, clearHistory }: Props) {
  const handleClearChat = () => {
    Alert.alert(
      "Start a new chat?",
      "This will clear your entire conversation history with Kwame.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: clearHistory },
      ]
    );
  };

  const showMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'New chat', 'Settings'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handleClearChat();
          if (buttonIndex === 2) router.push('/kwame-settings');
        }
      );
    } else {
      Alert.alert('Kwame', undefined, [
        { text: 'New chat', style: 'destructive', onPress: handleClearChat },
        { text: 'Settings', onPress: () => router.push('/kwame-settings') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={[styles.topBar, { backgroundColor: C.bg }]}>
      <View style={styles.leftSection}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()} hitSlop={15}>
          {/* Using a menu icon to match the ChatGPT aesthetic, or use chevron-back if nav requires */}
          <Ionicons name="reorder-two-outline" size={28} color={C.text} /> 
        </TouchableOpacity>
        <Text style={styles.brandTitle}>
          Kwame
        </Text>
      </View>
      
      <View style={styles.rightSection}>
        <TouchableOpacity style={styles.iconButton} onPress={clearHistory} hitSlop={10}>
          <Ionicons name="create-outline" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={showMenu} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal" size={22} color={C.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { 
    height: 56, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 12,
  },
  leftSection: { 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 12 
  },
  brandTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: ORANGE,
    letterSpacing: -0.2 
  },
  rightSection: { 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 8
  },
  
  iconButton: { 
    padding: 6 
  },
});