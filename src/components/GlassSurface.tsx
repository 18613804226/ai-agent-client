import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { GLASS, androidScrim, nativeGlassBg } from './glassConfig';

/**
 * 原生端（iOS + Android）的毛玻璃容器。
 *
 * 输入栏本体的布局（尺寸/边框/圆角/内边距）由调用方通过 `style` 传入；
 * 本组件只负责「玻璃底」：底色 + BlurView（+ Android 的 scrim），并保证
 * 按钮/输入框等 children 渲染在玻璃层之上。
 *
 * Android 与 iOS 共用此文件：两者都是同一个 `BlurView`，仅 props 不同
 * （Android 需 `blurTarget`/`blurMethod`，见 {@link blurProps}），
 * 因此用一个 `Platform.OS` 分支即可，不重复 JSX。Web 见 `GlassSurface.web.tsx`。
 */
type GlassSurfaceProps = {
  theme: { isDark: boolean };
  style?: StyleProp<ViewStyle>;
  /** Android 真模糊目标（BlurTargetView 的 ref）；缺省时 Android 回退 'none' */
  blurTarget?: React.RefObject<View | null>;
  children?: React.ReactNode;
};

export default function GlassSurface({
  theme,
  style,
  blurTarget,
  children,
}: GlassSurfaceProps) {
  const bg = nativeGlassBg(theme.isDark);
  const isAndroid = Platform.OS === 'android';

  const blurProps = {
    intensity: isAndroid ? GLASS.androidIntensity : GLASS.iosIntensity,
    tint: theme.isDark ? ('dark' as const) : ('light' as const),
    ...(isAndroid
      ? {
          blurReductionFactor: GLASS.androidBlurReductionFactor,
          ...(blurTarget
            ? { blurMethod: 'dimezisBlurView' as const, blurTarget }
            : {}),
        }
      : {}),
  } as const;

  return (
    <View style={[styles.container, { backgroundColor: bg }, style]}>
      {/* BlurView 正好填满父容器，backgroundColor 与容器一致，避免边缘色差条带 */}
      <BlurView
        style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}
        {...(blurProps as any)}
      />
      {/* Android：blur 之上的主题色 scrim，压住透出的光晕/背景（无 0.69 上限） */}
      {isAndroid && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: androidScrim(theme.isDark), pointerEvents: 'none' },
          ]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // 原生端用裁剪切出圆角（BlurView 不认显式 borderRadius）
    overflow: 'hidden',
  },
});