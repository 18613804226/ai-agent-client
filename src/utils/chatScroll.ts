import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

/**
 * 原生端聊天列表改用 **inverted（翻转）布局**：视觉底部 = 滚动坐标原点（offset 0）。
 *
 * 为什么必须这样（2026-01 结论，证据都在 node_modules 里）：
 *  1. Fabric 只在节点带「**JS 函数**的 onLayout prop」时才发射布局事件
 *     （react-native/ReactCommon/react/renderer/mounting/ShadowTree.cpp:574
 *      `if (viewProps->onLayout) { ... eventEmitter->onLayout(...) }`），
 *     而 reanimated 的 `useEvent(handler, ['onLayout'])` 返回的是对象
 *     `{ workletEventHandler }`（react-native-reanimated/src/hook/useEvent.ts），
 *     → 布局事件根本不会被发射，锚点 worklet 一次都不会跑；
 *  2. 就算发射了，reanimated 4 也会丢掉它：raw event 监听器先判线程
 *     （react-native-reanimated/apple/reanimated/apple/ReanimatedModule.mm，
 *      非主队列直接 return，注释原话 "we don't care about topLayout events"），
 *      之后才在 ReanimatedModuleProxy.cpp:695 把 `topLayout` 归一化成 `onLayout`；
 *  3. RN 的 `onContentSizeChange` 也不是原生事件，而是 ScrollView.js 用内容容器的
 *     **JS onLayout** 合成的（RCTScrollViewComponentView.mm 里根本没有这个事件），
 *     天生比「内容长高」晚一帧以上 —— 吐字期每帧补一发就是「先长高 → 再滚一下」的抖动本身；
 *  4. UI 线程唯一可靠的信号 `onScroll` 在「贴底 + 内容变高」时**不会触发**（offset 没变）。
 *  ⇒「内容长高 → UI 线程贴底」这条链在 Reanimated 4 + Fabric 上不可能成立。
 *
 * 而 inverted 布局下，吐字期**根本不需要任何滚动命令**：内容往上长，offset 保持 0
 * 就是贴在底部，结构上零抖动（这也是所有聊天 App 的做法）。
 *
 * 变换的写法（Android `scale:-1` / iOS `scaleY:-1`）与 RN 自带 inverted 列表同源，
 * 见 @react-native/virtualized-lists/Lists/VirtualizedList.js:2038-2041
 * `verticallyInverted`（这里逐字照抄，**不是自创**），
 * 但**施加的位置不同，锚点就不同，这里必须记清**：
 * - RN 自带：翻 ScrollView（VirtualizedList.js:1108）+ **逐条**翻 cell
 *   （VirtualizedList.js:817 把 inversionStyle 传进 CellRenderer，
 *    落在 VirtualizedListCellRenderer.js:207-213；⚠️ 那里同时还把 cell 的
 *    flexDirection 反成 columnReverse，所以「逐条翻」= transform + 内部方向反转，
 *    不只是 transform。header/empty/footer 也各自翻一次：:958 / :918 / :1077）
 *   ⇒ 落在视觉底部的是布局起点，也就是**数组第一个元素**
 *   ⇒ 所以官方 inverted FlatList 的 data 必须**反转**（最新在前）。
 * - 本项目：翻 ScrollView + **逐条**翻 cell（手动模拟 RN CellRenderer 逻辑，
 *   见 CELL_INVERSION_STYLE），不翻 contentContainer。
 *   ⇒ 落在视觉底部的是布局起点 = **数组第一个元素**
 *   ⇒ 所以 messages **必须反转**（最新在前），与官方 inverted FlatList 一致。
 *   cell 的 scale(-1) 与 ScrollView 的 scale(-1) 抵消 → cell 内部坐标系正常，
 *   思考窗等嵌套内容不受翻转影响。
 * 两种写法都满足「翻两次 → 文字方向正常 + offset 0 = 视觉底部」。
 * 本项目选 ScrollView + 逐条 cell 翻转（而非 FlatList inverted）的原因：
 * - 同步渲染（ScrollView + map）→ 切会话丝滑，无 FlatList 虚拟化分批闪烁；
 * - 流式 Markdown 每帧重排是同步的，不走 VirtualizedList 异步 cell 更新；
 * - 代价：长会话（200+ 条）内存压力大，届时加「加载更多」分页即可。
 *
 * Web 端不翻转，继续走 useLayoutEffect + scrollTop：它在 paint 之前同步完成，
 * 本来就是零抖动。**原因不是「Web 没有这个能力」**——react-native-web 自己的
 * VirtualizedList 就是用 CSS 翻转实现的（react-native-web/dist/vendor/react-native/
 * VirtualizedList/index.js:1444 `verticallyInverted: { transform: 'scaleY(-1)' }`），
 * 但它必须额外挂一个 onWheel 补丁（同文件 :699-725，注释原话 "REACT-NATIVE-WEB patch
 * to preserve during future RN merges: Support inverted wheel scroller"，引用 issue
 * #995，且只在 `props.inverted` 时生效）去手动改写 `node.scrollTop`，说明**纯 CSS
 * 翻转在 Web 上的滚动输入链（滚轮 + 嵌套可滚动块）是不完备的**；而这里的收益为零
 * （`scrollTop = scrollHeight` 在同一个任务里完成「量 + 定」，本来就不抖）
 * ⇒ 为不存在的收益引入风险是净亏。另外 `inverted` 是 VirtualizedList 的 prop，
 * RN/RNW 的 ScrollView 上根本没有它（我们这里是普通 ScrollView + map，无处可挂），
 * `decelerationRate: 'fast'` 在 RNW 上也是 no-op —— 这两条才是 Web 真正「没有」的。
 *
 * ── 取舍（trade-off）：这笔账是怎么算的 ─────────────────────────────
 * 核心是**用一次性的风险换掉每帧的风险**：
 *   补丁式（旧的 UI 线程贴底 / Web 的 scrollTop）每帧都要赌「命令来得及」，
 *   风险频率 = 60fps × 回答时长，任何一帧迟到都是可见抖动；
 *   inverted 只在**改代码 / 升版本**时赌一次「坐标轴翻对了」，吐字期零命令。
 *   赌 1 次 vs 赌 60×N 次 —— 这是整个改动唯一真正的理由。
 *
 * 付掉的代价（都是长期账，别当成一次性的）：
 *  1. 滚动条也跟着被镜像（真机未报告观感问题，故**暂未处理**；要治就是加
 *     `showsVerticalScrollIndicator={false}`，代价是两端都再也看不到滚动条）；
 *  2. `contentContainerStyle` 挂 transform **不是 RN 文档化的 inverting 路径**
 *     → 升级回归风险，见上面那条警告；
 *  3. 镜像轴决定了锚住的是数组**开头** ⇒ data 必须反转（最新在前），
 *     与官方 inverted FlatList 一致；
 *  4. **offset 语义在全工程范围内颠倒**：scrollChatToBottom / chatDistanceFromBottom /
 *     进场动画（ChatArea.tsx 的 playEntryScroll 要手动「先跳视觉顶部再滚回 0」）
 *     —— 每处读到 offset 都要先问一句「这是哪个坐标系」，这是持续的认知税。
 *
 * 两端分叉的维护成本（Web 走 scrollTop、原生走 inverted）：
 *   换来：各端用各自最便宜的正确机制，Web 零风险（它本来就不抖）；
 *   付出：每次改聊天滚动都要在**两端各想一遍**，没有「改一处两端都对」的路径。
 *
 * 证伪条件（满足其中任意一条，上面这些取舍就得重新算）：
 *  1. 升级 RN/Expo → 回来核对 VirtualizedList.js 的 `verticallyInverted` 有没有变、
 *     两层 transform 是否仍然生效；
 *  2. 为了长会话上虚拟化而改成 FlatList → 必须**整条换回官方 inverted**
 *     （反转 data + 撤掉这里两层 transform + 改用 CellRendererComponent），
 *     不能与现状混用：混用 = 双重镜像 / 锚点错头；
 *  3. 真机反馈「一跳一跳」→ 降 useChatManager.ts 的 CATCH_UP_RAMP（先别动其它参数）；
 *  4. Web 长会话出现卡顿 → 那时才值得重估 Web 是否也 inverted。
 */
export const INVERTED_CHAT_LIST = Platform.OS !== 'web';

/**
 * 思考框滚到边界后是否联动外层聊天列表滚动（scroll chaining）。代码里一键开关：
 *  - true  = 放开：内层滚到顶/底后继续拖，外层聊天列表跟着滚；
 *  - false = 贴边锁死：内层怎么滚都不带动外层。
 */
export const THOUGHT_EDGE_SCROLL_ENABLED = false;

/**
 * 翻转视图用的 transform。
 * Android 与 RN 自带实现保持一致用 `scale: -1`（X/Y 都翻，两层叠加即抵消水平方向），
 * iOS 用 `scaleY: -1`。
 */
export const CHAT_INVERSION_STYLE: ViewStyle = {
  transform: [Platform.OS === 'android' ? { scale: -1 } : { scaleY: -1 }],
};

/**
 * 逐条 cell 翻转样式（模拟 RN inverted FlatList 的 CellRenderer 逻辑）。
 * ScrollView 翻一次 + 每个 cell 翻一次 = 两次抵消 → cell 内部坐标系正常。
 * flexDirection: 'column-reverse' 让 cell 内部的布局方向也翻转回来。
 */
export const CELL_INVERSION_STYLE: ViewStyle = {
  ...(Platform.OS === 'android'
    ? { transform: [{ scale: -1 }] }
    : { transform: [{ scaleY: -1 }] }),
  flexDirection: 'column-reverse',
};

/**
 * 滚到「视觉底部」：
 * - 原生 inverted ScrollView：offset 0 就是底部，`scrollTo({ y: 0 })`；
 * - Web：继续用 react-native-web 的 `scrollToEnd`（内部读 scrollHeight，行为不变）。
 */
export function scrollChatToBottom(ref: any, animated = false): void {
  if (!ref) return;
  if (INVERTED_CHAT_LIST) {
    ref.scrollTo?.({ x: 0, y: 0, animated });
    return;
  }
  const node =
    typeof ref.getScrollableNode === 'function'
      ? ref.getScrollableNode()
      : null;
  if (!node) return;
  ref.scrollToEnd?.({ animated });
}

/**
 * 从 onScroll 事件里算「离视觉底部还有多少像素」。
 * - 原生 inverted：offset 0 = 底部，离底距离就是 `contentOffset.y` 本身；
 * - 普通列表 / Web：`contentSize - viewport - offset`。
 */
export function chatDistanceFromBottom(nativeEvent: any): number {
  const { contentOffset, contentSize, layoutMeasurement } = nativeEvent || {};
  if (!contentOffset) return 0;
  if (INVERTED_CHAT_LIST) return contentOffset.y;
  const viewport = layoutMeasurement?.height ?? 0;
  const content = contentSize?.height ?? 0;
  return content - viewport - contentOffset.y;
}
