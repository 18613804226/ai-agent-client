import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * 跨端「出现/消失」动画外壳（三处共用：自封弹窗 / 长按菜单 / 回到底部按钮）。
 *
 * 为什么不用 entering/exiting（如 FadeIn/ZoomIn）：
 *  - web 走 reanimated 兼容模式时，entering/exiting 的 JS 降级偶发不触发，
 *    且 Modal 内的布局动画在 RNW 下不稳定；
 *  - 这里用 sharedValue + useAnimatedStyle 手动驱动，原生走 UI 线程、web 走
 *    JS 降级都有稳定输出，行为三端一致。
 *
 * 动效语言（统一、有质感、最快档）：
 *  - 弹窗/菜单：淡入 + 极轻微放大（0.96 → 1）+ 微上移 4px，超高 stiffness
 *    近乎无回弹（~120ms 体感）；
 *    消失只做快速淡出（120ms），不等缩放播完，避免关掉时拖泥带水。
 *  - 回到底部按钮：淡入 + 从下方 6px 滑入；消失同理反向。
 */
export type PopAnimKind = 'dialog' | 'fab';

export function PopAnim({
  kind = 'dialog',
  children,
}: {
  kind?: PopAnimKind;
  children: (style: any) => React.ReactNode;
}) {
  const t = useSharedValue(0);
  // ⚠️ 透明度不跟弹簧走：单独快速淡入（~100ms），否则回弹那下会闪。
  // 位移/缩放继续走 spring 保留弹性。
  const o = useSharedValue(0);

  useEffect(() => {
    // ⚠️ 还慢 → 拉到最快还保留一点弹性的程度：超高 stiffness + 高 damping，
    // 几乎无可见回弹，体感 ~120ms。再快就只能纯 timing（发硬），不建议。
    if (kind === 'fab') {
      t.value = withSpring(1, { damping: 30, stiffness: 900 });
    } else {
      t.value = withSpring(1, { damping: 32, stiffness: 1000 });
    }
    o.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.ease) });
  }, [kind, t, o]);

  const style = useAnimatedStyle(() => {
    if (kind === 'fab') {
      return {
        opacity: o.value,
        transform: [{ translateY: (1 - t.value) * 6 }],
      };
    }
    return {
      opacity: o.value,
      transform: [
        { scale: 0.96 + 0.04 * t.value },
        { translateY: (1 - t.value) * 4 },
      ],
    };
  });

  return <>{children(style)}</>;
}

/**
 * web 兼容兜底：reanimated 兼容模式下 transform 数组偶发不更新，
 * 给外层补一个 CSS 过渡，保证即使 UI 线程没跑起来也有淡入。
 * （原生端是空对象，零成本。）
 */
export const POP_CSS_FALLBACK = Platform.select({
  web: {
    transitionProperty: 'opacity, transform',
    transitionDuration: '0.12s',
    transitionTimingFunction: 'cubic-bezier(0.2, 0.9, 0.25, 1.1)',
  } as any,
  default: {},
});

/** 消失走快速淡出：配合 Modal animationType="none" 用，避免系统 fade 叠加速。 */
export const EXIT_MS = 120;
export const exitEasing = Easing.out(Easing.ease);
export { withTiming };
