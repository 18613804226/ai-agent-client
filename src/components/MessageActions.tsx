import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HoverTouchable } from './HoverTouchable';
import StatsDrawer, {
  StatsDetailContent,
  type MessageStatsData,
  type StatsSection,
} from './StatsDrawer';
import { WebPortal } from './WebPortal';
import * as Clipboard from 'expo-clipboard';
import Svg, { Rect } from 'react-native-svg';
import { MyToast } from './GlobalToast';
import { markdownToPlainText } from '../utils/markdownToPlain';
import { playText, stopSpeech } from '../services/speechPlayer';
import { api } from '../services/api';
import { IconSpeakerOff, IconHelpCircle } from './Icons';

export interface MessageActionsTheme {
  isDark: boolean;
  textMuted: string;
  textSecondary?: string;
  historyActiveText: string;
  /** 详情抽屉用：调用方传完整 theme 时带上，没带则用深浅色兜底 */
  textMain?: string;
  border?: string;
  borderSubtle?: string;
  surfaceElevated?: string;
  primary?: string;
  primarySoft?: string;
  primaryBorder?: string;
  sendBtnActive?: string;
  warning?: string;
  danger?: string;
}

/** 操作行整体高度固定：吐字完成前后布局完全一致，不会把气泡顶下去造成抖动 */
const ACTION_ROW_HEIGHT = 32;
const ACTION_BTN_SIZE = 30;

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
  /** 移动端底部抽屉用的结构化统计数据 */
  statsData?: MessageStatsData | null;
  /** 桌面 Web：hover 出轻量 tooltip；false 则点「?」弹底部抽屉 */
  useTooltip?: boolean;
}

const CopyIcon = ({ color, size = 15 }: { color: string; size?: number }) => (
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
const StopIcon = ({ color, size = 13 }: { color: string; size?: number }) => (
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

/** 迷你气泡宽度按字数算（11px 字号、中文等宽）。
 *  必须给显式宽度：绝对定位的自动宽走 shrink-to-fit，可用宽度被
 *  「锚容器 24px − left 50%」卡到十几像素，文字被迫逐字换行竖排；
 *  RNW 的 StyleSheet 又会丢弃 whiteSpace 这类原生 CSS 属性，堵死 nowrap 路线 */
const miniTipWidth = (label: string) => 22 + label.length * 11;

/**
 * 桌面 Web 悬停气泡动画外壳：
 * - 外层负责绝对定位/居中，挂 pointerEvents="none"，不干扰按钮的 hover 判定；
 * - 内层做 GPU 合成层 opacity + translateY + scale 进出场过渡，退出完成后再卸载。
 */
function HoverPopover({
  visible,
  origin = 'bottom right',
  offsetY = 6,
  enterScale = 0.96,
  enterMs = 170,
  exitMs = 115,
  anchorStyle,
  cardStyle,
  onCardLayout,
  children,
}: {
  visible: boolean;
  origin?: string;
  offsetY?: number;
  enterScale?: number;
  enterMs?: number;
  exitMs?: number;
  anchorStyle?: any;
  cardStyle?: any;
  onCardLayout?: (e: any) => void;
  children: React.ReactNode;
}) {
  const [rendered, setRendered] = useState(visible);
  const [shown, setShown] = useState(false);

  if (visible && !rendered) {
    setRendered(true);
  }

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (visible) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
    } else {
      setShown(false);
      timer = setTimeout(() => setRendered(false), exitMs + 20);
    }

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (timer) clearTimeout(timer);
    };
  }, [visible, exitMs]);

  if (!rendered) return null;

  return (
    <View style={[anchorStyle, { pointerEvents: 'none' }]}>
      <View
        onLayout={onCardLayout}
        style={[
          cardStyle,
          {
            opacity: shown ? 1 : 0,
            transform: [
              { translateY: shown ? 0 : offsetY },
              { scale: shown ? 1 : enterScale },
            ],
            ...(Platform.OS === 'web'
              ? ({
                  transformOrigin: origin,
                  transitionProperty: 'opacity, transform',
                  transitionDuration: `${shown ? enterMs : exitMs}ms`,
                  transitionTimingFunction: shown
                    ? 'cubic-bezier(0.16, 1, 0.3, 1)'
                    : 'ease-out',
                  willChange: 'opacity, transform',
                } as any)
              : null),
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

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
    statsData,
    useTooltip = false,
  }: MessageActionsProps) {
    // 三个视觉状态：
    //   喇叭（未读） → 点击后「转圈」（正在请求/合成，还没出声）→ 「停止」（第一个音频真的开播）。
    const [preparing, setPreparing] = useState(false);
    /** 「?」打开的统计浮层 / 底部抽屉；状态留在本组件，切消息不会串（key 是 msgId） */
    const [showDetail, setShowDetail] = useState(false);
    /** 桌面 Web 上复制 / 喇叭按钮的悬停小气泡：当前悬停哪个 */
    const [btnTip, setBtnTip] = useState<'copy' | 'speaker' | null>(null);
    const hasStatsDetail = !!(statsData || (metaDetail && metaDetail.length > 0));
    /** 桌面 Web 悬停大浮层：挂到 body 做 fixed 定位，避免被列表裁剪和 contain 遮挡 */
    const helpBtnWrapRef = useRef<any>(null);
    const [anchorRect, setAnchorRect] = useState<{
      left: number;
      right: number;
      top: number;
      bottom: number;
    } | null>(null);
    const [statsCardHeight, setStatsCardHeight] = useState(0);

    const measureHelpAnchor = useCallback(() => {
      if (Platform.OS !== 'web') return;
      const rect = helpBtnWrapRef.current?.getBoundingClientRect?.();
      if (rect) {
        setAnchorRect({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        });
      }
    }, []);

    // 稳定引用：抽屉里的 Pan 手势在 worklet 里 runOnJS 调用它，
    // 每次渲染换函数会让 Gesture 对象白白重建
    const closeDetail = useCallback(() => setShowDetail(false), []);

    // 滚动聊天列表或窗口尺寸变化时自动收起固定定位浮层，避免悬空错位
    useEffect(() => {
      if (!useTooltip || !showDetail || Platform.OS !== 'web') return;
      const win = globalThis as any;
      if (!win?.addEventListener) return;
      const dismiss = () => setShowDetail(false);
      win.addEventListener('scroll', dismiss, { capture: true, passive: true });
      win.addEventListener('resize', dismiss);
      return () => {
        win.removeEventListener('scroll', dismiss, true);
        win.removeEventListener('resize', dismiss);
      };
    }, [useTooltip, showDetail]);

    // 别的消息接管了播放 / 播放结束等 → 本条的「转圈」要复位，避免卡在转圈不消失
    useEffect(() => {
      if (!isPlaying) setPreparing(false);
    }, [isPlaying]);

    const handleCopy = useCallback(async () => {
      try {
        // 复制纯文本：用户粘贴出来是正常文字，不再带 **/#/``` 等 Markdown 标记
        await Clipboard.setStringAsync(markdownToPlainText(content));
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
    // 常态图标用次要灰（比弱化灰更易辨识）；喇叭播放/加载时高亮。
    const idleColor = theme.textSecondary ?? theme.textMuted;
    const activeColor = active ? theme.historyActiveText : idleColor;
    const hoverBg = theme.isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.08)';
    const activeBg = 'rgba(29, 161, 242, 0.1)';
    const statsTheme = {
      isDark: theme.isDark,
      textMain: theme.textMain || (theme.isDark ? '#FFFFFF' : '#1A1A1A'),
      textMuted: theme.textMuted,
      textSecondary: theme.textSecondary,
      border: theme.border || (theme.isDark ? '#333333' : '#DDDDDD'),
      borderSubtle: theme.borderSubtle,
      surfaceElevated: theme.surfaceElevated,
      primary: theme.primary,
      primarySoft: theme.primarySoft,
      primaryBorder: theme.primaryBorder,
      warning: theme.warning,
      danger: theme.danger,
    };

    const webStatsPopoverLayout = (() => {
      if (!useTooltip || Platform.OS !== 'web' || !anchorRect) return null;
      const win = globalThis as any;
      const winW = win?.innerWidth || 1280;
      const winH = win?.innerHeight || 800;
      const cardW = Math.min(380, winW - 24);
      const estH = statsCardHeight > 0 ? statsCardHeight : 480;
      const edge = 12;
      const gap = 8;

      const clampX = (x: number) =>
        Math.max(edge, Math.min(x, winW - cardW - edge));
      const alignLeft = metaText
        ? clampX(anchorRect.right - cardW)
        : clampX(anchorRect.left);

      let left = alignLeft;
      let top = anchorRect.top - gap - estH;
      let origin = metaText ? 'bottom right' : 'bottom left';
      let offsetY = 6;

      if (anchorRect.top - gap - estH >= edge) {
        top = anchorRect.top - gap - estH;
        origin = metaText ? 'bottom right' : 'bottom left';
        offsetY = 6;
      } else if (anchorRect.bottom + gap + estH <= winH - edge) {
        top = anchorRect.bottom + gap;
        origin = metaText ? 'top right' : 'top left';
        offsetY = -6;
      } else {
        // 视口较矮上下都放不下：垂直钳制在视口内，水平避开 `?` 按钮避免挡住悬停源
        top = Math.max(edge, Math.min(winH - estH - edge, anchorRect.top - estH / 2));
        if (anchorRect.left - gap - cardW >= edge) {
          left = anchorRect.left - gap - cardW;
          origin = 'center right';
        } else if (anchorRect.right + gap + cardW <= winW - edge) {
          left = anchorRect.right + gap;
          origin = 'center left';
        } else {
          left = alignLeft;
        }
        offsetY = 4;
      }

      return { cardW, left, top, origin, offsetY };
    })();

    return (
      <View>
        <View
          style={[
            styles.row,
            !metaText && { justifyContent: 'flex-start' },
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

          {/* 「?」：桌面 Web 移入出轻量结构化浮层（点击切换），APP / H5 点开底部抽屉。
              只有服务端真的带了统计数字才有这个按钮 */}
          {hasStatsDetail ? (
            <View
              ref={helpBtnWrapRef}
              style={[
                styles.item,
                !metaText && styles.firstLeftItem,
                useTooltip && styles.tipAnchor,
              ]}
            >
              <HoverTouchable
                style={[
                  styles.btn,
                  showDetail ? { backgroundColor: activeBg } : null,
                ]}
                hoverBg={showDetail ? activeBg : hoverBg}
                rippleColor={
                  theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'
                }
                onPress={() => {
                  if (useTooltip) measureHelpAnchor();
                  setShowDetail((v) => (useTooltip ? !v : true));
                }}
                disabled={!ready}
                // RNW 支持这两个 props；只在桌面传，原生 / H5 不传
                {...(useTooltip
                  ? {
                      onMouseEnter: () => {
                        measureHelpAnchor();
                        setShowDetail(true);
                      },
                      onMouseLeave: () => setShowDetail(false),
                    }
                  : {})}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="查看统计说明"
              >
                <IconHelpCircle
                  size={15}
                  color={
                    showDetail ? theme.historyActiveText : idleColor
                  }
                />
              </HoverTouchable>

              {useTooltip && webStatsPopoverLayout ? (
                <WebPortal>
                  <HoverPopover
                    visible={useTooltip && showDetail}
                    origin={webStatsPopoverLayout.origin}
                    offsetY={webStatsPopoverLayout.offsetY}
                    onCardLayout={(e) => {
                      const h = Math.round(e?.nativeEvent?.layout?.height ?? 0);
                      if (h > 0 && Math.abs(h - statsCardHeight) > 1) {
                        setStatsCardHeight(h);
                      }
                    }}
                    anchorStyle={{
                      position: 'fixed' as any,
                      left: webStatsPopoverLayout.left,
                      top: webStatsPopoverLayout.top,
                      zIndex: 9999,
                    }}
                    cardStyle={[
                      styles.webStatsCard,
                      {
                        width: webStatsPopoverLayout.cardW,
                        backgroundColor: theme.isDark ? '#1C1D20' : '#FFFFFF',
                        borderColor: theme.isDark
                          ? 'rgba(255, 255, 255, 0.14)'
                          : 'rgba(0, 0, 0, 0.10)',
                        boxShadow: theme.isDark
                          ? '0 16px 40px rgba(0, 0, 0, 0.55)'
                          : '0 12px 32px rgba(0, 0, 0, 0.16)',
                      } as any,
                    ]}
                  >
                    <StatsDetailContent
                      compact
                      sections={metaDetail || []}
                      stats={statsData}
                      theme={statsTheme}
                    />
                  </HoverPopover>
                </WebPortal>
              ) : null}
            </View>
          ) : null}

          {/* 复制：hover 底色由 HoverTouchable 统一处理；颜色固定 textMuted */}
          <View
            style={[
              styles.item,
              !metaText && !hasStatsDetail && styles.firstLeftItem,
              useTooltip && styles.tipAnchor,
            ]}
          >
            <HoverTouchable
              style={styles.btn}
              hoverBg={hoverBg}
              rippleColor={theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}
              onPress={handleCopy}
              disabled={!ready}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="复制内容"
              {...(useTooltip
                ? {
                    onMouseEnter: () => setBtnTip('copy'),
                    onMouseLeave: () => setBtnTip(null),
                  }
                : {})}
            >
              <CopyIcon color={idleColor} />
            </HoverTouchable>
            <HoverPopover
              visible={useTooltip && btnTip === 'copy'}
              origin="bottom center"
              offsetY={4}
              enterScale={0.94}
              enterMs={140}
              exitMs={100}
              anchorStyle={styles.miniTipAnchor}
              cardStyle={[
                styles.miniTip,
                {
                  width: miniTipWidth('复制'),
                  backgroundColor: theme.isDark ? '#212225' : '#FFFFFF',
                  borderColor:
                    theme.border || (theme.isDark ? '#333333' : '#DDDDDD'),
                },
              ]}
            >
              <Text
                style={[
                  styles.miniTipText,
                  {
                    color:
                      theme.textMain || (theme.isDark ? '#FFFFFF' : '#1A1A1A'),
                  },
                ]}
              >
                复制
              </Text>
            </HoverPopover>
          </View>

          {/* 喇叭：播放/加载时用高亮色 + 高亮底；hover 只影响非播放态 */}
          <View style={[styles.item, useTooltip && styles.tipAnchor]}>
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
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={
                preparing ? '朗读准备中' : isPlaying ? '停止朗读' : '朗读内容'
              }
              {...(useTooltip
                ? {
                    onMouseEnter: () => setBtnTip('speaker'),
                    onMouseLeave: () => setBtnTip(null),
                  }
                : {})}
            >
              {preparing ? (
                <ActivityIndicator size="small" color={activeColor} />
              ) : isPlaying ? (
                <StopIcon color={activeColor} />
              ) : (
                <IconSpeakerOff size={17} color={activeColor} />
              )}
            </HoverTouchable>
            <HoverPopover
              visible={useTooltip && btnTip === 'speaker'}
              origin="bottom center"
              offsetY={4}
              enterScale={0.94}
              enterMs={140}
              exitMs={100}
              anchorStyle={styles.miniTipAnchor}
              cardStyle={[
                styles.miniTip,
                {
                  width: miniTipWidth(
                    preparing ? '朗读准备中' : isPlaying ? '停止朗读' : '朗读'
                  ),
                  backgroundColor: theme.isDark ? '#212225' : '#FFFFFF',
                  borderColor:
                    theme.border || (theme.isDark ? '#333333' : '#DDDDDD'),
                },
              ]}
            >
              <Text
                style={[
                  styles.miniTipText,
                  {
                    color:
                      theme.textMain || (theme.isDark ? '#FFFFFF' : '#1A1A1A'),
                  },
                ]}
              >
                {preparing ? '朗读准备中' : isPlaying ? '停止朗读' : '朗读'}
              </Text>
            </HoverPopover>
          </View>
        </View>

        {/* 详细统计与口径说明：挂到根视图的底部抽屉，不占聊天流布局 */}
        <StatsDrawer
          visible={!useTooltip && showDetail && hasStatsDetail}
          onClose={closeDetail}
          sections={metaDetail || []}
          stats={statsData}
          theme={statsTheme}
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
    prev.statsData === next.statsData &&
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
    // 去气泡后正文末行直接贴画布：给足 8px 呼吸间隙，不再需要负 marginBottom
    marginTop: 8,
    marginBottom: 0,
  },
  firstLeftItem: { marginLeft: 0 },
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
  /** 悬停小气泡的定位锚点：挂在对应按钮这一层，不给整行 */
  tipAnchor: {
    position: 'relative' as const,
  },
  /** 复制 / 喇叭 / 统计的迷你悬停气泡：小字，居中浮在按钮上方。
   *  nowrap 必须有：绝对定位的 shrink-to-fit 可用宽度被锚容器（24px 按钮）
   *  减去 left 50% 后只剩十几像素，文字被迫逐字换行竖排；禁止换行后
   *  最小内容宽 = 整行文字宽，气泡溢出居中、单行展示 */
  miniTipAnchor: {
    position: 'absolute' as const,
    bottom: 36,
    left: '50%' as const,
    transform: [{ translateX: '-50%' }],
    zIndex: 999,
  },
  miniTip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'web'
      ? ({
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        } as any)
      : null),
  },
  miniTipText: { fontSize: 11, lineHeight: 16, textAlign: 'center' as const },
  webStatsCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  item: { marginLeft: 8 },
  btn: {
    width: ACTION_BTN_SIZE,
    height: ACTION_BTN_SIZE,
    borderRadius: ACTION_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
});
