import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * 聊天页输入框附近的「流动光晕」（Web / 原生 App 一致展示）。
 *
 * - 容器铺满聊天区（不裁固定高度），4 团光晕锚定在底部输入框附近，
 *   依靠径向渐变自然淡出 —— 没有固定高度裁剪产生的生硬边缘。
 * - 青 / 紫 / 蓝 / 品红各自以不同周期缓慢漂移 + 呼吸缩放，
 *   动画跑在 Reanimated UI 线程。
 * - 渐变本体是静态 SVG（react-native-svg RadialGradient），只有外层 View 做
 *   transform / opacity 动画 —— 合成器层面执行。
 * - 整层 style.pointerEvents='none'，不拦截输入框 / 发送按钮的任何点击。
 */

type GlowSpec = {
  id: string;
  colorDark: string;
  colorLight: string;
  /** 直径 / 容器高度 */
  sizeRatio: number;
  /** 光晕中心相对容器宽度的位置（0-1） */
  xRatio: number;
  /** 光晕中心相对容器高度的位置（约 0.9~1.05，锚定底部输入框附近，可略超出底边） */
  yRatio: number;
  /** 漂移幅度 px */
  driftX: number;
  driftY: number;
  /** 漂移半周期 ms（配合 repeat reverse 往返） */
  durationMs: number;
  /** 呼吸缩放半周期 ms */
  breathMs: number;
  breathScale: number;
  opacityDark: number;
  opacityLight: number;
  startDelayMs: number;
};

const GLOW_SPECS: GlowSpec[] = [
  {
    id: 'glow-cyan',
    colorDark: '#22d3ee',
    colorLight: '#67e8f9',
    sizeRatio: 0.48,
    xRatio: 0.2,
    yRatio: 0.93,
    driftX: 60,
    driftY: 36,
    durationMs: 7000,
    breathMs: 4500,
    breathScale: 1.15,
    opacityDark: 0.45,
    opacityLight: 0.28,
    startDelayMs: 0,
  },
  {
    id: 'glow-violet',
    colorDark: '#8b5cf6',
    colorLight: '#a78bfa',
    sizeRatio: 0.58,
    xRatio: 0.8,
    yRatio: 0.96,
    driftX: 80,
    driftY: 36,
    durationMs: 9000,
    breathMs: 5500,
    breathScale: 1.12,
    opacityDark: 0.4,
    opacityLight: 0.24,
    startDelayMs: 800,
  },
  {
    id: 'glow-blue',
    colorDark: '#3b82f6',
    colorLight: '#93c5fd',
    sizeRatio: 0.52,
    xRatio: 0.5,
    yRatio: 1.0,
    driftX: 50,
    driftY: 40,
    durationMs: 11000,
    breathMs: 6500,
    breathScale: 1.18,
    opacityDark: 0.38,
    opacityLight: 0.22,
    startDelayMs: 1600,
  },
  {
    id: 'glow-magenta',
    colorDark: '#d946ef',
    colorLight: '#f0abfc',
    sizeRatio: 0.38,
    xRatio: 0.9,
    yRatio: 1.04,
    driftX: 40,
    driftY: 32,
    durationMs: 13000,
    breathMs: 5000,
    breathScale: 1.2,
    opacityDark: 0.3,
    opacityLight: 0.18,
    startDelayMs: 2400,
  },
];

function GlowBlob({
  spec,
  width,
  height,
  isDark,
}: {
  spec: GlowSpec;
  width: number;
  height: number;
  isDark: boolean;
}) {
  const drift = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    drift.value = withDelay(
      spec.startDelayMs,
      withRepeat(withTiming(1, { duration: spec.durationMs, easing: ease }), -1, true),
    );
    breath.value = withDelay(
      spec.startDelayMs + spec.breathMs / 2,
      withRepeat(withTiming(1, { duration: spec.breathMs, easing: ease }), -1, true),
    );
  }, [drift, breath, spec]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-spec.driftX, spec.driftX]) },
      { translateY: interpolate(breath.value, [0, 1], [-spec.driftY, spec.driftY]) },
      { scale: interpolate(breath.value, [0, 1], [1, spec.breathScale]) },
    ],
    opacity: interpolate(drift.value, [0, 0.5, 1], [1, 0.78, 1]),
  }));

  const size = Math.round(height * spec.sizeRatio);
  const left = spec.xRatio * width - size / 2;
  const top = spec.yRatio * height - size / 2;
  const color = isDark ? spec.colorDark : spec.colorLight;
  const gradientId = `${spec.id}-${isDark ? 'd' : 'l'}`;

  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        opacity: isDark ? spec.opacityDark : spec.opacityLight,
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.95} />
              <Stop offset="38%" stopColor={color} stopOpacity={0.55} />
              <Stop offset="68%" stopColor={color} stopOpacity={0.16} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

type ChatGlowBackgroundProps = {
  isDark: boolean;
};

export default function ChatGlowBackground({ isDark }: ChatGlowBackgroundProps) {
  // 铺满聊天区（不裁固定高度），光晕锚定在底部输入框附近、自然淡出
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
      accessibilityIgnoresInvertColors
    >
      {layout.width > 0 &&
        layout.height > 0 &&
        GLOW_SPECS.map((spec) => (
          <GlowBlob
            key={spec.id}
            spec={spec}
            width={layout.width}
            height={layout.height}
            isDark={isDark}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
});


