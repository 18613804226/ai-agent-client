import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HoverTouchable } from './HoverTouchable';
import StatsDrawer, { type StatsSection } from './StatsDrawer';
import * as Clipboard from 'expo-clipboard';
import Svg, { Rect } from 'react-native-svg';
import { MyToast } from './GlobalToast';
import { playText, stopSpeech } from '../services/speechPlayer';
import { api } from '../services/api';
import { IconSpeakerOff, IconHelpCircle } from './Icons';

export interface MessageActionsTheme {
  isDark: boolean;
  textMuted: string;
  historyActiveText: string;
  /** 详情抽屉用：调用方传完整 theme 时带上，没带则用深浅色兜底 */
  textMain?: string;
  border?: string;
}

/** 操作行整体高度固定：吐字完成前后布局完全一致，不会把气泡顶下去造成抖动 */
const ACTION_ROW_HEIGHT = 26;
const ACTION_BTN_SIZE = 24;

interface MessageActionsProps {
  content: string;
  messageId: string;
  theme: MessageActionsTheme;
  isPlaying?: boolean;
  onPlayingChange: (id: string | null) => void;
  /** 吐字未完成时为 false：只占位不响应点击，避免布局跳动 */
  ready?: boolean;
  /** 操作行左侧的小字（耗时 / tokens / 统计）；为空则不占位 */
  metaText?: string;
  /** 小字允许的行数：桌面 Web 统计项多用 2，APP / H5 保持单行（默认 1） */
  metaLines?: number;
  /** 点「?」展开的多行详细统计与口径说明；空数组（无统计数字）不显示「?」按钮 */
  metaDetail?: StatsSection[];
  /** 桌面 Web：hover 出轻量 tooltip；false 则点「?」弹底部抽屉 */
  useTooltip?: boolean;
}

const CopyIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect
      x="9"
      y="9"
      width="13"
      height="13"
      rx="2.5"
      stroke={color}
      strokeWidth="2"
    />
    <Rect
      x="2"
      y="2"
      width="13"
      height="13"
      rx="2.5"
      stroke={color}
      strokeWidth="2"
    />
  </Svg>
);

/** 停止方块：朗读时喇叭位替换成它，暗示「点这里中断」 */
const StopIcon = ({ color, size = 12 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect
      x="5"
      y="5"
      width="14"
      height="14"
      rx="2"
      fill={color}
    />
  </Svg>
);

/**
 * AI 气泡底部操作区：复制 icon + 喇叭 icon。
 * 组件自身保持固定高度，外部只需切换 opacity，避免「吐字完成」瞬间整条气泡重排。
 */
const MessageActions = memo(
  function MessageActions({
    content,
    messageId,
    theme,
    isPlaying = false,
    onPlayingChange,
    ready = true,
    metaText,
    metaLines = 1,
    metaDetail,
    useTooltip = false,
  }: MessageActionsProps) {
    // 三个视觉状态：
    //   喇叭（未读） → 点击后「转圈」（正在请求/合成，还没出声）→ 「停止」（第一个音频真的开播）。
    const [preparing, setPreparing] = useState(false);
    /** 「?」打开的底部抽屉；状态留在本组件，切消息不会串（key 是 msgId） */
    const [showDetail, setShowDetail] = useState(false);
    // 稳定引用：抽屉里的 Pan 手势在 worklet 里 runOnJS 调用它，
    // 每次渲染换函数会让 Gesture 对象白白重建
    const closeDetail = useCallback(() => setShowDetail(false), []);

    // 别的消息接管了播放 / 播放结束等 → 本条的「转圈」要复位，避免卡在转圈不消失
    useEffect(() => {
      if (!isPlaying) setPreparing(false);
    }, [isPlaying]);

    const handleCopy = useCallback(async () => {
      try {
        await Clipboard.setStringAsync(content);
        MyToast.show('已复制到剪贴板');
      } catch {
        MyToast.show('复制失败，请稍后重试');
      }
    }, [content]);

    const handleToggleSpeech = useCallback(async () => {
      // 正在播放或准备中（点击时已置 playingMsgId）→ 中断（喇叭位变「停止」，可随时点掉）
      if (isPlaying) {
        stopSpeech();
        setPreparing(false);
        onPlayingChange(null);
        return;
      }
      // 先停掉其他播放（包括自动朗读正在播的内容）
      stopSpeech();
      setPreparing(true);
      onPlayingChange(messageId);
      try {
        await playText(content, {
          fetchUrl: async (sentence) => {
            const data = await api.textToSpeech(sentence, 'Nini');
            return data.url;
          },
          onStart: () => setPreparing(false), // 出声了：转圈 → 停止
          onEnd: () => {
            setPreparing(false);
            onPlayingChange(null);
          },
        });
      } catch (err) {
        console.error('通义 TTS 播放失败:', err);
        MyToast.show('语音合成失败，请稍后重试');
        setPreparing(false);
        onPlayingChange(null);
      }
    }, [content, isPlaying, messageId, onPlayingChange]);

    const active = isPlaying || preparing;
    // 复制图标颜色与播放状态无关，始终 textMuted；只有喇叭反映播放/加载高亮。
    const copyColor = theme.textMuted;
    const activeColor = active ? theme.historyActiveText : theme.textMuted;
    const hoverBg = theme.isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.08)';
    const activeBg = 'rgba(29, 161, 242, 0.1)';

    return (
      <View>
        <View
          style={[
            styles.row,
            !ready && styles.hidden,
            { pointerEvents: ready ? 'auto' : 'none' },
          ]}
        >
          {/* 耗时 / tokens：靠左，把右侧按钮组顶到行尾 */}
          {metaText ? (
            <View style={styles.meta}>
              <Text
                numberOfLines={metaLines}
                style={[styles.metaText, { color: theme.textMuted }]}
              >
                {metaText}
              </Text>
            </View>
          ) : null}

          {/* 「?」：桌面 Web hover 出轻量 tooltip，APP / H5 点开底部抽屉。
              只有服务端真的带了统计数字（metaDetail 非空）才有这个按钮 */}
          {metaDetail && metaDetail.length > 0 ? (
            <View style={[styles.item, useTooltip && styles.tipAnchor]}>
              <HoverTouchable
                style={[
                  styles.btn,
                  showDetail ? { backgroundColor: activeBg } : null,
                ]}
                hoverBg={showDetail ? activeBg : hoverBg}
                rippleColor={
                  theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'
                }
                onPress={() => setShowDetail((v) => (useTooltip ? !v : true))}
                // RNW 支持这两个 props；只在桌面传，原生 / H5 不传
                {...(useTooltip
                  ? {
                      onMouseEnter: () => setShowDetail(true),
                      onMouseLeave: () => setShowDetail(false),
                    }
                  : {})}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="查看统计说明"
              >
                <IconHelpCircle
                  size={14}
                  color={
                    showDetail ? theme.historyActiveText : theme.textMuted
                  }
                />
              </HoverTouchable>

              {useTooltip && showDetail ? (
                <View
                  style={[
                    styles.tooltip,
                    {
                      backgroundColor: theme.isDark ? '#212225' : '#FFFFFF',
                      borderColor:
                        theme.border || (theme.isDark ? '#333333' : '#DDDDDD'),
                    },
                  ]}
                >
                  {/* 不套 ScrollView：内容全量展示，不出滚动条 */}
                  <View>
                    {metaDetail.map((s, idx) => (
                      <View key={s.title} style={idx > 0 ? styles.tooltipSectionSpacing : null}>
                        <Text
                          style={[
                            styles.tooltipTitle,
                            {
                              color:
                                theme.textMain ||
                                (theme.isDark ? '#FFFFFF' : '#1A1A1A'),
                            },
                          ]}
                        >
                          {s.title}
                        </Text>
                        {s.rows.map((r, i) => (
                          <Text
                            key={i}
                            style={[
                              styles.tooltipRow,
                              s.hint && styles.tooltipHintRow,
                              { color: theme.textMuted },
                            ]}
                          >
                            {r}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 复制：hover 底色由 HoverTouchable 统一处理；颜色固定 textMuted */}
          <View style={styles.item}>
            <HoverTouchable
              style={styles.btn}
              hoverBg={hoverBg}
              rippleColor={theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}
              onPress={handleCopy}
              disabled={!ready}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="复制内容"
            >
              <CopyIcon color={copyColor} />
            </HoverTouchable>
          </View>

          {/* 喇叭：播放/加载时用高亮色 + 高亮底；hover 只影响非播放态 */}
          <View style={styles.item}>
            <HoverTouchable
              style={[
                styles.btn,
                active ? { backgroundColor: activeBg } : null,
              ]}
              hoverBg={active ? activeBg : hoverBg}
              rippleColor={
                active
                  ? theme.historyActiveText
                  : theme.isDark
                    ? 'rgba(255,255,255,0.25)'
                    : 'rgba(0,0,0,0.15)'
              }
              onPress={handleToggleSpeech}
              disabled={!ready}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                preparing ? '朗读准备中' : isPlaying ? '停止朗读' : '朗读内容'
              }
            >
              {preparing ? (
                <ActivityIndicator size="small" color={activeColor} />
              ) : isPlaying ? (
                <StopIcon color={activeColor} />
              ) : (
                <IconSpeakerOff size={16} color={activeColor} />
              )}
            </HoverTouchable>
          </View>
        </View>

        {/* 详细统计与口径说明：挂到根视图的底部抽屉，不占聊天流布局 */}
        <StatsDrawer
          visible={!useTooltip && showDetail && !!metaDetail?.length}
          onClose={closeDetail}
          sections={metaDetail || []}
          theme={{
            isDark: theme.isDark,
            textMain:
              theme.textMain || (theme.isDark ? '#FFFFFF' : '#1A1A1A'),
            textMuted: theme.textMuted,
            border: theme.border || (theme.isDark ? '#333333' : '#DDDDDD'),
          }}
        />
      </View>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.messageId === next.messageId &&
    prev.theme === next.theme &&
    prev.isPlaying === next.isPlaying &&
    prev.ready === next.ready &&
    prev.metaText === next.metaText &&
    prev.metaLines === next.metaLines &&
    prev.metaDetail === next.metaDetail &&
    prev.useTooltip === next.useTooltip,
);

export default MessageActions;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    // 桌面 Web 的小字允许两行：用 minHeight 让行高随内容长到 32px，
    // 单行时仍严格是 ACTION_ROW_HEIGHT，不改动任何一端的既有高度
    minHeight: ACTION_ROW_HEIGHT,
    marginTop: 1,
  },
  hidden: { opacity: 0 },
  /** 左侧小字容器：auto 右外边距把按钮组顶到行尾，长文本可收缩 */
  meta: {
    marginRight: 'auto' as const,
    flexShrink: 1,
    paddingRight: 8,
  },
  metaText: {
    fontSize: 11,
    lineHeight: 16,
  },
  /** tooltip 的定位锚点：只给「?」按钮这一层，不给整行 */
  tipAnchor: {
    position: 'relative' as const,
  },
  /** 桌面 Web 的轻量浮层，浮在按钮上方，不弹抽屉、不占聊天流布局 */
  tooltip: {
    position: 'absolute' as const,
    bottom: 32,
    right: 0,
    width: 340,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 999,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 28px rgba(0,0,0,0.22)' } as any)
      : null),
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  tooltipSectionSpacing: { marginTop: 8 },
  tooltipRow: { fontSize: 11, lineHeight: 17 },
  tooltipHintRow: { fontSize: 10, lineHeight: 15 },
  item: { marginLeft: 4 },
  btn: {
    width: ACTION_BTN_SIZE,
    height: ACTION_BTN_SIZE,
    borderRadius: ACTION_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
});
