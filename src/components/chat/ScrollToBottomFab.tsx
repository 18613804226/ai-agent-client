import React from 'react'
import Svg, { Path } from 'react-native-svg'
import Animated from 'react-native-reanimated'
import { HoverTouchable } from '../HoverTouchable'
import { PopAnim, POP_CSS_FALLBACK } from '../PopAnim'
import type { ThemeType } from '../../types/chat'
import { chatAreaStyles as styles } from './chatAreaStyles'

/**
 * 悬浮「回到底部」按钮：上滑超过一定距离才显示，淡入 + 上滑出现。
 */
export function ScrollToBottomFab({
  visible,
  theme,
  bottomInset,
  onPress
}: {
  visible: boolean
  theme: ThemeType
  /** 内容铺到屏幕底边后，按钮要抬高到悬浮输入栏之上才不被遮住 */
  bottomInset: number
  onPress: () => void
}) {
  if (!visible) return null
  return (
    <PopAnim kind="fab">
      {(animStyle) => (
        <Animated.View
          style={[
            styles.scrollToBottomBtnWrap,
            { bottom: bottomInset + 24 },
            POP_CSS_FALLBACK,
            animStyle
          ].filter(Boolean)}
        >
          <HoverTouchable
            onPress={onPress}
            activeOpacity={0.8}
            rippleColor={
              theme.isDark
                ? 'rgba(255, 255, 255, 0.3)'
                : 'rgba(0, 0, 0, 0.15)'
            }
            style={[
              styles.scrollToBottomBtn,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(40,40,40,0.92)'
                  : 'rgba(255,255,255,0.95)',
                borderColor: theme.border
              }
            ]}
          >
            <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 5v14M19 12l-7 7-7-7"
                stroke={theme.textMain}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </HoverTouchable>
        </Animated.View>
      )}
    </PopAnim>
  )
}
