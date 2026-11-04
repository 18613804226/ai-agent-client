import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { webGlassBg } from './glassConfig';

/**
 * Web 端磨砂半透容器（无 backdrop-filter）：只加一层半透明主题色。
 * 布局仍由调用方的 `style` 决定。
 */
type GlassSurfaceProps = {
  theme: { isDark: boolean };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export default function GlassSurface({ theme, style, children }: GlassSurfaceProps) {
  return (
    <View style={[{ backgroundColor: webGlassBg(theme.isDark) }, style]}>
      {children}
    </View>
  );
}
