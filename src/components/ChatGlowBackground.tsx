import React, { memo, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * 聊天页 Gemini 风格单层光学氛围背景（全 UI 线程驱动 + 零星点 + 零固定尺寸裁切边界）：
 * - Web 端：单层全视口 radial-gradient + blur(90px)，在任意宽屏下无两侧黑块；
 * - 原生端：单层 8 段高斯衰减 SVG RadialGradient 铺满画布；
 * - 动效：10s 慢速常驻呼吸，空会话时轻微下沉居中与提亮，AI 生成态柔和呼应脉动。
 */

const WEB_GLOW_DARK =
  Platform.OS === 'web'
    ? ({
        backgroundImage:
          'radial-gradient(ellipse 72% 58% at 50% 40%, rgba(66, 103, 210, 0.22) 0%, rgba(79, 70, 229, 0.09) 42%, transparent 72%)',
        filter: 'blur(90px)',
      } as any)
    : null;

const WEB_GLOW_LIGHT =
  Platform.OS === 'web'
    ? ({
        backgroundImage:
          'radial-gradient(ellipse 72% 58% at 50% 40%, rgba(59, 130, 246, 0.13) 0%, rgba(99, 102, 241, 0.05) 42%, transparent 72%)',
        filter: 'blur(90px)',
      } as any)
    : null;

export type ChatGlowBackgroundProps = {
  isDark: boolean;
  /** 模型正在思考/吐字时柔和提亮并启动呼应脉动 */
  isGenerating?: boolean;
  /** 空会话欢迎页：将光晕柔和下移并居中放大，聚焦输入框区域 */
  isEmpty?: boolean;
};

const ChatGlowBackground = memo(function ChatGlowBackground({
  isDark,
  isGenerating = false,
  isEmpty = false,
}: ChatGlowBackgroundProps) {
  const idleBreatheSV = useSharedValue(0);
  const emptySV = useSharedValue(isEmpty ? 1 : 0);
  const activeSV = useSharedValue(isGenerating ? 1 : 0);
  const genPulseSV = useSharedValue(0);

  // 10s 慢速常驻呼吸
  useEffect(() => {
    idleBreatheSV.value = withRepeat(
      withTiming(1, { duration: 10000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(idleBreatheSV);
  }, [idleBreatheSV]);

  // 空状态 / 对话状态位置与亮度平滑切换
  useEffect(() => {
    emptySV.value = withTiming(isEmpty ? 1 : 0, {
      duration: 650,
      easing: Easing.inOut(Easing.quad),
    });
    return () => cancelAnimation(emptySV);
  }, [isEmpty, emptySV]);

  // AI 生成态呼应：柔和提亮并启动脉动，完成后平滑回落
  useEffect(() => {
    activeSV.value = withTiming(isGenerating ? 1 : 0, {
      duration: isGenerating ? 550 : 750,
      easing: Easing.out(Easing.cubic),
    });
    if (isGenerating) {
      genPulseSV.value = 0;
      genPulseSV.value = withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(genPulseSV);
      genPulseSV.value = withTiming(0, { duration: 400 });
    }
    return () => {
      cancelAnimation(activeSV);
      cancelAnimation(genPulseSV);
    };
  }, [isGenerating, activeSV, genPulseSV]);

  const glowAnimatedStyle = useAnimatedStyle(() => {
    const idleOpacity = interpolate(idleBreatheSV.value, [0, 1], [0.8, 1]);
    const emptyOpacityBoost = emptySV.value * 0.14;
    const genOpacityBoost = activeSV.value * (0.14 + 0.12 * genPulseSV.value);
    const opacity = Math.min(1, idleOpacity + emptyOpacityBoost + genOpacityBoost);

    const idleScale = interpolate(idleBreatheSV.value, [0, 1], [1, 1.05]);
    const emptyScaleBoost = emptySV.value * 0.04;
    const genScaleBoost = activeSV.value * 0.025 * genPulseSV.value;
    const scale = idleScale + emptyScaleBoost + genScaleBoost;

    const translateY = emptySV.value * 44;

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const webGlowStyle = isDark ? WEB_GLOW_DARK : WEB_GLOW_LIGHT;
  const gradId = `gemini-glow-${isDark ? 'd' : 'l'}`;
  const stopColor = isDark ? '#4267D2' : '#3B82F6';
  const peakOpacity = isDark ? 0.22 : 0.13;

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      accessibilityIgnoresInvertColors
    >
      <Animated.View style={[styles.glowCanvas, webGlowStyle, glowAnimatedStyle]}>
        {Platform.OS !== 'web' && (
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <Defs>
              <RadialGradient id={gradId} cx="50%" cy="40%" rx="44%" ry="38%">
                <Stop offset="0%" stopColor={stopColor} stopOpacity={peakOpacity} />
                <Stop
                  offset="16%"
                  stopColor={stopColor}
                  stopOpacity={Number((peakOpacity * 0.82).toFixed(3))}
                />
                <Stop
                  offset="32%"
                  stopColor={stopColor}
                  stopOpacity={Number((peakOpacity * 0.56).toFixed(3))}
                />
                <Stop
                  offset="48%"
                  stopColor={stopColor}
                  stopOpacity={Number((peakOpacity * 0.34).toFixed(3))}
                />
                <Stop
                  offset="64%"
                  stopColor={stopColor}
                  stopOpacity={Number((peakOpacity * 0.16).toFixed(3))}
                />
                <Stop
                  offset="78%"
                  stopColor={stopColor}
                  stopOpacity={Number((peakOpacity * 0.06).toFixed(3))}
                />
                <Stop
                  offset="90%"
                  stopColor={stopColor}
                  stopOpacity={Number((peakOpacity * 0.015).toFixed(3))}
                />
                <Stop offset="100%" stopColor={stopColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
          </Svg>
        )}
      </Animated.View>
    </View>
  );
});

export default ChatGlowBackground;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  // 四周适度外扩 12%：配合重度 blur 与空态下沉，避免缩放/位移时边缘被裁出轮廓
  glowCanvas: {
    position: 'absolute',
    top: '-12%',
    bottom: '-12%',
    left: '-12%',
    right: '-12%',
  },
});
