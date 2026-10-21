import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

/**
 * 聊天列表滚动策略：两端都不用 inverted（翻转），统一「旧→新、上→下」普通顺序。
 *
 * - WEB：发送/吐字期间自动吸底（标准聊天体验）。
 * - APP：吐字期间**不自动吸底**，把刚发送的用户消息钉在视口顶部，
 *   AI 回答在其下方流式增长，用户手动滚动查看完整内容（见 APP_PIN_USER_MESSAGE）。
 *
 * 历史背景：曾经原生端用 inverted（transform scale -1）来换取「吐字期零滚动命令」，
 * 但坐标语义反转带来持续的认知成本（offset 0 = 底部、data 需反转、cell 需再翻一次），
 * 现在改为普通顺序 + 程序化滚动，两端共享一套坐标系。
 */
export const INVERTED_CHAT_LIST = false;

/**
 * 思考框滚到边界后是否联动外层聊天列表滚动（scroll chaining）。代码里一键开关：
 *  - true  = 放开：内层滚到顶/底后继续拖，外层聊天列表跟着滚；
 *  - false = 贴边锁死：内层怎么滚都不带动外层。
 */
/**
 * APP 端「钉顶」模式：流式吐字期间不自动吸底，把刚发送的用户消息钉在视口顶部，
 * AI 回答在下方增长（用户手动滚动查看完整内容）。WEB 端保持自动吸底，不动。
 */
export const APP_PIN_USER_MESSAGE = Platform.OS !== 'web';

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
