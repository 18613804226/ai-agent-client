import React from 'react'
import { Platform, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { chatMessageStyles } from '../ChatMessageItem.styles'

/** 钉顶时用户消息上方保留的间隙 = 相邻气泡之间的间距（messageRow.marginBottom），
 *  这样钉顶后气泡上方的留白与「和上一个气泡的间距」一致，不会显得突兀。
 *  想调多/调少改 ChatMessageItem.styles 的 messageRow.marginBottom 即可。 */
export const PIN_TOP_GAP =
  (chatMessageStyles.messageRow as any)?.marginBottom ?? 20

/**
 * 输入栏小字行的高度补偿。提示行固定高度、仅淡出，ChatArea 布局不随键盘变化，
 * 因此补偿保持为 0。
 */
export const FOOTER_COLLAPSE = 0

/**
 * FlashList v2 的内容锚定（MVCP）：
 * - **开启**「上方条目尺寸变化时锚定首条可见项」。贴底后第一次往下翻历史时，
 *   视口上方大量虚拟化 cell 会从「类型平均高度估算」切成真实高度，内容总高随之变化；
 *   MVCP 关闭时原生 ScrollView 会把越界的 offset 夹回新的 maxScroll —— 表现就是
 *   「贴底后第一次拖动被拽回底部，第二次（已测量完）就正常」。
 * - **关闭**「滚到底部时自动跟随」：v2 的 `autoscrollToBottomThreshold` 默认就是 -1
 *   （关闭），这里显式写死，保证「新消息不自动贴底」的业务规则不被库默认值变更影响。
 */
export const FLASHLIST_MVCP =
  Platform.OS === 'web'
    ? // Web 端贴底由 useChatScroll 逐帧写 scrollTop，FlashList 的 JS 位置校正
      // （ScrollAnchor/applyOffsetCorrection）会和它抢，保持原来的全关状态。
      ({ disabled: true } as const)
    : ({ autoscrollToBottomThreshold: -1 } as const)

/** FlashList cell 容器：把键盘内容位移同样作用到每个 cell 上（contentContainerStyle 不支持 transform） */
export const AnimatedCellContainer = Animated.createAnimatedComponent(View)

/** 把 Reanimated animated ref 和 FlashList 自己的 ScrollView ref 合并到同一个实例上 */
export function mergeRefs(...refs: any[]) {
  return (node: any) => {
    refs.forEach((r) => {
      if (!r) return
      if (typeof r === 'function') r(node)
      else r.current = node
    })
  }
}

/**
 * 生成 FlashList 的 CellRendererComponent。
 * ⚠️ 键盘位移**不能**加在 cell 容器上，只能加在 cell 内部的包裹层：
 * FlashList 用 measureItemLayout(cellContainer) 反推每一条的 y，
 * 容器一旦带 transform，测量值会整体偏移（偏移量 = 键盘高度，可达上千 px），
 * layout manager 里的 y 就全错了 —— cell 被摆到错误位置，
 * 表现为「新消息跑到最上面 / 回复位置错乱 / 自己发的消息不见了」。
 * 包一层之后，容器的布局尺寸不受 transform 影响，测量保持准确。
 */
export function createRenderCell(contentShiftStyle: any) {
  return ({ children, ...props }: any) => (
    <AnimatedCellContainer {...props} style={props.style}>
      {Platform.OS === 'web' ? (
        children
      ) : (
        <Animated.View style={contentShiftStyle}>{children}</Animated.View>
      )}
    </AnimatedCellContainer>
  )
}
