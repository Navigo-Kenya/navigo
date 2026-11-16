import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  C: any;
  router: any;
  clearHistory: () => void;
  hasMessages?: boolean;
  uiMode?: 'chat' | 'voice';
  onOpenDrawer?: () => void;
  chatTitle?: string;
  lastAssistantText?: string;
}

const ORANGE = '#FF6F00';

export default function ChatHeader({
  C,
  router,
  clearHistory,
  hasMessages = false,
  uiMode = 'chat',
  onOpenDrawer,
  chatTitle = 'Transit Assistant',
  lastAssistantText = '',
}: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const handleShareChat = async () => {
    setMenuVisible(false);
    try {
      await Share.share({
        message: lastAssistantText
          ? `Kwame (Navigo):\n\n${lastAssistantText}`
          : 'Plan your Nairobi transit route with Kwame on Navigo: https://navigo.co.ke',
      });
    } catch {}
  };

  return (
    <>
      <View style={styles.topBar}>
        {/* Left Section: Staggered 2-line Menu Button + Optional Empty-State Pill */}
        <View style={styles.leftSection}>
          <TouchableOpacity
            style={[
              styles.circleBtn,
              { backgroundColor: C.surfacePill, shadowColor: C.shadow },
            ]}
            onPress={onOpenDrawer ?? (() => router.back())}
            activeOpacity={0.75}
            hitSlop={10}
          >
            <View style={styles.staggeredMenuIcon}>
              <View style={[styles.menuLineLong, { backgroundColor: C.text }]} />
              <View style={[styles.menuLineShort, { backgroundColor: C.text }]} />
            </View>
          </TouchableOpacity>

          {!hasMessages && uiMode === 'chat' && (
            <TouchableOpacity
              style={[
                styles.brandPill,
                { backgroundColor: C.surfacePill, shadowColor: C.shadow },
              ]}
              onPress={() => router.push('/kwame-settings')}
              activeOpacity={0.8}
            >
              <View style={styles.sparkleBadge}>
                <Ionicons name="sparkles" size={11} color="#FFFFFF" />
              </View>
              <Text style={[styles.brandPillText, { color: ORANGE }]}>Kwame AI</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Right Section: Context-dependent Floating Controls */}
        <View style={styles.rightSection}>
          {uiMode === 'voice' ? (
            <TouchableOpacity
              style={[
                styles.circleBtn,
                { backgroundColor: C.surfacePill, shadowColor: C.shadow },
              ]}
              onPress={() => router.push('/kwame-settings')}
              activeOpacity={0.75}
            >
              <Ionicons name="options-outline" size={20} color={C.text} />
            </TouchableOpacity>
          ) : hasMessages ? (
            <View
              style={[
                styles.dualActionPill,
                { backgroundColor: C.surfacePill, shadowColor: C.shadow },
              ]}
            >
              <TouchableOpacity
                style={styles.pillIconBtn}
                onPress={clearHistory}
                hitSlop={8}
              >
                <Ionicons name="create-outline" size={20} color={C.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pillIconBtn}
                onPress={() => setMenuVisible(true)}
                hitSlop={8}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.circleBtn,
                { backgroundColor: C.surfacePill, shadowColor: C.shadow },
              ]}
              onPress={() => setMenuVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Custom Floating Context Popover Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuVisible(false)}>
          <View
            style={[
              styles.popoverCard,
              {
                backgroundColor: C.popoverBg,
                borderColor: C.border,
                shadowColor: '#000',
              },
            ]}
          >
            <Text style={[styles.popoverHeaderTitle, { color: C.sub }]} numberOfLines={1}>
              {chatTitle}
            </Text>

            <TouchableOpacity style={styles.popoverRow} onPress={handleShareChat}>
              <Ionicons name="share-outline" size={20} color={C.text} />
              <Text style={[styles.popoverRowText, { color: C.text }]}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.popoverRow}
              onPress={() => {
                setIsPinned(!isPinned);
                setMenuVisible(false);
              }}
            >
              <Ionicons
                name={isPinned ? 'pricetag' : 'pricetag-outline'}
                size={19}
                color={C.text}
              />
              <Text style={[styles.popoverRowText, { color: C.text }]}>
                {isPinned ? 'Unpin chat' : 'Pin'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.popoverRow}
              onPress={() => {
                setMenuVisible(false);
                router.push('/settings');
              }}
            >
              <Ionicons name="folder-outline" size={20} color={C.text} />
              <Text style={[styles.popoverRowText, { color: C.text, flex: 1 }]}>
                Saved places
              </Text>
              <Ionicons name="chevron-forward" size={16} color={C.sub} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.popoverRow}
              onPress={() => {
                setMenuVisible(false);
                router.push('/kwame-settings');
              }}
            >
              <Ionicons name="options-outline" size={20} color={C.text} />
              <Text style={[styles.popoverRowText, { color: C.text }]}>
                Voice & settings
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.popoverRow}
              onPress={() => {
                setMenuVisible(false);
                router.back();
              }}
            >
              <Ionicons name="map-outline" size={20} color={C.text} />
              <Text style={[styles.popoverRowText, { color: C.text }]}>
                Return to map
              </Text>
            </TouchableOpacity>

            <View style={[styles.popoverDivider, { backgroundColor: C.border }]} />

            <TouchableOpacity
              style={styles.popoverRow}
              onPress={() => {
                setMenuVisible(false);
                clearHistory();
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={[styles.popoverRowText, { color: '#FF3B30' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 20,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  staggeredMenuIcon: {
    width: 18,
    height: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  menuLineLong: {
    width: 18,
    height: 2,
    borderRadius: 1,
  },
  menuLineShort: {
    width: 11,
    height: 2,
    borderRadius: 1,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 7,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sparkleBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandPillText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  dualActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 8,
    borderRadius: 21,
    gap: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  pillIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  popoverCard: {
    position: 'absolute',
    top: 102,
    right: 16,
    width: 235,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  popoverHeaderTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  popoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    gap: 14,
  },
  popoverRowText: {
    fontSize: 15,
    fontWeight: '400',
  },
  popoverDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
});