import React from 'react'
import Reanimated from 'react-native-reanimated'
import { PopAnim, POP_CSS_FALLBACK } from '../PopAnim'

/**
 * 长按菜单卡片统一动画外壳（文件 / 对话共用）：
 * 淡入 + 轻微放大 + 微上移，spring 回弹；定位/颜色调用方照常传。
 */
export function SheetCardAnim({
  style,
  children
}: {
  style?: any
  children: React.ReactNode
}) {
  return (
    <PopAnim kind="dialog">
      {(animStyle) => (
        <Reanimated.View style={[style, POP_CSS_FALLBACK, animStyle]}>
          {children}
        </Reanimated.View>
      )}
    </PopAnim>
  )
}
