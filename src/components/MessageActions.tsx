import React, { memo, useCallback, useState } from 'react';
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
import { IconSpeakerOn, IconSpeakerOff } from './Icons';

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
    const [isHovered, setIsHovered] = useState(false);
    const [loading, setLoading] = useState(false);
    const isPlaying = playingMsgId === messageId;

    const handleCopy = useCallback(async () => {
      try {
        await Clipboard.setStringAsync(content);
        MyToast.show('已复制到剪贴板');
      } catch {
        MyToast.show('复制失败，请稍后重试');
      }
    }, [content]);

    const handleToggleSpeech = useCallback(async () => {
      // 正在播这条 → 停止
      if (isPlaying) {
        stopSpeech();
        onPlayingChange(null);
        return;
      }
      // 先停掉其他播放（包括自动朗读正在播的内容）
      stopSpeech();
      try {
        setLoading(true);
        onPlayingChange(messageId);
        await playText(content, {
          fetchUrl: async (sentence) => {
            const data = await api.textToSpeech(sentence, 'Nini');
            return data.url;
          },
          onEnd: () => onPlayingChange(null),
        });
      } catch (err) {
        console.error('通义 TTS 播放失败:', err);
        MyToast.show('语音合成失败，请稍后重试');
        onPlayingChange(null);
      } finally {
        setLoading(false);
      }
    }, [content, isPlaying, messageId, onPlayingChange]);

    const active = isPlaying || loading;
    const iconColor = active ? theme.historyActiveText : theme.textMuted;
    const hoverBg = theme.isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.08)';
    const activeBg = 'rgba(29, 161, 242, 0.1)';

    return (
      <View
        style={[styles.row, !ready && styles.hidden]}
        pointerEvents={ready ? 'auto' : 'none'}
      >
        <View
          style={styles.item}
          {...({
            onMouseEnter: () => setIsHovered(true),
            onMouseLeave: () => setIsHovered(false),
          } as any)}
        >
          <TouchableOpacity
            style={[
              styles.btn,
              isHovered && ready ? { backgroundColor: hoverBg } : null,
            ]}
            onPress={handleCopy}
            disabled={!ready}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="复制内容"
          >
            <CopyIcon color={iconColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.item}>
          <TouchableOpacity
            style={[
              styles.btn,
              active ? { backgroundColor: activeBg } : null,
              isHovered && ready && !active ? { backgroundColor: hoverBg } : null,
            ]}
            onPress={handleToggleSpeech}
            disabled={!ready || loading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={active ? '停止朗读' : '朗读内容'}
          >
            {loading ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : isPlaying ? (
              <IconSpeakerOn size={16} color={iconColor} />
            ) : (
              <IconSpeakerOff size={16} color={iconColor} />
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
    marginTop: 4,
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