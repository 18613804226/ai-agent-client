import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * 三指下滑截图（ColorOS / 一加等 Android 系统手势）与原生文本选择的冲突处理。
 *
 * 现象：三指下滑时列表**完全不滚动**，但其中一根手指落在 <Text selectable> 上，
 * Android 的 TextView 会把它当成长按/拖选，拉出蓝绿色选区 —— 选区被系统截屏
 * 一起截进去。所以「滚动时禁用选择」那套思路在这里无效：压根没有滚动。
 *
 * 处理：用「多指触摸」这个可区分信号（普通滚动/长按都是单指）立刻把
 * textSelectable 关掉 —— 原生 setTextIsSelectable(false) 会让选区与手柄自动收起
 * （项目里抽屉打开时清选择用的就是这一招）；手势结束后延时恢复，长按复制照常可用。
 *
 * ⚠️ 不能单靠 onTouchCancel 判断系统手势：ScrollView 接管单指滚动时同样会下发
 *    ACTION_CANCEL，那会在**每次滚动**都触发列表重渲染。所以 cancel 只有在
 *    「本轮已经观察到多指」之后才认，单指滚动的 cancel 直接忽略。
 */
const RESTORE_DELAY = 260
/** 兜底：系统手势偶尔会把 end/cancel 都吞掉，最长压制这么久后无条件恢复 */
const MAX_SUPPRESS_MS = 1500

export function useSelectionGestureGuard() {
  const [selectionSuppressed, setSelectionSuppressed] = useState(false)
  const suppressedRef = useRef(false)
  const multiTouchRef = useRef(false)
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelRestore = useCallback(() => {
    if (restoreTimer.current !== null) {
      clearTimeout(restoreTimer.current)
      restoreTimer.current = null
    }
  }, [])

  const suppress = useCallback(() => {
    // 多指还按着时别让上一次的恢复定时器把 selectable 提前放回来
    cancelRestore()
    if (!suppressedRef.current) {
      suppressedRef.current = true
      setSelectionSuppressed(true)
    }
    // 每次 onTouchMove 都会重置这个兜底，手势进行中不会提前恢复；
    // 手势一停，即使 end/cancel 被系统吞了也会自动放开。
    restoreTimer.current = setTimeout(() => {
      restoreTimer.current = null
      suppressedRef.current = false
      setSelectionSuppressed(false)
    }, MAX_SUPPRESS_MS)
  }, [cancelRestore])

  const scheduleRestore = useCallback(() => {
    cancelRestore()
    restoreTimer.current = setTimeout(() => {
      restoreTimer.current = null
      if (!suppressedRef.current) return
      suppressedRef.current = false
      setSelectionSuppressed(false)
    }, RESTORE_DELAY)
  }, [cancelRestore])

  useEffect(() => cancelRestore, [cancelRestore])

  const onTouchStart = useCallback(
    (e: any) => {
      if ((e?.nativeEvent?.touches?.length ?? 0) >= 2) {
        multiTouchRef.current = true
        suppress()
      }
    },
    [suppress]
  )

  const onTouchMove = useCallback(
    (e: any) => {
      if ((e?.nativeEvent?.touches?.length ?? 0) >= 2) {
        multiTouchRef.current = true
        suppress()
      }
    },
    [suppress]
  )

  const onTouchEnd = useCallback(
    (e: any) => {
      // touches 是「剩余」触点，归零才算整轮手势结束
      if ((e?.nativeEvent?.touches?.length ?? 0) > 0) return
      multiTouchRef.current = false
      if (suppressedRef.current) scheduleRestore()
    },
    [scheduleRestore]
  )

  const onTouchCancel = useCallback(() => {
    // 系统截图手势接管时会 cancel 掉应用当前触摸序列，补一刀确保选区收起
    if (multiTouchRef.current) suppress()
    multiTouchRef.current = false
    if (suppressedRef.current) scheduleRestore()
  }, [suppress, scheduleRestore])

  const guardProps = useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }),
    [onTouchStart, onTouchMove, onTouchEnd, onTouchCancel]
  )

  return { selectionSuppressed, guardProps }
}
