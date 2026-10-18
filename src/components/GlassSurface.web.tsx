import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { GLASS, webGlassBg } from './glassConfig';

/**
 * Web 端毛玻璃容器：走 CSS `backdrop-filter`（无 BlurView）。
 * 布局仍由调用方的 `style` 决定，本组件只加「玻璃底」。
 */
type GlassSurfaceProps = {
  theme: { isDark: boolean };
  style?: StyleProp<ViewStyle>;
  /** Web 不使用；保留以满足三端一致的 props（原生端走 blurTarget） */
  blurTarget?: React.RefObject<View | null>;
  children?: React.ReactNode;
};

export default function GlassSurface({ theme, style, children }: GlassSurfaceProps) {
  return (
    <View
      style={[
        {
          backgroundColor: webGlassBg(theme.isDark),
          backdropFilterBlur: GLASS.webBlur,
        } as any,
        style,
      ]}
    >
      {children}
    </View>
  );
}