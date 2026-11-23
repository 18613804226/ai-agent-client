import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * 聊天页「方向 A」光学氛围背景（无穿模细线 / 无贴边硬裁，全 UI 线程驱动）：
 * 1. Layer 1：聚拢上抬的对称椭圆极光（左青 / 中蓝 / 右紫 + 顶部微弱天光），避开底部黑色纱幕；
 * 2. Layer 2：输入框背后居中收束的「底座水平漫反射光带」（15%~85% 内自然衰减至 0）；
 * 3. Layer 3：输入框上方光晕过渡区精密微点阵（近看有科技星阵纹理，远看隐于背景不扰阅读）；
 * 4. Layer 4：生成态能量扫光（isGenerating 时柔和唤醒极光与底座扫光，平时沉稳克制）。
 */

type GlowSpec = {
  id: string;
  colorDark: string;
  colorLight: string;
  /** 宽屏下按 focalSpan 收束居中，避免光团贴到左侧边栏被硬切 */
  widthRatio: number;
  aspectRatio: number;
  xOffsetRatio: number;
  /** bottom 正值：由底往上抬起以避开 53px 黑色渐隐纱幕；topRatio 用于顶部微光 */
  bottomOffset?: number;
  topRatio?: number;
  tiltDeg: number;
  driftX: number;
  driftY: number;
  durationMs: number;
  breathMs: number;
  breathScale: number;
  opacityDark: number;
  opacityLight: number;
  startDelayMs: number;
};

const GLOW_SPECS: GlowSpec[] = [
  {
    id: 'glow-cyan',
    colorDark: '#06b6d4',
    colorLight: '#38bdf8',
    widthRatio: 0.56,
    aspectRatio: 0.72,
    xOffsetRatio: -0.24,
    bottomOffset: 112,
    tiltDeg: -7,
    driftX: 28,
    driftY: 18,
    durationMs: 7800,
    breathMs: 4900,
    breathScale: 1.12,
    opacityDark: 0.22,
    opacityLight: 0.15,
    startDelayMs: 0,
  },
  {
    id: 'glow-blue',
    colorDark: '#2F7DE1',
    colorLight: '#60a5fa',
    widthRatio: 0.68,
    aspectRatio: 0.66,
    xOffsetRatio: 0,
    bottomOffset: 92,
    tiltDeg: 0,
    driftX: 24,
    driftY: 18,
    durationMs: 10800,
    breathMs: 6200,
    breathScale: 1.14,
    opacityDark: 0.26,
    opacityLight: 0.17,
    startDelayMs: 850,
  },
  {
    id: 'glow-violet',
    colorDark: '#8b5cf6',
    colorLight: '#a78bfa',
    widthRatio: 0.56,
    aspectRatio: 0.72,
    xOffsetRatio: 0.24,
    bottomOffset: 116,
    tiltDeg: 7,
    driftX: 30,
    driftY: 18,
    durationMs: 9200,
    breathMs: 5400,
    breathScale: 1.12,
    opacityDark: 0.22,
    opacityLight: 0.15,
    startDelayMs: 1650,
  },
  {
    id: 'glow-sky-top',
    colorDark: '#38bdf8',
    colorLight: '#7dd3fc',
    widthRatio: 0.52,
    aspectRatio: 0.78,
    xOffsetRatio: 0.28,
    topRatio: -0.12,
    tiltDeg: -10,
    driftX: 26,
    driftY: 16,
    durationMs: 13000,
    breathMs: 7000,
    breathScale: 1.09,
    opacityDark: 0.09,
    opacityLight: 0.06,
    startDelayMs: 400,
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
    return () => {
      cancelAnimation(drift);
      cancelAnimation(breath);
    };
  }, [drift, breath, spec]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-spec.driftX, spec.driftX]) },
      { translateY: interpolate(breath.value, [0, 1], [-spec.driftY, spec.driftY]) },
      { scale: interpolate(breath.value, [0, 1], [1, spec.breathScale]) },
      { rotate: `${spec.tiltDeg}deg` },
    ],
    opacity: interpolate(drift.value, [0, 0.5, 1], [1, 0.8, 1]),
  }));

  const focalSpan = Math.min(width, 960);
  const blobW = Math.round(focalSpan * spec.widthRatio);
  const blobH = Math.round(blobW * spec.aspectRatio);
  const centerX =
    spec.topRatio !== undefined && spec.id === 'glow-sky-top'
      ? width * 0.78
      : width * 0.5 + focalSpan * spec.xOffsetRatio;
  const left = Math.round(centerX - blobW / 2);
  const top =
    spec.bottomOffset !== undefined
      ? Math.round(height - spec.bottomOffset - blobH / 2)
      : Math.round((spec.topRatio ?? 0) * height);

  const color = isDark ? spec.colorDark : spec.colorLight;
  const gradientId = `${spec.id}-${isDark ? 'd' : 'l'}`;

  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: blobW,
        height: blobH,
        opacity: isDark ? spec.opacityDark : spec.opacityLight,
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <Svg width={blobW} height={blobH}>
          <Defs>
            <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.8} />
              <Stop offset="28%" stopColor={color} stopOpacity={0.44} />
              <Stop offset="58%" stopColor={color} stopOpacity={0.15} />
              <Stop offset="84%" stopColor={color} stopOpacity={0.03} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="38%" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Layer 2：输入框正背后的「底座水平漫反射光带」（15% ~ 85% 内自然衰减至 0，无任何穿模细线） */
function DockDiffusionBand({
  width,
  isDark,
  activeSV,
}: {
  width: number;
  isDark: boolean;
  activeSV: SharedValue<number>;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 4400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const bandStyle = useAnimatedStyle(() => {
    const base = isDark ? 0.62 : 0.48;
    const breathAmp = isDark ? 0.14 : 0.1;
    return {
      opacity: base + breathAmp * pulse.value + activeSV.value * 0.26,
    };
  });

  const dockW = Math.min(Math.round(width * 0.74), 860);
  const dockH = 112;
  const dockLeft = Math.round((width - dockW) / 2);
  const gradSuffix = isDark ? 'd' : 'l';

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: dockLeft,
          bottom: 34,
          width: dockW,
          height: dockH,
        },
        bandStyle,
      ]}
    >
      <Svg width={dockW} height={dockH}>
        <Defs>
          <LinearGradient id={`dock-wide-${gradSuffix}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={isDark ? '#06b6d4' : '#38bdf8'} stopOpacity={0} />
            <Stop offset="16%" stopColor={isDark ? '#06b6d4' : '#38bdf8'} stopOpacity={0.22} />
            <Stop offset="50%" stopColor={isDark ? '#2F7DE1' : '#3b82f6'} stopOpacity={0.34} />
            <Stop offset="84%" stopColor={isDark ? '#8b5cf6' : '#8b5cf6'} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={isDark ? '#8b5cf6' : '#8b5cf6'} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id={`dock-core-${gradSuffix}`} cx="50%" cy="56%" r="50%">
            <Stop offset="0%" stopColor={isDark ? '#7dd3fc' : '#60a5fa'} stopOpacity={0.42} />
            <Stop offset="42%" stopColor={isDark ? '#2F7DE1' : '#3b82f6'} stopOpacity={0.18} />
            <Stop offset="78%" stopColor={isDark ? '#2F7DE1' : '#3b82f6'} stopOpacity={0.03} />
            <Stop offset="100%" stopColor={isDark ? '#2F7DE1' : '#3b82f6'} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* 外层宽幅漫反射：仅作用于中间 74% 区域，确保在边缘之前平滑衰减为 0 */}
        <Ellipse cx="50%" cy="56%" rx="48%" ry="44%" fill={`url(#dock-wide-${gradSuffix})`} />
        {/* 内层紧致悬浮底座柔光 */}
        <Ellipse cx="50%" cy="58%" rx="34%" ry="24%" fill={`url(#dock-core-${gradSuffix})`} />
      </Svg>
    </Animated.View>
  );
}

/** Layer 3：上移至输入框上方光晕过渡区的精密微点阵 */
const TechDotMatrix = memo(function TechDotMatrix({
  width,
  height,
  isDark,
  activeSV,
}: {
  width: number;
  height: number;
  isDark: boolean;
  activeSV: SharedValue<number>;
}) {
  const bandW = Math.min(Math.round(width * 0.8), 900);
  const bandH = Math.min(230, Math.round(height * 0.34));
  const bandLeft = Math.round((width - bandW) / 2);

  const dots = useMemo(() => {
    if (bandW <= 0 || bandH <= 0) return [];
    const step = 24;
    const cx = bandW * 0.5;
    const cy = bandH * 0.76;
    const rx = Math.max(150, bandW * 0.44);
    const ry = Math.max(95, bandH * 0.78);
    const peak = isDark ? 0.24 : 0.14;
    const startX = (bandW % step) / 2 + step * 0.5;
    const list: { key: string; x: number; y: number; alpha: number }[] = [];

    for (let y = 14; y <= bandH - 8; y += step) {
      const ny = (y - cy) / ry;
      for (let x = startX; x < bandW - 8; x += step) {
        const nx = (x - cx) / rx;
        const distSq = nx * nx + ny * ny;
        if (distSq >= 1) continue;
        const falloff = Math.pow(1 - distSq, 1.45);
        const alpha = Number((peak * falloff).toFixed(3));
        if (alpha < 0.018) continue;
        list.push({ key: `${Math.round(x)}-${y}`, x, y, alpha });
      }
    }
    return list;
  }, [bandW, bandH, isDark]);

  const matrixStyle = useAnimatedStyle(() => ({
    opacity: 0.92 + activeSV.value * 0.25,
  }));

  if (dots.length === 0) return null;
  const dotColor = isDark ? '#bae6fd' : '#3b82f6';

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: bandLeft,
          bottom: 58,
          width: bandW,
          height: bandH,
        },
        matrixStyle,
      ]}
    >
      <Svg width={bandW} height={bandH}>
        {dots.map((d) => (
          <Circle
            key={d.key}
            cx={d.x}
            cy={d.y}
            r={1.05}
            fill={dotColor}
            fillOpacity={d.alpha}
          />
        ))}
      </Svg>
    </Animated.View>
  );
});

/** Layer 4：生成态能量扫光（限制在居中输入框底座区间内，绝不扫进侧边栏） */
function ActivePlasmaSweep({
  width,
  isDark,
  isGenerating,
  activeSV,
}: {
  width: number;
  isDark: boolean;
  isGenerating: boolean;
  activeSV: SharedValue<number>;
}) {
  const sweep = useSharedValue(0);
  const dockW = Math.min(Math.round(width * 0.74), 820);
  const dockLeft = Math.round((width - dockW) / 2);
  const beamW = Math.min(280, Math.round(dockW * 0.42));
  const beamH = 76;

  useEffect(() => {
    if (isGenerating) {
      sweep.value = 0;
      sweep.value = withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(sweep);
    }
    return () => cancelAnimation(sweep);
  }, [isGenerating, sweep]);

  const sweepStyle = useAnimatedStyle(() => {
    const startX = -beamW;
    const endX = dockW;
    const edgeFade = Math.min(1, sweep.value * 3.5, (1 - sweep.value) * 3.5);
    const peak = isDark ? 0.62 : 0.42;
    return {
      opacity: activeSV.value * edgeFade * peak,
      transform: [{ translateX: interpolate(sweep.value, [0, 1], [startX, endX]) }],
    };
  });

  const gradId = `plasma-sweep-${isDark ? 'd' : 'l'}`;

  return (
    <View
      style={{
        position: 'absolute',
        left: dockLeft,
        bottom: 44,
        width: dockW,
        height: beamH,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width: beamW,
            height: beamH,
          },
          sweepStyle,
        ]}
      >
        <Svg width={beamW} height={beamH}>
          <Defs>
            <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={isDark ? '#7dd3fc' : '#38bdf8'} stopOpacity={0.9} />
              <Stop offset="38%" stopColor={isDark ? '#2F7DE1' : '#2563eb'} stopOpacity={0.38} />
              <Stop offset="100%" stopColor="#2F7DE1" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="44%" fill={`url(#${gradId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

type ChatGlowBackgroundProps = {
  isDark: boolean;
  /** 模型正在思考/吐字时轻微提亮极光并唤醒底部水平能量扫光 */
  isGenerating?: boolean;
};

const ChatGlowBackground = memo(function ChatGlowBackground({
  isDark,
  isGenerating = false,
}: ChatGlowBackgroundProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const activeSV = useSharedValue(isGenerating ? 1 : 0);

  useEffect(() => {
    activeSV.value = withTiming(isGenerating ? 1 : 0, {
      duration: isGenerating ? 650 : 800,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(activeSV);
  }, [isGenerating, activeSV]);

  const auroraBoostStyle = useAnimatedStyle(() => ({
    opacity: 1 + activeSV.value * 0.32,
  }));

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        const h = e.nativeEvent.layout.height;
        setLayout((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }}
      accessibilityIgnoresInvertColors
    >
      {layout.width > 0 && layout.height > 0 && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, auroraBoostStyle]}>
            {GLOW_SPECS.map((spec) => (
              <GlowBlob
                key={spec.id}
                spec={spec}
                width={layout.width}
                height={layout.height}
                isDark={isDark}
              />
            ))}
          </Animated.View>
          <DockDiffusionBand width={layout.width} isDark={isDark} activeSV={activeSV} />
          <TechDotMatrix
            width={layout.width}
            height={layout.height}
            isDark={isDark}
            activeSV={activeSV}
          />
          <ActivePlasmaSweep
            width={layout.width}
            isDark={isDark}
            isGenerating={isGenerating}
            activeSV={activeSV}
          />
        </>
      )}
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
});
