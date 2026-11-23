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
 * 聊天页 Gemini 风格「输入框围绕式」4 层多色光学氛围背景（全 UI 线程驱动 + 零星点 + 全视口无黑边）：
 * 1. Layer 1（outer）：底部居中的克制深靛蓝宽幅基底，10s 慢速呼吸；
 * 2. Layer 2（wingLeft）：向左发散的青碧/湖蓝柔光团，独立相位轻飘；思考时大跨度横移交织；
 * 3. Layer 3（wingRight）：向右发散的紫罗兰/粉紫柔光团，反向异相呼吸；思考时与左翼交织唤醒；
 * 4. Layer 4（core）：贴合输入框的平缓宝石蓝衔接微光，思考时柔和脉动上浮。
 */

type GlowLayerId = 'outer' | 'wingLeft' | 'wingRight' | 'core';

type GradientStop = {
  offset: string;
  opacity: number;
};

type NativeLayerConfig = {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  colorDark: string;
  colorLight: string;
  stopsDark: ReadonlyArray<GradientStop>;
  stopsLight: ReadonlyArray<GradientStop>;
};

const WEB_LAYER_STYLES: Record<'dark' | 'light', Record<GlowLayerId, any>> = {
  dark: {
    outer:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 56% 32% at 50% 83%, rgba(30, 52, 138, 0.15) 0%, rgba(49, 46, 129, 0.08) 42%, rgba(24, 24, 68, 0.03) 68%, transparent 86%)',
            filter: 'blur(96px)',
          }
        : null,
    wingLeft:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 38% 24% at 30% 82%, rgba(6, 182, 212, 0.16) 0%, rgba(20, 184, 166, 0.08) 38%, rgba(14, 116, 144, 0.025) 60%, transparent 76%)',
            filter: 'blur(80px)',
          }
        : null,
    wingRight:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 38% 24% at 70% 82%, rgba(139, 92, 246, 0.16) 0%, rgba(192, 38, 211, 0.075) 38%, rgba(109, 40, 217, 0.025) 60%, transparent 76%)',
            filter: 'blur(80px)',
          }
        : null,
    core:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 38% 15% at 50% 82%, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.055) 46%, transparent 78%)',
            filter: 'blur(56px)',
          }
        : null,
  },
  light: {
    outer:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 56% 32% at 50% 83%, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.04) 44%, transparent 84%)',
            filter: 'blur(96px)',
          }
        : null,
    wingLeft:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 38% 24% at 30% 82%, rgba(6, 182, 212, 0.09) 0%, rgba(20, 184, 166, 0.045) 42%, transparent 76%)',
            filter: 'blur(80px)',
          }
        : null,
    wingRight:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 38% 24% at 70% 82%, rgba(139, 92, 246, 0.09) 0%, rgba(192, 38, 211, 0.04) 42%, transparent 76%)',
            filter: 'blur(80px)',
          }
        : null,
    core:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 38% 15% at 50% 82%, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.035) 46%, transparent 78%)',
            filter: 'blur(56px)',
          }
        : null,
  },
};

const NATIVE_LAYERS: Record<GlowLayerId, NativeLayerConfig> = {
  outer: {
    cx: '50%',
    cy: '83%',
    rx: '48%',
    ry: '28%',
    colorDark: '#1E348A',
    colorLight: '#3B82F6',
    stopsDark: [
      { offset: '0%', opacity: 0.15 },
      { offset: '20%', opacity: 0.105 },
      { offset: '42%', opacity: 0.06 },
      { offset: '64%', opacity: 0.025 },
      { offset: '84%', opacity: 0.008 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.08 },
      { offset: '20%', opacity: 0.056 },
      { offset: '42%', opacity: 0.032 },
      { offset: '64%', opacity: 0.014 },
      { offset: '84%', opacity: 0.004 },
      { offset: '100%', opacity: 0 },
    ],
  },
  wingLeft: {
    cx: '30%',
    cy: '82%',
    rx: '30%',
    ry: '20%',
    colorDark: '#06B6D4',
    colorLight: '#06B6D4',
    stopsDark: [
      { offset: '0%', opacity: 0.15 },
      { offset: '26%', opacity: 0.095 },
      { offset: '54%', opacity: 0.042 },
      { offset: '80%', opacity: 0.012 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.085 },
      { offset: '26%', opacity: 0.055 },
      { offset: '54%', opacity: 0.024 },
      { offset: '80%', opacity: 0.006 },
      { offset: '100%', opacity: 0 },
    ],
  },
  wingRight: {
    cx: '70%',
    cy: '82%',
    rx: '30%',
    ry: '20%',
    colorDark: '#A855F7',
    colorLight: '#8B5CF6',
    stopsDark: [
      { offset: '0%', opacity: 0.15 },
      { offset: '26%', opacity: 0.095 },
      { offset: '54%', opacity: 0.042 },
      { offset: '80%', opacity: 0.012 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.085 },
      { offset: '26%', opacity: 0.055 },
      { offset: '54%', opacity: 0.024 },
      { offset: '80%', opacity: 0.006 },
      { offset: '100%', opacity: 0 },
    ],
  },
  core: {
    cx: '50%',
    cy: '82%',
    rx: '30%',
    ry: '13%',
    colorDark: '#3B82F6',
    colorLight: '#3B82F6',
    stopsDark: [
      { offset: '0%', opacity: 0.11 },
      { offset: '26%', opacity: 0.07 },
      { offset: '54%', opacity: 0.03 },
      { offset: '80%', opacity: 0.008 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.07 },
      { offset: '26%', opacity: 0.045 },
      { offset: '54%', opacity: 0.02 },
      { offset: '80%', opacity: 0.005 },
      { offset: '100%', opacity: 0 },
    ],
  },
};

function NativeRadialLayer({
  layerId,
  isDark,
}: {
  layerId: GlowLayerId;
  isDark: boolean;
}) {
  const cfg = NATIVE_LAYERS[layerId];
  const gradId = `halo-${layerId}-${isDark ? 'd' : 'l'}`;
  const color = isDark ? cfg.colorDark : cfg.colorLight;
  const stops = isDark ? cfg.stopsDark : cfg.stopsLight;

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Defs>
        <RadialGradient id={gradId} cx={cfg.cx} cy={cfg.cy} rx={cfg.rx} ry={cfg.ry}>
          {stops.map((s) => (
            <Stop
              key={s.offset}
              offset={s.offset}
              stopColor={color}
              stopOpacity={s.opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradId})`} />
    </Svg>
  );
}

export type ChatGlowBackgroundProps = {
  isDark: boolean;
  /** 模型正在思考/吐字时唤醒双翼环绕交织与核心光环脉动 */
  isGenerating?: boolean;
  /** 空会话欢迎页：外层氛围略微铺开提亮 */
  isEmpty?: boolean;
};

const ChatGlowBackground = memo(function ChatGlowBackground({
  isDark,
  isGenerating = false,
  isEmpty = false,
}: ChatGlowBackgroundProps) {
  const outerBreatheSV = useSharedValue(0);
  const wingLeftBreatheSV = useSharedValue(0);
  const wingRightBreatheSV = useSharedValue(0);
  const coreBreatheSV = useSharedValue(0);

  const emptySV = useSharedValue(isEmpty ? 1 : 0);
  const activeSV = useSharedValue(isGenerating ? 1 : 0);
  const genPulseSV = useSharedValue(0);
  const genOrbitSV = useSharedValue(0);
  const genOrbitAltSV = useSharedValue(0);

  // 常驻多层错相慢呼吸
  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    outerBreatheSV.value = withRepeat(withTiming(1, { duration: 10000, easing: ease }), -1, true);
    wingLeftBreatheSV.value = withRepeat(withTiming(1, { duration: 8200, easing: ease }), -1, true);
    wingRightBreatheSV.value = withRepeat(withTiming(1, { duration: 9400, easing: ease }), -1, true);
    coreBreatheSV.value = withRepeat(withTiming(1, { duration: 6400, easing: ease }), -1, true);

    return () => {
      cancelAnimation(outerBreatheSV);
      cancelAnimation(wingLeftBreatheSV);
      cancelAnimation(wingRightBreatheSV);
      cancelAnimation(coreBreatheSV);
    };
  }, [outerBreatheSV, wingLeftBreatheSV, wingRightBreatheSV, coreBreatheSV]);

  // 空会话状态平滑过渡
  useEffect(() => {
    emptySV.value = withTiming(isEmpty ? 1 : 0, {
      duration: 650,
      easing: Easing.inOut(Easing.quad),
    });
    return () => cancelAnimation(emptySV);
  }, [isEmpty, emptySV]);

  // AI 思考/生成态：唤醒双翼环绕交织 + 核心心跳脉动；完成后平滑回落
  useEffect(() => {
    const sine = Easing.inOut(Easing.sin);
    activeSV.value = withTiming(isGenerating ? 1 : 0, {
      duration: isGenerating ? 550 : 850,
      easing: Easing.out(Easing.cubic),
    });

    if (isGenerating) {
      genPulseSV.value = 0;
      genOrbitSV.value = 0;
      genOrbitAltSV.value = 0;
      genPulseSV.value = withRepeat(withTiming(1, { duration: 1700, easing: sine }), -1, true);
      genOrbitSV.value = withRepeat(withTiming(1, { duration: 3200, easing: sine }), -1, true);
      genOrbitAltSV.value = withRepeat(withTiming(1, { duration: 3800, easing: sine }), -1, true);
    } else {
      cancelAnimation(genPulseSV);
      cancelAnimation(genOrbitSV);
      cancelAnimation(genOrbitAltSV);
      genPulseSV.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    }

    return () => {
      cancelAnimation(activeSV);
      cancelAnimation(genPulseSV);
      cancelAnimation(genOrbitSV);
      cancelAnimation(genOrbitAltSV);
    };
  }, [isGenerating, activeSV, genPulseSV, genOrbitSV, genOrbitAltSV]);

  const outerStyle = useAnimatedStyle(() => {
    const idleOpacity = interpolate(outerBreatheSV.value, [0, 1], [0.7, 0.9]);
    const opacity = Math.min(
      1,
      idleOpacity + emptySV.value * 0.08 + activeSV.value * 0.18,
    );
    const scale =
      interpolate(outerBreatheSV.value, [0, 1], [1, 1.04]) +
      emptySV.value * 0.06 +
      activeSV.value * 0.05 * genPulseSV.value;
    const translateY = activeSV.value * -12;

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const wingLeftStyle = useAnimatedStyle(() => {
    const opacity = Math.min(
      1,
      interpolate(wingLeftBreatheSV.value, [0, 1], [0.66, 0.9]) +
        activeSV.value * 0.26,
    );
    const idleX = interpolate(wingLeftBreatheSV.value, [0, 1], [-16, 16]);
    const idleY = interpolate(wingLeftBreatheSV.value, [0, 1], [-6, 6]);
    const orbitX = interpolate(genOrbitSV.value, [0, 1], [-24, 96]);
    const orbitY = interpolate(genOrbitSV.value, [0, 0.5, 1], [-22, -6, -22]);
    const rot = activeSV.value * interpolate(genOrbitSV.value, [0, 1], [-4, 4]);
    const scale =
      interpolate(wingLeftBreatheSV.value, [0, 1], [0.98, 1.04]) +
      activeSV.value * (0.08 + 0.06 * genPulseSV.value);

    return {
      opacity,
      transform: [
        { translateX: idleX + activeSV.value * orbitX },
        { translateY: idleY + activeSV.value * orbitY },
        { rotate: `${rot}deg` },
        { scale },
      ],
    };
  });

  const wingRightStyle = useAnimatedStyle(() => {
    const opacity = Math.min(
      1,
      interpolate(wingRightBreatheSV.value, [0, 1], [0.66, 0.9]) +
        activeSV.value * 0.26,
    );
    // 与左翼反向漂移，让常态呼吸更自然有流动感
    const idleX = interpolate(wingRightBreatheSV.value, [0, 1], [16, -16]);
    const idleY = interpolate(wingRightBreatheSV.value, [0, 1], [6, -6]);
    const orbitX = interpolate(genOrbitAltSV.value, [0, 1], [24, -96]);
    const orbitY = interpolate(genOrbitAltSV.value, [0, 0.5, 1], [-20, -4, -20]);
    const rot = activeSV.value * interpolate(genOrbitAltSV.value, [0, 1], [4, -4]);
    const scale =
      interpolate(wingRightBreatheSV.value, [0, 1], [0.98, 1.04]) +
      activeSV.value * (0.08 + 0.06 * genPulseSV.value);

    return {
      opacity,
      transform: [
        { translateX: idleX + activeSV.value * orbitX },
        { translateY: idleY + activeSV.value * orbitY },
        { rotate: `${rot}deg` },
        { scale },
      ],
    };
  });

  const coreStyle = useAnimatedStyle(() => {
    const idleOpacity = interpolate(coreBreatheSV.value, [0, 1], [0.62, 0.86]);
    const opacity = Math.min(
      1,
      idleOpacity + activeSV.value * (0.1 + 0.22 * genPulseSV.value),
    );
    const translateY = activeSV.value * -8;
    const scale =
      interpolate(coreBreatheSV.value, [0, 1], [0.98, 1.04]) +
      activeSV.value * (0.04 + 0.08 * genPulseSV.value);

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const webPalette = isDark ? WEB_LAYER_STYLES.dark : WEB_LAYER_STYLES.light;
  const layerAnimatedStyles: Record<GlowLayerId, any> = {
    outer: outerStyle,
    wingLeft: wingLeftStyle,
    wingRight: wingRightStyle,
    core: coreStyle,
  };

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      accessibilityIgnoresInvertColors
    >
      {(['outer', 'wingLeft', 'wingRight', 'core'] as const).map((layerId) => (
        <Animated.View
          key={layerId}
          style={[styles.glowLayer, webPalette[layerId], layerAnimatedStyles[layerId]]}
        >
          {Platform.OS !== 'web' && (
            <NativeRadialLayer layerId={layerId} isDark={isDark} />
          )}
        </Animated.View>
      ))}
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
  // 四周外扩 15%：确保重度 blur、漂移与旋转环绕时边缘始终落于视口之外，宽屏绝不露黑边
  glowLayer: {
    position: 'absolute',
    top: '-15%',
    bottom: '-15%',
    left: '-15%',
    right: '-15%',
  },
});
