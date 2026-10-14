import React, { useState } from 'react';
import { Platform, Pressable, TouchableOpacity } from 'react-native';

export interface HoverTouchableProps {
  style?: any;
  /** Web 端悬停背景色 */
  hoverBg?: string;
  onPress?: () => void;
  /** iOS / Web 按压透明度（Android 走水波纹，不受此值影响） */
  activeOpacity?: number;
  /** Android 水波纹颜色（默认中性灰，深浅主题下均可见） */
  rippleColor?: string;
  children: React.ReactNode;
  [key: string]: any;
}

/**
 * 🎯 全局统一的可点击元素：
 * - Android：Material 水波纹（从触点扩散，按按钮圆角裁剪）
 * - iOS：透明度按压反馈（系统标准）
 * - Web：悬停变色 + 手型指针，带 0.15s 平滑过渡
 *
 * 与 TouchableOpacity 同名的 onLongPress / delayLongPress / hitSlop / disabled /
 * accessibility* 等 props 均由 ...props 透传，调用方无感切换。
 */
export const HoverTouchable = React.forwardRef<any, HoverTouchableProps>(
  function HoverTouchable(
    {
      style,
      hoverBg = 'rgba(0, 0, 0, 0.06)', // 默认“新建对话”同款的轻量悬停加深/提亮效果
      onPress,
      activeOpacity = 0.7,
      rippleColor = 'rgba(128, 128, 128, 0.4)',
      children,
      ...props
    },
    ref
  ) {
    const [isHovered, setIsHovered] = useState(false);

    // 📱 Android：Material 水波纹反馈（按压时从触点扩散涟漪）
    // overflow:hidden 让涟漪按按钮圆角裁剪
    if (Platform.OS === 'android') {
      return (
        <Pressable
          ref={ref}
          style={[style, { overflow: 'hidden' }]}
          android_ripple={{
            color: rippleColor,
            foreground: true,
            borderless: false,
          }}
          onPress={onPress}
          {...props}
        >
          {children}
        </Pressable>
      );
    }

    // 🖥️ iOS / Web：透明度按压反馈 + Web 悬停变色
    return (
      <TouchableOpacity
        ref={ref}
        style={[
          style,
          Platform.OS === 'web' && {
            transitionProperty: 'background-color',
            transitionDuration: '0.15s',
            transitionTimingFunction: 'ease',
            cursor: 'pointer',
          },
          Platform.OS === 'web' && isHovered && { backgroundColor: hoverBg },
        ]}
        onPress={onPress}
        activeOpacity={activeOpacity}
        // @ts-ignore
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
  }
);

export default HoverTouchable;
