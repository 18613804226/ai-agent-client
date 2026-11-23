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

const IS_WEB = Platform.OS === 'web';
const ORBIT_OUTER_X = IS_WEB ? 16 : 24;
const ORBIT_INNER_X = IS_WEB ? 64 : 96;

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
              'radial-gradient(ellipse min(54%, 500px) min(30%, 280px) at 50% 83%, rgba(47, 125, 225, 0.15) 0%, rgba(79, 70, 229, 0.08) 42%, rgba(30, 27, 75, 0.025) 68%, transparent 84%)',
            filter: 'blur(78px)',
          }
        : null,
    wingLeft:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse min(34%, 310px) min(23%, 210px) at calc(50% - min(19%, 210px)) 81%, rgba(56, 189, 248, 0.16) 0%, rgba(6, 182, 212, 0.085) 38%, rgba(14, 116, 144, 0.025) 62%, transparent 76%)',
            filter: 'blur(62px)',
          }
        : null,
    wingRight:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse min(34%, 310px) min(23%, 210px) at calc(50% + min(19%, 210px)) 81%, rgba(124, 107, 240, 0.16) 0%, rgba(168, 85, 247, 0.085) 38%, rgba(139, 92, 246, 0.025) 62%, transparent 76%)',
            filter: 'blur(62px)',
          }
        : null,
    core:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse min(32%, 280px) min(15%, 140px) at 50% 82%, rgba(47, 125, 225, 0.13) 0%, rgba(124, 107, 240, 0.06) 46%, transparent 78%)',
            filter: 'blur(44px)',
          }
        : null,
  },
  light: {
    outer:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse min(54%, 500px) min(30%, 280px) at 50% 83%, rgba(96, 165, 250, 0.10) 0%, rgba(129, 140, 248, 0.05) 44%, transparent 84%)',
            filter: 'blur(78px)',
          }
        : null,
    wingLeft:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse min(34%, 310px) min(23%, 210px) at calc(50% - min(19%, 210px)) 81%, rgba(56, 189, 248, 0.11) 0%, rgba(125, 211, 252, 0.055) 42%, transparent 76%)',
            filter: 'blur(62px)',
          }
        : null,
    wingRight:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse min(34%, 310px) min(23%, 210px) at calc(50% + min(19%, 210px)) 81%, rgba(124, 107, 240, 0.11) 0%, rgba(168, 85, 247, 0.055) 42%, transparent 76%)',
            filter: 'blur(62px)',
          }
        : null,
    core:
      Platform.OS === 'web'
        ? {
            backgroundImage:
              'radial-gradient(ellipse min(32%, 280px) min(15%, 140px) at 50% 82%, rgba(59, 130, 246, 0.09) 0%, rgba(129, 140, 248, 0.04) 46%, transparent 78%)',
            filter: 'blur(44px)',
          }
        : null,
  },
};

const NATIVE_LAYERS: Record<GlowLayerId, NativeLayerConfig> = {
  outer: {
    cx: '50%',
    cy: '83%',
    rx: '50%',
    ry: '30%',
    colorDark: '#2F7DE1',
    colorLight: '#60A5FA',
    stopsDark: [
      { offset: '0%', opacity: 0.2 },
      { offset: '20%', opacity: 0.14 },
      { offset: '42%', opacity: 0.08 },
      { offset: '64%', opacity: 0.035 },
      { offset: '84%', opacity: 0.01 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.13 },
      { offset: '20%', opacity: 0.09 },
      { offset: '42%', opacity: 0.05 },
      { offset: '64%', opacity: 0.02 },
      { offset: '84%', opacity: 0.006 },
      { offset: '100%', opacity: 0 },
    ],
  },
  wingLeft: {
    cx: '28%',
    cy: '81%',
    rx: '34%',
    ry: '22%',
    colorDark: '#38BDF8',
    colorLight: '#7DD3FC',
    stopsDark: [
      { offset: '0%', opacity: 0.2 },
      { offset: '26%', opacity: 0.125 },
      { offset: '54%', opacity: 0.055 },
      { offset: '80%', opacity: 0.016 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.14 },
      { offset: '26%', opacity: 0.088 },
      { offset: '54%', opacity: 0.038 },
      { offset: '80%', opacity: 0.01 },
      { offset: '100%', opacity: 0 },
    ],
  },
  wingRight: {
    cx: '72%',
    cy: '81%',
    rx: '34%',
    ry: '22%',
    colorDark: '#7C6BF0',
    colorLight: '#A5B4FC',
    stopsDark: [
      { offset: '0%', opacity: 0.2 },
      { offset: '26%', opacity: 0.125 },
      { offset: '54%', opacity: 0.055 },
      { offset: '80%', opacity: 0.016 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.14 },
      { offset: '26%', opacity: 0.088 },
      { offset: '54%', opacity: 0.038 },
      { offset: '80%', opacity: 0.01 },
      { offset: '100%', opacity: 0 },
    ],
  },
  core: {
    cx: '50%',
    cy: '82%',
    rx: '32%',
    ry: '15%',
    colorDark: '#2F7DE1',
    colorLight: '#93C5FD',
    stopsDark: [
      { offset: '0%', opacity: 0.17 },
      { offset: '26%', opacity: 0.105 },
      { offset: '54%', opacity: 0.045 },
      { offset: '80%', opacity: 0.012 },
      { offset: '100%', opacity: 0 },
    ],
    stopsLight: [
      { offset: '0%', opacity: 0.12 },
      { offset: '26%', opacity: 0.075 },
      { offset: '54%', opacity: 0.032 },
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
    const idleOpacity = interpolate(outerBreatheSV.value, [0, 1], [0.78, 0.96]);
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
      interpolate(wingLeftBreatheSV.value, [0, 1], [0.76, 0.96]) +
        activeSV.value * 0.26,
    );
    const idleX = interpolate(wingLeftBreatheSV.value, [0, 1], [-16, 16]);
    const idleY = interpolate(wingLeftBreatheSV.value, [0, 1], [-6, 6]);
    const orbitX = interpolate(genOrbitSV.value, [0, 1], [-ORBIT_OUTER_X, ORBIT_INNER_X]);
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
      interpolate(wingRightBreatheSV.value, [0, 1], [0.76, 0.96]) +
        activeSV.value * 0.26,
    );
    // 与左翼反向漂移，让常态呼吸更自然有流动感
    const idleX = interpolate(wingRightBreatheSV.value, [0, 1], [16, -16]);
    const idleY = interpolate(wingRightBreatheSV.value, [0, 1], [6, -6]);
    const orbitX = interpolate(genOrbitAltSV.value, [0, 1], [ORBIT_OUTER_X, -ORBIT_INNER_X]);
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
    const idleOpacity = interpolate(coreBreatheSV.value, [0, 1], [0.74, 0.94]);
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
