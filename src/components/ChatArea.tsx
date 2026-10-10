import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import ImageViewer from './ImageViewer';
import { useChat } from '../context/appContexts';
import { INVERTED_CHAT_LIST } from '../utils/chatScroll';
import { useChatScroll } from '../hooks/useChatScroll';
import ChatMessageItem from './ChatMessageItem';
import type { ChatAreaProps } from '../types/chat';

// ===================== ChatArea 根组件 =====================
export default function ChatArea({
  messages,
  theme,
  isMobile = false,
  isKeyboardUp = false,
  activeId,
  streamingRenderMsg = null,
  autoRead = false, // 💡 新增
  isDrawerOpen = false, // 抽屉打开时禁用文本选择，防止误触
}: ChatAreaProps) {
const { scrollViewRef } = useChat();
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  // 🧹 抽屉打开时清掉 Web 端已选中的蓝色文本选择框
  // （App 端靠 textSelectable=false 让原生选择自动收起）
  useEffect(() => {
    if (!isDrawerOpen) return;
    if (Platform.OS !== 'web') return;
    const sel = (globalThis as any).getSelection?.();
    sel?.removeAllRanges?.();
  }, [isDrawerOpen]);

  // ==================== 图片全屏预览 ====================
  const [preview, setPreview] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const openPreview = useCallback(
    (images: string[], index: number) => setPreview({ images, index }),
    [],
  );
  const closePreview = useCallback(() => setPreview(null), []);
  const changePreviewIndex = useCallback(
    (index: number) => setPreview((prev) => (prev ? { ...prev, index } : prev)),
    [],
  );

  // 💡 自动朗读相关引用
  const lastAutoReadKeyRef = useRef<string | null>(null);
  const autoPlayingRef = useRef(false);

  // 合并流式临时内容
  const displayMessages = useMemo(() => {
    const merged = !streamingRenderMsg
      ? messages
      : messages.map((msg) => {
          if (msg.id === streamingRenderMsg.msgId) {
            return {
              ...msg,
              content: streamingRenderMsg.content || msg.content,
              thought: streamingRenderMsg.thought || msg.thought,
              isStreaming: true,
            };
          }
          return msg;
        });

    // 逐条 cell 翻转（模拟 RN inverted FlatList）：锚住数组开头 = 视觉底部，
    // 所以原生端需要反转 data（最新在 index 0）。Web 端保持自然顺序。
    return INVERTED_CHAT_LIST ? [...merged].reverse() : merged;
  }, [messages, streamingRenderMsg]);

  const showWelcome =
    (!displayMessages || displayMessages.length === 0) && !isKeyboardUp;

  const {
    scrollViewProps,
    scrollViewStyle,
    showScrollToBottom,
    handleScrollToBottom,
    outerOffsetSV,
    outerMaxSV,
    viewportOnLayout,
  } = useChatScroll({ activeId, streamingRenderMsg, displayMessages });

  return (
    <View style={{ flex: 1 }} onLayout={viewportOnLayout}>
      {showWelcome ? (
        <View style={styles.welcomeOverlay}>
          <View style={styles.emptyContainer}>
            <Text style={styles.welcomeEmoji}>👋</Text>
            <Text style={[styles.welcomeTitle, { color: theme.textMain }]}>
              你好，欢迎使用 AI 智能体
            </Text>
            <Text style={[styles.welcomeSubtitle, { color: theme.textMuted }]}>
              今天有什么想聊的？
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          {...scrollViewProps}
          style={scrollViewStyle}
          contentContainerStyle={[
            styles.scrollContent,
            INVERTED_CHAT_LIST
              ? { flexGrow: 1, justifyContent: 'flex-end' }
              : null,
          ]}
          alwaysBounceVertical={false}
          nativeID="chat-scroll"
        >
          {displayMessages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              item={msg}
              theme={theme}
              isMobile={isMobile}
              isStreaming={!!msg.isStreaming}
              playingMsgId={playingMsgId}
              setPlayingMsgId={setPlayingMsgId}
              onPreviewImage={openPreview}
              textSelectable={!isDrawerOpen}
              outerOffsetSV={outerOffsetSV}
              outerMaxSV={outerMaxSV}
              scrollViewRef={scrollViewRef}
            />
          ))}
        </ScrollView>
      )}

      {/* ✅ 悬浮「回到底部」按钮：上滑超过一定距离才显示 */}
      {!showWelcome && showScrollToBottom && (
        <TouchableOpacity
          onPress={handleScrollToBottom}
          activeOpacity={0.8}
          style={[
            styles.scrollToBottomBtn,
            {
              backgroundColor: theme.isDark
                ? 'rgba(40,40,40,0.92)'
                : 'rgba(255,255,255,0.95)',
              borderColor: theme.border,
            },
          ]}
        >
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 5v14M19 12l-7 7-7-7"
              stroke={theme.textMain}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
      )}

      {/* 点气泡里的图片 → 全屏预览 */}
      <ImageViewer
        visible={preview !== null}
        images={preview?.images ?? []}
        index={preview?.index ?? 0}
        onClose={closePreview}
        onIndexChange={changePreviewIndex}
      />
    </View>
  );
}

// ===================== StyleSheet =====================
const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  welcomeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeEmoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollToBottomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
    elevation: 4,
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
  },
});
