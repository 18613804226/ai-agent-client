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
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * 聊天页科技感多层光学背景（Web / 原生 App 一致展示，全 UI 线程驱动）：
 * 1. Layer 1：广域椭圆光学极光（3 团底部异形极光 + 1 团顶部微弱天光）
 * 2. Layer 2：局部精密微点阵（仅在底部光晕区域随距离自然衰减，不用 Mask 防兼容性问题）
 * 3. Layer 3：底部光学地平线折射弧（细锐光刃 + 柔和外溢弧光）
 * 4. Layer 4：生成态能量扫光（isGenerating 时沿底部地平线平滑掠过）
 */

type GlowSpec = {
  id: string;
  colorDark: string;
  colorLight: string;
  sizeRatio: number;
  xRatio: number;
  yRatio: number;
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
    sizeRatio: 0.78,
    xRatio: 0.2,
    yRatio: 0.88,
    tiltDeg: -8,
    driftX: 54,
    driftY: 32,
    durationMs: 7600,
    breathMs: 4800,
    breathScale: 1.14,
    opacityDark: 0.18,
    opacityLight: 0.14,
    startDelayMs: 0,
  },
  {
    id: 'glow-blue',
    colorDark: '#2F7DE1',
    colorLight: '#60a5fa',
    sizeRatio: 0.9,
    xRatio: 0.5,
    yRatio: 0.94,
    tiltDeg: 0,
    driftX: 46,
    driftY: 34,
    durationMs: 10800,
    breathMs: 6200,
    breathScale: 1.16,
    opacityDark: 0.22,
    opacityLight: 0.15,
    startDelayMs: 900,
  },
  {
    id: 'glow-violet',
    colorDark: '#8b5cf6',
    colorLight: '#a78bfa',
    sizeRatio: 0.82,
    xRatio: 0.8,
    yRatio: 0.86,
    tiltDeg: 7,
    driftX: 62,
    driftY: 30,
    durationMs: 9200,
    breathMs: 5400,
    breathScale: 1.13,
    opacityDark: 0.17,
    opacityLight: 0.13,
    startDelayMs: 1700,
  },
  {
    id: 'glow-sky-top',
    colorDark: '#38bdf8',
    colorLight: '#7dd3fc',
    sizeRatio: 0.62,
    xRatio: 0.82,
    yRatio: -0.04,
    tiltDeg: -12,
    driftX: 38,
    driftY: 22,
    durationMs: 13000,
    breathMs: 7000,
    breathScale: 1.1,
    opacityDark: 0.075,
    opacityLight: 0.055,
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
    opacity: interpolate(drift.value, [0, 0.5, 1], [1, 0.78, 1]),
  }));

  const base = Math.max(height, width * 0.72);
  const size = Math.round(base * spec.sizeRatio);
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
              <Stop offset="0%" stopColor={color} stopOpacity={0.74} />
              <Stop offset="32%" stopColor={color} stopOpacity={0.4} />
              <Stop offset="62%" stopColor={color} stopOpacity={0.13} />
              <Stop offset="86%" stopColor={color} stopOpacity={0.03} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="36%" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Layer 2：局部精密微点阵 —— 按椭圆距离二次衰减，仅在底部光晕区浮现 */
const TechDotMatrix = memo(function TechDotMatrix({
  width,
  height,
  isDark,
}: {
  width: number;
  height: number;
  isDark: boolean;
}) {
  const bandHeight = Math.min(240, Math.round(height * 0.36));
  const dots = useMemo(() => {
    if (width <= 0 || bandHeight <= 0) return [];
    const step = 28;
    const cx = width * 0.5;
    const rx = Math.max(180, width * 0.46);
    const peak = isDark ? 0.17 : 0.11;
    const startX = ((width % step) / 2) + step * 0.5;
    const list: { key: string; x: number; y: number; alpha: number }[] = [];

    for (let y = 18; y <= bandHeight - 10; y += step) {
      // 垂直归一：越靠近底边越亮，向顶部阅读区平滑归零
      const ny = 1 - y / bandHeight;
      for (let x = startX; x < width - 8; x += step) {
        const nx = (x - cx) / rx;
        const distSq = nx * nx + ny * ny;
        if (distSq >= 1) continue;
        const falloff = (1 - distSq) * (1 - distSq);
        const alpha = Number((peak * falloff).toFixed(3));
        if (alpha < 0.015) continue;
        list.push({ key: `${Math.round(x)}-${y}`, x, y, alpha });
      }
    }
    return list;
  }, [width, bandHeight, isDark]);

  if (dots.length === 0) return null;
  const dotColor = isDark ? '#bae6fd' : '#3b82f6';

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: bandHeight,
      }}
    >
      <Svg width={width} height={bandHeight}>
        {dots.map((d) => (
          <Circle
            key={d.key}
            cx={d.x}
            cy={d.y}
            r={0.95}
            fill={dotColor}
            fillOpacity={d.alpha}
          />
        ))}
      </Svg>
    </View>
  );
});

/** Layer 3：底部光学地平线折射弧 */
function HorizonEnergyArc({
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
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const arcStyle = useAnimatedStyle(() => {
    const base = isDark ? 0.58 : 0.44;
    const breathAmp = isDark ? 0.16 : 0.12;
    return {
      opacity: base + breathAmp * pulse.value + activeSV.value * 0.24,
    };
  });

  const arcH = 160;
  const edgeY = 128;
  const ctrlY = 58;
  const pathD = `M 0 ${edgeY} Q ${width * 0.5} ${ctrlY} ${width} ${edgeY}`;
  const gradSuffix = isDark ? 'd' : 'l';

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: arcH,
        },
        arcStyle,
      ]}
    >
      <Svg width={width} height={arcH}>
        <Defs>
          <LinearGradient id={`arc-core-${gradSuffix}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={isDark ? '#06b6d4' : '#38bdf8'} stopOpacity={0} />
            <Stop offset="22%" stopColor={isDark ? '#06b6d4' : '#38bdf8'} stopOpacity={0.35} />
            <Stop offset="50%" stopColor={isDark ? '#7dd3fc' : '#2563eb'} stopOpacity={0.9} />
            <Stop offset="78%" stopColor={isDark ? '#a855f7' : '#7c3aed'} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={isDark ? '#a855f7' : '#7c3aed'} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`arc-halo-${gradSuffix}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#2F7DE1" stopOpacity={0} />
            <Stop offset="25%" stopColor="#2F7DE1" stopOpacity={0.14} />
            <Stop offset="50%" stopColor="#38bdf8" stopOpacity={0.28} />
            <Stop offset="75%" stopColor="#8b5cf6" stopOpacity={0.14} />
            <Stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path
          d={pathD}
          fill="none"
          stroke={`url(#arc-halo-${gradSuffix})`}
          strokeWidth={8}
        />
        <Path
          d={pathD}
          fill="none"
          stroke={`url(#arc-core-${gradSuffix})`}
          strokeWidth={1.25}
        />
      </Svg>
    </Animated.View>
  );
}

/** Layer 4：生成态能量扫光（仅 isGenerating 时沿地平线平滑掠过） */
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
  const beamW = Math.min(340, Math.round(width * 0.42));
  const beamH = 80;

  useEffect(() => {
    if (isGenerating) {
      sweep.value = 0;
      sweep.value = withRepeat(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
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
    const endX = width;
    const edgeFade = Math.min(1, sweep.value * 4, (1 - sweep.value) * 4);
    const peak = isDark ? 0.55 : 0.38;
    return {
      opacity: activeSV.value * edgeFade * peak,
      transform: [{ translateX: interpolate(sweep.value, [0, 1], [startX, endX]) }],
    };
  });

  const gradId = `plasma-sweep-${isDark ? 'd' : 'l'}`;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          bottom: 42,
          width: beamW,
          height: beamH,
        },
        sweepStyle,
      ]}
    >
      <Svg width={beamW} height={beamH}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={isDark ? '#7dd3fc' : '#38bdf8'} stopOpacity={0.85} />
            <Stop offset="40%" stopColor={isDark ? '#2F7DE1' : '#2563eb'} stopOpacity={0.36} />
            <Stop offset="100%" stopColor="#2F7DE1" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="50%" rx="50%" ry="46%" fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
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
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(activeSV);
  }, [isGenerating, activeSV]);

  const auroraBoostStyle = useAnimatedStyle(() => ({
    opacity: 1 + activeSV.value * 0.28,
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
          <TechDotMatrix width={layout.width} height={layout.height} isDark={isDark} />
          <HorizonEnergyArc width={layout.width} isDark={isDark} activeSV={activeSV} />
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
