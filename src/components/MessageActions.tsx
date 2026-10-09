import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Rect } from 'react-native-svg';
import { MyToast } from './GlobalToast';
import { playText, stopSpeech } from '../services/speechPlayer';
import { api } from '../services/api';
import { IconSpeakerOff } from './Icons';

export interface MessageActionsTheme {
  isDark: boolean;
  textMuted: string;
  historyActiveText: string;
}

/** 操作行整体高度固定：吐字完成前后布局完全一致，不会把气泡顶下去造成抖动 */
const ACTION_ROW_HEIGHT = 26;
const ACTION_BTN_SIZE = 24;

interface MessageActionsProps {
  content: string;
  messageId: string;
  theme: MessageActionsTheme;
  playingMsgId: string | null;
  onPlayingChange: (id: string | null) => void;
  /** 吐字未完成时为 false：只占位不响应点击，避免布局跳动 */
  ready?: boolean;
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
    playingMsgId,
    onPlayingChange,
    ready = true,
  }: MessageActionsProps) {
    const [hoverCopy, setHoverCopy] = useState(false);
    const [hoverSpeaker, setHoverSpeaker] = useState(false);
    // 三个视觉状态：
    //   喇叭（未读） → 点击后「转圈」（正在请求/合成，还没出声）→ 「停止」（第一个音频真的开播）。
    const [preparing, setPreparing] = useState(false);
    const isPlaying = playingMsgId === messageId;

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
      <View
        style={[styles.row, !ready && styles.hidden]}
        pointerEvents={ready ? 'auto' : 'none'}
      >
        {/* 复制：独立 hover，只影响自己；颜色固定 textMuted */}
        <View
          style={styles.item}
          {...({
            onMouseEnter: () => setHoverCopy(true),
            onMouseLeave: () => setHoverCopy(false),
          } as any)}
        >
          <TouchableOpacity
            style={[
              styles.btn,
              hoverCopy && ready ? { backgroundColor: hoverBg } : null,
            ]}
            onPress={handleCopy}
            disabled={!ready}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="复制内容"
          >
            <CopyIcon color={copyColor} />
          </TouchableOpacity>
        </View>

        {/* 喇叭：独立 hover；播放/加载时用高亮色 + 高亮底，hover 不覆盖播放态 */}
        <View
          style={styles.item}
          {...({
            onMouseEnter: () => setHoverSpeaker(true),
            onMouseLeave: () => setHoverSpeaker(false),
          } as any)}
        >
          <TouchableOpacity
            style={[
              styles.btn,
              active ? { backgroundColor: activeBg } : null,
              hoverSpeaker && ready && !active
                ? { backgroundColor: hoverBg }
                : null,
            ]}
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
          </TouchableOpacity>
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.messageId === next.messageId &&
    prev.theme === next.theme &&
    prev.playingMsgId === next.playingMsgId &&
    prev.ready === next.ready,
);

export default MessageActions;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: ACTION_ROW_HEIGHT,
    marginTop: 1,
  },
  hidden: { opacity: 0 },
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
