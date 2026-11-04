import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { nativeGlassBg } from './glassConfig'

/**
 * 原生端磨砂半透容器（无高斯模糊）：只提供一层半透明主题色，
 * 让背后的内容变暗透出。输入栏本体的布局由调用方通过 `style` 传入。
 */
type GlassSurfaceProps = {
  theme: { isDark: boolean };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export default function GlassSurface({
  theme,
  style,
  children,
}: GlassSurfaceProps) {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: nativeGlassBg(theme.isDark) },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
