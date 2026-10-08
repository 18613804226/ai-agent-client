import React, { memo, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import type { SharedValue } from 'react-native-reanimated';
import { INVERTED_CHAT_LIST, CELL_INVERSION_STYLE } from '../utils/chatScroll';
import { WEB_ROW_CONTAINMENT } from '../utils/layout';
import {
  MONO_FONT,
  selectableMarkdownRules,
  nonSelectableMarkdownRules,
  webMarkdownRules,
} from './markdown/markdownRules';
import { StreamingMarkdown } from './markdown/StreamingMarkdown';
import ThoughtCollapsible from './ThoughtCollapsible';
import BouncingDot from './BouncingDot';
import MessageActions from './MessageActions';
import type { Message, ThemeType } from '../types/chat';

// ===================== ChatMessageItem =====================
const ChatMessageItem = memo(
  ({
    item,
    theme,
    isMobile,
    isStreaming,
    playingMsgId,
    setPlayingMsgId,
    onPreviewImage,
    textSelectable = true,
    outerOffsetSV,
    outerMaxSV,
    scrollViewRef,
  }: {
    item: Message;
    theme: ThemeType;
    isMobile: boolean;
    isStreaming?: boolean;
    playingMsgId: string | null;
    setPlayingMsgId: (id: string | null) => void;
    onPreviewImage?: (images: string[], index: number) => void;
    /** 抽屉打开时传 false：禁用文本选择并清掉蓝色选择框，避免误触 */
    textSelectable?: boolean;
    /** 外层列表当前 offset（UI 线程可读），用于思考框贴边联动 */
    outerOffsetSV: SharedValue<number>;
    /** 外层列表最大 offset（UI 线程可读） */
    outerMaxSV: SharedValue<number>;
    /** 外层列表 animated ref（贴边联动 scrollTo 用） */
    scrollViewRef: any;
  }) => {
    const isUser = item.role === 'user';
    const hasContent = !!(item.content && item.content !== '...');
    const hasThought = !!item.thought;
    const isThinking = !isUser && !hasContent && !hasThought;

    const bubbleStyle = useMemo(
      () => [
        styles.bubble,
        { maxWidth: '100%' as const },
        isUser
          ? [styles.bubbleUser, { backgroundColor: theme.bubbleUserBg }]
          : [
              styles.bubbleAi,
              {
                backgroundColor: theme.bubbleAiBg,
                borderColor: theme.border,
              },
            ],
      ],
      [isUser, theme],
    );

    const dynamicMarkdownStyles = useMemo(
      () => ({
        body: { fontSize: 15, lineHeight: 24, color: theme.textMain },
        strong: { fontWeight: 'bold' as const, color: theme.textMain },
        paragraph: { marginTop: 0, marginBottom: 8, color: theme.textMain },
        heading1: {
          fontSize: 20,
          fontWeight: 'bold' as const,
          color: theme.textMain,
          marginTop: 14,
          marginBottom: 6,
          lineHeight: 28,
        },
        heading2: {
          fontSize: 18,
          fontWeight: 'bold' as const,
          color: theme.textMain,
          marginTop: 12,
          marginBottom: 6,
          lineHeight: 24,
        },
        heading3: {
          fontSize: 16,
          fontWeight: 'bold' as const,
          color: theme.textMain,
          marginTop: 10,
          marginBottom: 4,
          lineHeight: 22,
        },
        code_inline: {
          color: theme.textMain,
          fontSize: 14,
          fontFamily: MONO_FONT,
          // 库默认 code_inline 是 { padding:10, borderWidth:1, backgroundColor:'#f5f5f5' }，
          // mergeStyle 会把它们垫在我们的样式下面，未覆盖的属性会回退到这些默认值
          // （padding:10 撑高、#f5f5f5 在深色主题下发白）。这里全部显式清掉。
          padding: 3,
          borderWidth: 0,
          // Web 保留淡色圆角小块；原生去掉背景，只留等宽字体。
          ...(Platform.OS === 'web'
            ? {
                backgroundColor: theme.isDark
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.06)',
                borderRadius: 4,
                paddingHorizontal: 5,
              }
            : { backgroundColor: 'transparent' as const }),
        },
        fence: {
          backgroundColor: theme.isDark ? '#000' : '#eee',
          color: theme.isDark ? '#d4d4d4' : '#333333',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8, // 恢复垂直 padding
          lineHeight: 20,
          fontSize: 14,
          fontFamily: MONO_FONT,
          borderWidth: 0, // 去掉库默认的 1px 白边
          // web 用默认规则时块级渲染，这里让它占满整行；原生沿用 inline-block 撑盒
          display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
          ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
          verticalAlign: 'top' as any,
          marginTop: 10, // ← 代替 '\n'，web 和原生都生效
          marginBottom: 4,
        },

        code_block: {
          backgroundColor: theme.isDark ? '#1e1e1e' : '#f5f5f5',
          color: theme.isDark ? '#d4d4d4' : '#333333',
          borderRadius: 8,
          paddingHorizontal: 10,
          lineHeight: 22,
          fontSize: 14,
          fontFamily: MONO_FONT,
          borderWidth: 0, // 去掉库默认的 1px 白边
          display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
          ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
          verticalAlign: 'top' as any,
          marginTop: 8,
          marginBottom: 4,
        },
        // —— 原生代码块：外层 View 盒子 + 内层等宽文本（web 走上方的 fence/code_block）——
        codeBox: {
          backgroundColor: theme.isDark ? '#000' : '#eee',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          marginTop: 10,
          marginBottom: 4,
          // 去掉 overflow:hidden，否则右上角绝对定位的复制按钮会被裁剪且点击无效
        },
        codeText: {
          color: theme.isDark ? '#d4d4d4' : '#333333',
          fontFamily: MONO_FONT,
          fontSize: 14,
          lineHeight: 20,
        },
        // 代码块右上角复制按钮样式
        codeCopyBtn: {
          position: 'absolute' as const,
          top: 8,
          right: 8,
          padding: 4,
          borderRadius: 4,
          backgroundColor: theme.isDark
            ? 'rgba(255,255,255,0.1)'
            : 'rgba(0,0,0,0.05)',
          zIndex: 10,
        },
        codeCopyIcon: {
          color: theme.isDark ? '#aaa' : '#666',
        },
        blockquote: {
          backgroundColor: theme.isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.05)',
          paddingHorizontal: 10,
          lineHeight: 22,
          color: theme.textMain,
          display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
          verticalAlign: 'top' as any,
          marginTop: 8,
          marginBottom: 4,
        },
        list_item: { color: theme.textMain, marginVertical: 2 },
        table: {
          marginVertical: 10,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 6,
        },
        // Web 用默认规则时列表容器是 View，补一点上下间距，避免紧贴上一段
        ...(Platform.OS === 'web'
          ? {
              bullet_list: { marginTop: 2, marginBottom: 6 },
              ordered_list: { marginTop: 2, marginBottom: 6 },
            }
          : null),
        hr: { backgroundColor: theme.border, height: 1, marginVertical: 12 },
      }),
      [theme],
    );

    // 系统标记行（如「用户中止对话」）：居中、哥倩、不走气泡，跟正常气泡错开
    if (item.systemNote) {
      return (
        <View style={INVERTED_CHAT_LIST ? CELL_INVERSION_STYLE : null}>
          <View style={styles.systemNoteRow}>
            <Text style={[styles.systemNoteText, { color: theme.textMuted }]}>
              {item.content}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={INVERTED_CHAT_LIST ? CELL_INVERSION_STYLE : null}>
        <View
          style={[
            styles.messageRow,
            isUser ? styles.rowUser : styles.rowAi,
            WEB_ROW_CONTAINMENT,
          ]}
        >
          {isUser && item.images && item.images.length > 0 ? (
            <View style={styles.userImagesColumn}>
              {/* 图片气泡（独占一行，位于文本上方） */}
              <View style={[bubbleStyle, styles.imageBubble]}>
                <View style={styles.userImagesContainer}>
                  {item.images.map((imgUri, idx) => (
                    <TouchableOpacity
                      key={`${imgUri.slice(0, 32)}-${idx}`}
                      activeOpacity={0.85}
                      onPress={() => onPreviewImage?.(item.images || [], idx)}
                      style={
                        Platform.OS === 'web'
                          ? ({ cursor: 'pointer' } as any)
                          : undefined
                      }
                    >
                      <Image
                        source={{ uri: imgUri }}
                        style={styles.userImageThumb}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {/* 文本气泡 */}
              <View style={[bubbleStyle, styles.textBubbleBelowImages]}>
                {item.content ? (
                  <Text
                    selectable={textSelectable}
                    style={[
                      styles.messageText,
                      { color: theme.bubbleUserText },
                    ]}
                  >
                    {item.content}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={bubbleStyle}>
              {isThinking ? (
                <View style={styles.thinkingContainer}>
                  <ActivityIndicator
                    size="small"
                    color={theme.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.messageText,
                      { color: theme.textMuted, fontStyle: 'italic' },
                    ]}
                  >
                    思考中...
                  </Text>
                </View>
              ) : isUser ? (
                item.content ? (
                  <Text
                    selectable={textSelectable}
                    style={[
                      styles.messageText,
                      { color: theme.bubbleUserText },
                    ]}
                  >
                    {item.content}
                  </Text>
                ) : null
              ) : (
                <View>
                  {hasThought ? (
                    <ThoughtCollapsible
                      thought={item.thought!}
                      theme={theme}
                      isStreaming={isStreaming}
                      outerOffsetSV={outerOffsetSV}
                      outerMaxSV={outerMaxSV}
                      scrollViewRef={scrollViewRef}
                    />
                  ) : null}

                  {/* 流式正文：两端统一用**段落级增量 markdown**（StreamingMarkdown）——
                    已成形的段落被 StableMarkdown memo 住，每帧只有「还在长的那一段尾巴」
                    重新解析 + 重排，所以成本是有界的；而且与结束后用的是同一套
                    markdown 渲染 + 同一套样式 ⇒
                      ① 吐字期就能看到粗体/代码块/列表/表格，不再是 `**原文**`、
                        未被识别的 ``` 围栏；
                      ② 吐字结束不再「换渲染器 + 行高 22→24」地跳高度。
                    原生端之所以过去走纯 Text，是怕「JS 线程解析 markdown + 重建节点」
                    拖慢吐字（那时还要靠贴底补帧，掉一帧就看得见）。现在 inverted 布局下
                    底部是自动的、不需要任何滚动命令，这份成本只影响吐字流畅度本身，
                    且有 memo 兜底，所以在原生上也直接渲染 markdown。 */}
                  {isStreaming ? (
                    <View style={styles.streamingRow}>
                      <View style={styles.streamingBody}>
                        <StreamingMarkdown
                          content={item.content || ''}
                          style={dynamicMarkdownStyles}
                          rules={
                            // 与「结束后」保持同一套规则：风格不变、选中能力也不变
                            Platform.OS === 'web'
                              ? webMarkdownRules
                              : textSelectable
                                ? selectableMarkdownRules
                                : nonSelectableMarkdownRules
                          }
                        />
                      </View>
                      <BouncingDot color={theme.textMain} />
                    </View>
                  ) : (
                    <Markdown
                      style={dynamicMarkdownStyles}
                      rules={
                        // Web：用自定义规则（含复制按钮）；原生：沿用单一可选文本树
                        Platform.OS === 'web'
                          ? webMarkdownRules
                          : textSelectable
                            ? selectableMarkdownRules
                            : nonSelectableMarkdownRules
                      }
                    >
                      {item.content || ''}
                    </Markdown>
                  )}
                </View>
              )}

              {/* 复制 + 喇叭：吐字完成（ready）后才可点，之前只占位不跳动 */}
              {!isUser && hasContent && (
                <MessageActions
                  content={item.content}
                  messageId={item.id}
                  theme={theme}
                  playingMsgId={playingMsgId}
                  onPlayingChange={setPlayingMsgId}
                  ready={!isStreaming}
                />
              )}
            </View>
          )}
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.content === next.item.content &&
    prev.item.thought === next.item.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming &&
    prev.item.systemNote === next.item.systemNote &&
    prev.playingMsgId === next.playingMsgId &&
    prev.onPreviewImage === next.onPreviewImage &&
    prev.textSelectable === next.textSelectable &&
    prev.outerOffsetSV === next.outerOffsetSV &&
    prev.outerMaxSV === next.outerMaxSV &&
    prev.scrollViewRef === next.scrollViewRef &&
    JSON.stringify(prev.item.images) === JSON.stringify(next.item.images),
);

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  streamingRow: { flexDirection: 'row', alignItems: 'center' },
  /**
   * 流式正文容器：作为 flex item 收缩到可用宽度（气泡宽度只随内容增长、不会来回变），
   * minHeight 与单行正文对齐，避免「只有一个跳动的点」那一刻高度从 22 掉到 16。
   */
  streamingBody: { flexShrink: 1 },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubble: { padding: 14, borderRadius: 16 },
  bubbleUser: { borderTopRightRadius: 4, alignSelf: 'flex-end' },
  bubbleAi: { borderTopLeftRadius: 4, borderWidth: 1, alignSelf: 'flex-start' },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  userImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  userImageThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  imageBubble: {
    marginBottom: 4,
    alignSelf: 'flex-end',
  },
  userImagesColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  textBubbleBelowImages: {
    marginTop: 4,
  },
  systemNoteRow: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 6,
  },
  systemNoteText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    opacity: 0.6,
  },
});

export default ChatMessageItem;
