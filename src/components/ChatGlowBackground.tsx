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
 * 聊天页 Gemini 风格「输入框围绕式」4 层光学氛围背景（全 UI 线程驱动 + 零星点 + 全视口无黑边）：
 * 1. Layer 1（outer）：底部居中的宽幅外层柔光基底，10s 慢速呼吸；
 * 2. Layer 2（wingLeft）：左翼宝蓝/青色柔光团，独立相位呼吸；思考/生成时横向游走摆动；
 * 3. Layer 3（wingRight）：右翼靛紫/紫罗兰柔光团，反向异相呼吸；生成时与左翼非谐波错位交织环绕；
 * 4. Layer 4（core）：贴近输入框上沿与两侧的紧致核心光环，生成时柔和心跳脉动与上浮唤醒。
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
              'radial-gradient(ellipse 68% 42% at 50% 82%, rgba(37, 68, 178, 0.28) 0%, rgba(49, 46, 129, 0.16) 36%, rgba(30, 27, 75, 0.06) 64%, transparent 86%)',
            filter: 'blur(90px)',
          }
        : null,
    wingLeft:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 42% 28% at 41% 81%, rgba(37, 99, 235, 0.24) 0%, rgba(14, 165, 233, 0.11) 42%, transparent 76%)',
            filter: 'blur(72px)',
          }
        : null,
    wingRight:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 42% 28% at 59% 81%, rgba(99, 102, 241, 0.24) 0%, rgba(124, 58, 237, 0.11) 42%, transparent 76%)',
            filter: 'blur(72px)',
          }
        : null,
    core:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 30% 16% at 50% 80%, rgba(96, 165, 250, 0.24) 0%, rgba(79, 70, 229, 0.12) 45%, transparent 78%)',
            filter: 'blur(46px)',
          }
        : null,
  },
  light: {
    outer:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 68% 42% at 50% 82%, rgba(59, 130, 246, 0.14) 0%, rgba(99, 102, 241, 0.07) 40%, transparent 82%)',
            filter: 'blur(90px)',
          }
        : null,
    wingLeft:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 42% 28% at 41% 81%, rgba(37, 99, 235, 0.12) 0%, rgba(56, 189, 248, 0.06) 44%, transparent 76%)',
            filter: 'blur(72px)',
          }
        : null,
    wingRight:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 42% 28% at 59% 81%, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.06) 44%, transparent 76%)',
            filter: 'blur(72px)',
          }
        : null,
    core:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse 30% 16% at 50% 80%, rgba(59, 130, 246, 0.14) 0%, rgba(99, 102, 241, 0.06) 46%, transparent 78%)',
            filter: 'blur(46px)',
          }
        : null,
  },
};

const NATIVE_LAYERS: Record<GlowLayerId, NativeLayerConfig> = {
  outer: {
    cx: '50%',
    cy: '82%',
    rx: '54%',
    ry: '34%',
    colorDark: '#2544B2',
    colorLight: '#3B82F6',
    stopsDark: [
      { offset: '0%', opacity: 0.26 },
      { offset: '20%', opacity: 0.19 },
      { offset: '42%', opacity: 0.11 },
      { offset: '64%', opacity: 0.05 },
      { offset: '84%', opacity: 0.015 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.13 },
      { offset: '20%', opacity: 0.095 },
      { offset: '42%', opacity: 0.055 },
      { offset: '64%', opacity: 0.025 },
      { offset: '84%', opacity: 0.008 },
      { offset: '100%', opacity: 0 },
    ],
  },
  wingLeft: {
    cx: '41%',
    cy: '81%',
    rx: '36%',
    ry: '24%',
    colorDark: '#2563EB',
    colorLight: '#2563EB',
    stopsDark: [
      { offset: '0%', opacity: 0.22 },
      { offset: '26%', opacity: 0.14 },
      { offset: '54%', opacity: 0.06 },
      { offset: '80%', opacity: 0.015 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.11 },
      { offset: '26%', opacity: 0.07 },
      { offset: '54%', opacity: 0.03 },
      { offset: '80%', opacity: 0.008 },
      { offset: '100%', opacity: 0 },
    ],
  },
  wingRight: {
    cx: '59%',
    cy: '81%',
    rx: '36%',
    ry: '24%',
    colorDark: '#6366F1',
    colorLight: '#6366F1',
    stopsDark: [
      { offset: '0%', opacity: 0.22 },
      { offset: '26%', opacity: 0.14 },
      { offset: '54%', opacity: 0.06 },
      { offset: '80%', opacity: 0.015 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.11 },
      { offset: '26%', opacity: 0.07 },
      { offset: '54%', opacity: 0.03 },
      { offset: '80%', opacity: 0.008 },
      { offset: '100%', opacity: 0 },
    ],
  },
  core: {
    cx: '50%',
    cy: '80%',
    rx: '26%',
    ry: '15%',
    colorDark: '#60A5FA',
    colorLight: '#3B82F6',
    stopsDark: [
      { offset: '0%', opacity: 0.22 },
      { offset: '26%', opacity: 0.14 },
      { offset: '54%', opacity: 0.06 },
      { offset: '80%', opacity: 0.015 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.13 },
      { offset: '26%', opacity: 0.08 },
      { offset: '54%', opacity: 0.035 },
      { offset: '80%', opacity: 0.008 },
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
    const idleOpacity = interpolate(outerBreatheSV.value, [0, 1], [0.78, 1]);
    const opacity = Math.min(
      1,
      idleOpacity + emptySV.value * 0.08 + activeSV.value * 0.16,
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
      interpolate(wingLeftBreatheSV.value, [0, 1], [0.72, 1]) + activeSV.value * 0.2,
    );
    const idleX = interpolate(wingLeftBreatheSV.value, [0, 1], [-14, 14]);
    const idleY = interpolate(wingLeftBreatheSV.value, [0, 1], [-6, 6]);
    const orbitX = interpolate(genOrbitSV.value, [0, 1], [-42, 72]);
    const orbitY = interpolate(genOrbitSV.value, [0, 0.5, 1], [-22, -6, -22]);
    const rot = activeSV.value * interpolate(genOrbitSV.value, [0, 1], [-5, 5]);
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
      interpolate(wingRightBreatheSV.value, [0, 1], [0.72, 1]) + activeSV.value * 0.2,
    );
    // 与左翼反向漂移，让常态呼吸更自然有流动感
    const idleX = interpolate(wingRightBreatheSV.value, [0, 1], [14, -14]);
    const idleY = interpolate(wingRightBreatheSV.value, [0, 1], [6, -6]);
    const orbitX = interpolate(genOrbitAltSV.value, [0, 1], [42, -72]);
    const orbitY = interpolate(genOrbitAltSV.value, [0, 0.5, 1], [-20, -4, -20]);
    const rot = activeSV.value * interpolate(genOrbitAltSV.value, [0, 1], [5, -5]);
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
    const idleOpacity = interpolate(coreBreatheSV.value, [0, 1], [0.68, 0.94]);
    const opacity = Math.min(
      1,
      idleOpacity + activeSV.value * (0.06 + 0.26 * genPulseSV.value),
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
