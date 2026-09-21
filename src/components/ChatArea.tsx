import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';

interface ChatAreaProps {
  messages: any[];
  scrollViewRef: React.RefObject<ScrollView>;
  theme: any;
}

export default function ChatArea({ messages, scrollViewRef, theme }: ChatAreaProps) {
  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.scrollContent}
      onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
    >
      {messages.map((item) => {
        const isUser = item.role === 'user';
        return (
          <View key={item.id} style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}>
            <View
              style={[
                styles.bubble,
                isUser
                  ? [styles.bubbleUser, { backgroundColor: theme.bubbleUserBg }]
                  : [styles.bubbleAi, { backgroundColor: theme.bubbleAiBg, borderColor: theme.border }],
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  { color: isUser ? theme.bubbleUserText : theme.bubbleAiText },
                ]}
              >
                {item.content}
              </Text>
              <Text
                style={[
                  styles.timeText,
                  { color: isUser ? theme.timeUserText : theme.timeAiText },
                ]}
              >
                {item.time}
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 20 },
  messageRow: { flexDirection: 'row', marginBottom: 20, alignItems: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', padding: 14, borderRadius: 16 },
  bubbleUser: { borderTopRightRadius: 4 },
  bubbleAi: { borderTopLeftRadius: 4, borderWidth: 1 },
  messageText: { fontSize: 15, lineHeight: 22 },
  timeText: { fontSize: 10, marginTop: 6, alignSelf: 'flex-end' },
});