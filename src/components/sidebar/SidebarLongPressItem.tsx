import React from 'react'
import HoverTouchable from '../HoverTouchable'
import { useSuppressBrowserCallout } from '../../hooks/useSuppressBrowserCallout'

/**
 * 获取组件在「窗口/视口」中的位置。
 * 原生优先 measureInWindow；Web 端 DOM 节点回退到 getBoundingClientRect，
 * 保证与容器坐标系一致，避免滚动偏移导致菜单位置偏下。
 */
export function measureWindowPos(
  node: any,
  cb: (x: number, y: number, w: number, h: number) => void
) {
  if (!node) {
    cb(0, 0, 0, 0)
    return
  }
  if (typeof node.measureInWindow === 'function') {
    node.measureInWindow((x: number, y: number, w: number, h: number) =>
      cb(x, y, w, h)
    )
    return
  }
  if (typeof node.getBoundingClientRect === 'function') {
    const r = node.getBoundingClientRect()
    cb(r.left, r.top, r.width, r.height)
    return
  }
  if (typeof node.measure === 'function') {
    node.measure(
      (_x: number, _y: number, w: number, h: number, px: number, py: number) =>
        cb(px, py, w, h)
    )
    return
  }
  cb(0, 0, 0, 0)
}

/**
 * 侧边栏长按项统一按压外壳（文件 / 对话共用）：
 *  - 长按 350ms 弹自家删除菜单（与原来 onLongPress + delayLongPress 语义一致）
 *  - web 端挂 useSuppressBrowserCallout：压住 OPPO 等浏览器长按弹系统菜单，
 *    否则系统菜单会盖住自家菜单、还抢长按事件
 *  - onPress 照常透传（点选不受影响）
 */
export function SidebarLongPressItem({
  itemKey,
  measureRefs,
  style,
  hoverBg,
  activeOpacity = 1,
  onPress,
  onLongPressAt,
  children
}: {
  itemKey: string
  measureRefs: React.MutableRefObject<Record<string, any>>
  style?: any
  hoverBg?: string
  activeOpacity?: number
  onPress?: () => void
  /** 长按触发：offsetX/offsetY 为触摸点相对项左上角的偏移 */
  onLongPressAt?: (offsetX: number, offsetY: number) => void
  children: React.ReactNode
}) {
  // 📱 H5/OPPO：条目上启用输入层压制（touchstart preventDefault）—— 这是压住
  //    国产浏览器长按系统菜单的唯一有效手段（它们不认 contextmenu 拦截）。
  //    useSuppressBrowserCallout 内部会在**短按时补回一个 click**，所以点击不受影响。
  const callout = useSuppressBrowserCallout(itemKey, { blockTouch: true })
  return (
    <HoverTouchable
      ref={(el: any) => {
        measureRefs.current[itemKey] = el
        ;(callout.ref as any).current = el
      }}
      style={[style, callout.suppressStyle]}
      hoverBg={hoverBg}
      activeOpacity={activeOpacity}
      onPress={onPress}
      onLongPress={
        onLongPressAt
          ? (e: any) =>
              onLongPressAt(
                e.nativeEvent?.locationX ?? 0,
                e.nativeEvent?.locationY ?? 0
              )
          : undefined
      }
      delayLongPress={350}
      // @ts-ignore RNW 透传到 DOM 的 onContextMenu
      onContextMenu={callout.contextMenuGuard}
    >
      {children}
    </HoverTouchable>
  )
}
