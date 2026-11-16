// components/kwame/MessageBubble.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { renderMarkdownText } from '../../utils/markdown';

const { width } = Dimensions.get('window');

const TypewriterText = ({
  text,
  animate,
  color,
  style,
}: {
  text: string;
  animate: boolean;
  color: string;
  style: any;
}) => {
  const [displayedText, setDisplayedText] = useState(animate ? '' : text);

  useEffect(() => {
    if (!animate) {
      setDisplayedText(text);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, 16);

    return () => clearInterval(timer);
  }, [text, animate]);

  return renderMarkdownText(displayedText, style, color);
};

export default function MessageBubble({
  msg,
  C,
  isStreaming,
}: {
  msg: any;
  C: any;
  isStreaming: boolean;
}) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <View style={[styles.userBubble, { backgroundColor: C.bubbleUser }]}>
        <Text style={[styles.userText, { color: C.text }]}>{msg.text}</Text>
      </View>
    );
  }

  // Unboxed, full-width assistant response matching the reference layout
  return (
    <View style={styles.aiContainer}>
      <TypewriterText
        text={msg.text}
        animate={isStreaming}
        color={C.text}
        style={[styles.aiText, { color: C.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  userBubble: {
    maxWidth: width * 0.78,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
  },
  userText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  aiContainer: {
    width: '100%',
    paddingVertical: 4,
    paddingRight: 8,
  },
  aiText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
});