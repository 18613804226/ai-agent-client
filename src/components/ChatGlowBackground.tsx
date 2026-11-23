import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * 聊天页光学氛围背景（5 层组合方案，全 UI 线程驱动 + 零 React 重渲染）：
 * 1. Layer 1：6 段高斯衰减多层极光 + Web 端 blur(38px) 消除硬椭圆边，带 8s 常驻呼吸；
 * 2. Layer 2：输入框背后居中收束的「底座双层柔光」（纯 RadialGradient 彻底无几何轮廓）；
 * 3. Layer 3：错落星空微点阵（4 组独立相位错落闪烁 + ±1.5px 深空慢速微漂移）；
 * 4. Layer 4：桌面 Web 鼠标粘滞跟随光斑（0.05 缓动追随，静止零 CPU，移动端跳过）；
 * 5. Layer 5：AI 生成态呼应脉动 + 底座能量扫光（isGenerating 时作为状态反馈柔和唤醒）。
 */

const CAN_HOVER_WEB =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover)').matches;

const WEB_GLOW_BLUR =
  Platform.OS === 'web' ? ({ filter: 'blur(38px)' } as any) : null;
const WEB_FOLLOW_BLUR =
  Platform.OS === 'web' ? ({ filter: 'blur(36px)' } as any) : null;

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
    xOffsetRatio: -0.22,
    bottomOffset: 118,
    tiltDeg: -8,
    driftX: 28,
    driftY: 18,
    durationMs: 8200,
    breathMs: 5200,
    breathScale: 1.11,
    opacityDark: 0.18,
    opacityLight: 0.13,
    startDelayMs: 0,
  },
  {
    id: 'glow-blue',
    colorDark: '#2F7DE1',
    colorLight: '#60a5fa',
    widthRatio: 0.68,
    aspectRatio: 0.68,
    xOffsetRatio: -0.02,
    bottomOffset: 94,
    tiltDeg: 2,
    driftX: 24,
    driftY: 18,
    durationMs: 11000,
    breathMs: 6400,
    breathScale: 1.12,
    opacityDark: 0.2,
    opacityLight: 0.14,
    startDelayMs: 900,
  },
  {
    id: 'glow-indigo',
    colorDark: '#6366f1',
    colorLight: '#818cf8',
    widthRatio: 0.58,
    aspectRatio: 0.72,
    xOffsetRatio: 0.19,
    bottomOffset: 114,
    tiltDeg: 7,
    driftX: 28,
    driftY: 16,
    durationMs: 9600,
    breathMs: 5600,
    breathScale: 1.11,
    opacityDark: 0.18,
    opacityLight: 0.13,
    startDelayMs: 1600,
  },
  {
    id: 'glow-violet-offset',
    colorDark: '#8b5cf6',
    colorLight: '#a78bfa',
    widthRatio: 0.46,
    aspectRatio: 0.76,
    xOffsetRatio: 0.27,
    bottomOffset: 136,
    tiltDeg: -5,
    driftX: 22,
    driftY: 14,
    durationMs: 12200,
    breathMs: 6800,
    breathScale: 1.1,
    opacityDark: 0.13,
    opacityLight: 0.1,
    startDelayMs: 2400,
  },
  {
    id: 'glow-sky-top',
    colorDark: '#38bdf8',
    colorLight: '#7dd3fc',
    widthRatio: 0.52,
    aspectRatio: 0.78,
    xOffsetRatio: 0.28,
    topRatio: -0.1,
    tiltDeg: -10,
    driftX: 26,
    driftY: 16,
    durationMs: 13600,
    breathMs: 7400,
    breathScale: 1.08,
    opacityDark: 0.08,
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
    opacity: interpolate(drift.value, [0, 0.5, 1], [1, 0.82, 1]),
  }));

  const focalSpan = Math.min(width, 980);
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
              <Stop offset="0%" stopColor={color} stopOpacity={0.72} />
              <Stop offset="22%" stopColor={color} stopOpacity={0.44} />
              <Stop offset="46%" stopColor={color} stopOpacity={0.18} />
              <Stop offset="70%" stopColor={color} stopOpacity={0.05} />
              <Stop offset="88%" stopColor={color} stopOpacity={0.01} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="46%" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Layer 2：输入框背后的「底座双层柔光」（纯 RadialGradient 错位叠加，彻底无硬椭圆边缘） */
function DockDiffusionBand({
  width,
  isDark,
  activeSV,
  genPulseSV,
}: {
  width: number;
  isDark: boolean;
  activeSV: SharedValue<number>;
  genPulseSV: SharedValue<number>;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 4800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const bandStyle = useAnimatedStyle(() => {
    const base = isDark ? 0.56 : 0.42;
    const idleAmp = isDark ? 0.14 : 0.1;
    const genBoost = activeSV.value * (0.2 + 0.18 * genPulseSV.value);
    return {
      opacity: base + idleAmp * pulse.value + genBoost,
      transform: [{ scale: 1 + activeSV.value * 0.04 * genPulseSV.value }],
    };
  });

  const dockW = Math.min(Math.round(width * 0.78), 880);
  const dockH = 156;
  const dockLeft = Math.round((width - dockW) / 2);
  const gradSuffix = isDark ? 'd' : 'l';

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: dockLeft,
          bottom: 18,
          width: dockW,
          height: dockH,
        },
        WEB_GLOW_BLUR,
        bandStyle,
      ]}
    >
      <Svg width={dockW} height={dockH}>
        <Defs>
          <RadialGradient id={`dock-cyan-${gradSuffix}`} cx="38%" cy="54%" r="48%">
            <Stop offset="0%" stopColor={isDark ? '#38bdf8' : '#38bdf8'} stopOpacity={0.34} />
            <Stop offset="24%" stopColor={isDark ? '#06b6d4' : '#38bdf8'} stopOpacity={0.2} />
            <Stop offset="50%" stopColor={isDark ? '#2F7DE1' : '#60a5fa'} stopOpacity={0.08} />
            <Stop offset="76%" stopColor={isDark ? '#2F7DE1' : '#60a5fa'} stopOpacity={0.02} />
            <Stop offset="100%" stopColor={isDark ? '#2F7DE1' : '#60a5fa'} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`dock-indigo-${gradSuffix}`} cx="62%" cy="52%" r="48%">
            <Stop offset="0%" stopColor={isDark ? '#6366f1' : '#818cf8'} stopOpacity={0.36} />
            <Stop offset="24%" stopColor={isDark ? '#8b5cf6' : '#818cf8'} stopOpacity={0.2} />
            <Stop offset="50%" stopColor={isDark ? '#6366f1' : '#a5b4fc'} stopOpacity={0.08} />
            <Stop offset="76%" stopColor={isDark ? '#6366f1' : '#a5b4fc'} stopOpacity={0.02} />
            <Stop offset="100%" stopColor={isDark ? '#6366f1' : '#a5b4fc'} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* 填满全 SVG 矩形画布：仅靠 RadialGradient 本身在到达边缘前自然归零 */}
        <Ellipse cx="38%" cy="54%" rx="48%" ry="46%" fill={`url(#dock-cyan-${gradSuffix})`} />
        <Ellipse cx="62%" cy="52%" rx="48%" ry="46%" fill={`url(#dock-indigo-${gradSuffix})`} />
      </Svg>
    </Animated.View>
  );
}

/** Layer 3：错落星空微点阵（4 个独立相位组错落闪烁 + ±1.5px 缓慢微漂移） */
type StarPoint = {
  key: string;
  x: number;
  y: number;
  r: number;
  alpha: number;
  color: string;
};

type StarGroupSpec = {
  twinkleMs: number;
  delayMs: number;
  driftMs: number;
  driftX: number;
  driftY: number;
};

const STAR_GROUPS: StarGroupSpec[] = [
  { twinkleMs: 3200, delayMs: 0, driftMs: 10500, driftX: 1.4, driftY: 1.0 },
  { twinkleMs: 4100, delayMs: 700, driftMs: 12200, driftX: -1.3, driftY: 1.2 },
  { twinkleMs: 4900, delayMs: 1500, driftMs: 13800, driftX: 1.1, driftY: -1.3 },
  { twinkleMs: 5700, delayMs: 2300, driftMs: 15000, driftX: -1.5, driftY: -0.9 },
];

/** 确定性伪随机（避免每次重渲染星点跳位置） */
function hash01(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function StarPhaseLayer({
  stars,
  bandW,
  bandH,
  spec,
}: {
  stars: StarPoint[];
  bandW: number;
  bandH: number;
  spec: StarGroupSpec;
}) {
  const twinkle = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    twinkle.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(1, { duration: spec.twinkleMs, easing: ease }), -1, true),
    );
    drift.value = withDelay(
      Math.round(spec.delayMs * 0.5),
      withRepeat(withTiming(1, { duration: spec.driftMs, easing: ease }), -1, true),
    );
    return () => {
      cancelAnimation(twinkle);
      cancelAnimation(drift);
    };
  }, [twinkle, drift, spec]);

  const layerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(twinkle.value, [0, 1], [0.3, 1]),
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-spec.driftX, spec.driftX]) },
      { translateY: interpolate(drift.value, [0, 1], [-spec.driftY, spec.driftY]) },
    ],
  }));

  if (stars.length === 0) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, layerStyle]}>
      <Svg width={bandW} height={bandH}>
        {stars.map((s) => (
          <Circle
            key={s.key}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.color}
            fillOpacity={s.alpha}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

const StarfieldLayers = memo(function StarfieldLayers({
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
  const bandW = Math.min(Math.round(width * 0.86), 960);
  const bandH = Math.min(340, Math.round(height * 0.48));
  const bandLeft = Math.round((width - bandW) / 2);

  const groupedStars = useMemo(() => {
    const groups: StarPoint[][] = [[], [], [], []];
    if (bandW <= 0 || bandH <= 0) return groups;

    const totalCandidates = 76;
    const cx = bandW * 0.5;
    const cy = bandH * 0.78;
    const rx = Math.max(160, bandW * 0.47);
    const ry = Math.max(120, bandH * 0.78);
    const peak = isDark ? 0.36 : 0.15;

    for (let i = 0; i < totalCandidates; i++) {
      const u = hash01(i * 3 + 1);
      const v = hash01(i * 3 + 2);
      const w = hash01(i * 3 + 3);

      // 主星云偏重中下部（v^0.78），保留少量远星自然向上延伸
      const x = 14 + u * (bandW - 28);
      const y = 12 + Math.pow(v, 0.78) * (bandH - 24);

      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const distSq = nx * nx + ny * ny;
      if (distSq >= 1) continue;

      const falloff = Math.pow(1 - distSq, 1.35);
      const size = Number((0.7 + w * 0.65).toFixed(2));
      const baseAlpha = peak * (0.48 + 0.52 * w) * falloff;
      const alpha = Number(baseAlpha.toFixed(3));
      if (alpha < 0.025) continue;

      const color = isDark
        ? i % 3 === 0
          ? '#c7d2fe'
          : '#e0f2fe'
        : i % 3 === 0
          ? '#818cf8'
          : '#60a5fa';

      groups[i % 4].push({
        key: `star-${i}`,
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        r: size,
        alpha,
        color,
      });
    }
    return groups;
  }, [bandW, bandH, isDark]);

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: 0.92 + activeSV.value * 0.22,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: bandLeft,
          bottom: 52,
          width: bandW,
          height: bandH,
        },
        wrapperStyle,
      ]}
    >
      {STAR_GROUPS.map((spec, idx) => (
        <StarPhaseLayer
          key={idx}
          stars={groupedStars[idx]}
          bandW={bandW}
          bandH={bandH}
          spec={spec}
        />
      ))}
    </Animated.View>
  );
});

/** Layer 4：桌面 Web 鼠标粘滞跟随光斑（0.05 缓动追随，静止自动停止 rAF，移动端跳过） */
function MouseFollowGlow({
  containerRef,
  width,
  height,
  isDark,
}: {
  containerRef: React.RefObject<any>;
  width: number;
  height: number;
  isDark: boolean;
}) {
  const glowElRef = useRef<any>(null);
  const spotW = 500;
  const spotH = 420;

  useEffect(() => {
    if (!CAN_HOVER_WEB || width <= 0 || height <= 0) return;
    const win = globalThis as any;
    const doc = win?.document;
    if (!win?.addEventListener || !doc?.addEventListener) return;

    const restX = width * 0.65;
    const restY = height * 0.85;
    let targetX = restX;
    let targetY = restY;
    let curX = restX;
    let curY = restY;
    let targetOpacity = 0;
    let curOpacity = 0;
    let rafId = 0;

    const applyDom = () => {
      const node = glowElRef.current;
      if (!node?.style) return;
      node.style.transform = `translate3d(${(curX - spotW / 2).toFixed(1)}px, ${(curY - spotH / 2).toFixed(1)}px, 0)`;
      node.style.opacity = curOpacity.toFixed(3);
    };

    const tick = () => {
      const dx = targetX - curX;
      const dy = targetY - curY;
      const dop = targetOpacity - curOpacity;
      curX += dx * 0.05;
      curY += dy * 0.05;
      curOpacity += dop * 0.08;
      applyDom();

      if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35 && Math.abs(dop) < 0.005) {
        curX = targetX;
        curY = targetY;
        curOpacity = targetOpacity;
        applyDom();
        rafId = 0;
        return;
      }
      rafId = win.requestAnimationFrame(tick);
    };

    const scheduleTick = () => {
      if (!rafId) {
        rafId = win.requestAnimationFrame(tick);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect?.();
      if (!rect) return;
      const rx = e.clientX - rect.left;
      const ry = e.clientY - rect.top;
      if (rx >= -40 && rx <= rect.width + 40 && ry >= -40 && ry <= rect.height + 40) {
        targetX = rx;
        targetY = ry;
        targetOpacity = 1;
      } else {
        targetOpacity = 0;
      }
      scheduleTick();
    };

    const onMouseLeave = () => {
      targetX = restX;
      targetY = restY;
      targetOpacity = 0;
      scheduleTick();
    };

    applyDom();
    win.addEventListener('mousemove', onMouseMove, { passive: true });
    doc.addEventListener('mouseleave', onMouseLeave);

    return () => {
      if (rafId) win.cancelAnimationFrame(rafId);
      win.removeEventListener('mousemove', onMouseMove);
      doc.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [containerRef, width, height]);

  if (!CAN_HOVER_WEB) return null;

  const gradPrimary = `mouse-indigo-${isDark ? 'd' : 'l'}`;
  const gradAccent = `mouse-cyan-${isDark ? 'd' : 'l'}`;

  return (
    <View
      ref={glowElRef}
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: spotW,
          height: spotH,
          opacity: 0,
        },
        WEB_FOLLOW_BLUR,
      ]}
    >
      <Svg width={spotW} height={spotH}>
        <Defs>
          <RadialGradient id={gradPrimary} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={isDark ? '#6366f1' : '#60a5fa'} stopOpacity={isDark ? 0.15 : 0.1} />
            <Stop offset="36%" stopColor={isDark ? '#6366f1' : '#60a5fa'} stopOpacity={isDark ? 0.08 : 0.05} />
            <Stop offset="72%" stopColor={isDark ? '#6366f1' : '#60a5fa'} stopOpacity={0.02} />
            <Stop offset="100%" stopColor={isDark ? '#6366f1' : '#60a5fa'} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={gradAccent} cx="54%" cy="54%" r="44%">
            <Stop offset="0%" stopColor={isDark ? '#38bdf8' : '#7dd3fc'} stopOpacity={isDark ? 0.09 : 0.06} />
            <Stop offset="50%" stopColor={isDark ? '#38bdf8' : '#7dd3fc'} stopOpacity={0.03} />
            <Stop offset="100%" stopColor={isDark ? '#38bdf8' : '#7dd3fc'} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="50%" rx="50%" ry="44%" fill={`url(#${gradPrimary})`} />
        <Ellipse cx="54%" cy="54%" rx="44%" ry="38%" fill={`url(#${gradAccent})`} />
      </Svg>
    </View>
  );
}

/** Layer 5：生成态能量扫光（限制在居中输入框底座区间内，绝不扫进侧边栏） */
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
  const dockW = Math.min(Math.round(width * 0.76), 820);
  const dockLeft = Math.round((width - dockW) / 2);
  const beamW = Math.min(280, Math.round(dockW * 0.42));
  const beamH = 84;

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
    const peak = isDark ? 0.58 : 0.4;
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
        bottom: 40,
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
              <Stop offset="0%" stopColor={isDark ? '#7dd3fc' : '#38bdf8'} stopOpacity={0.85} />
              <Stop offset="34%" stopColor={isDark ? '#2F7DE1' : '#2563eb'} stopOpacity={0.38} />
              <Stop offset="70%" stopColor="#2F7DE1" stopOpacity={0.08} />
              <Stop offset="100%" stopColor="#2F7DE1" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="46%" fill={`url(#${gradId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

type ChatGlowBackgroundProps = {
  isDark: boolean;
  /** 模型正在思考/吐字时轻微提亮极光、加快呼应脉动并唤醒底部水平扫光 */
  isGenerating?: boolean;
};

const ChatGlowBackground = memo(function ChatGlowBackground({
  isDark,
  isGenerating = false,
}: ChatGlowBackgroundProps) {
  const containerRef = useRef<any>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const activeSV = useSharedValue(isGenerating ? 1 : 0);
  const idleBreatheSV = useSharedValue(0);
  const genPulseSV = useSharedValue(0);

  // 8s 常驻呼吸底色
  useEffect(() => {
    idleBreatheSV.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(idleBreatheSV);
  }, [idleBreatheSV]);

  // AI 生成态呼应：提亮极光并启动温和节奏脉动，完成后平滑回落
  useEffect(() => {
    activeSV.value = withTiming(isGenerating ? 1 : 0, {
      duration: isGenerating ? 550 : 750,
      easing: Easing.out(Easing.cubic),
    });
    if (isGenerating) {
      genPulseSV.value = 0;
      genPulseSV.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
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

  const ambientBreathStyle = useAnimatedStyle(() => {
    const baseBreath = interpolate(idleBreatheSV.value, [0, 1], [0.74, 1]);
    const scaleIdle = interpolate(idleBreatheSV.value, [0, 1], [1, 1.06]);
    const genBoost = activeSV.value * (0.24 + 0.18 * genPulseSV.value);
    return {
      opacity: baseBreath + genBoost,
      transform: [{ scale: scaleIdle + activeSV.value * 0.03 * genPulseSV.value }],
    };
  });

  return (
    <View
      ref={containerRef}
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
          <Animated.View style={[StyleSheet.absoluteFill, WEB_GLOW_BLUR, ambientBreathStyle]}>
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
          <DockDiffusionBand
            width={layout.width}
            isDark={isDark}
            activeSV={activeSV}
            genPulseSV={genPulseSV}
          />
          <StarfieldLayers
            width={layout.width}
            height={layout.height}
            isDark={isDark}
            activeSV={activeSV}
          />
          <MouseFollowGlow
            containerRef={containerRef}
            width={layout.width}
            height={layout.height}
            isDark={isDark}
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
